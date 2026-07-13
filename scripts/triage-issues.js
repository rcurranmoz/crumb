#!/usr/bin/env node
// Deterministic (no LLM) triage for the "cookie banner not hidden on X" issue
// template: URL + a pasted HTML snippet of the banner element. Picks a stable
// selector, adds a data/site-specific.txt rule, bumps the version, and opens
// a PR for human review. Used by .github/workflows/triage.yml every 48h.
//
// Anything that doesn't fit the template cleanly is left alone — this script
// never guesses at ambiguous markup or forces a fix.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Known hard problems the maintainer wants handled manually, never by the bot
// (see issue #13 — badge-detection limitation, and #15 — Shadow DOM piercing).
const EXCLUDED_ISSUES = new Set([13, 15]);

const BOT_MARKER = "🤖 automated triage";
const SITE_SPECIFIC_PATH = "data/site-specific.txt";
const MANIFEST_PATH = "extension/manifest.json";
const SAFARI_MARKER = "! Safari exclude rules are too coarse";

// Classnames that are build-generated (scoped-style hashes, CSS-in-JS, etc.)
// and will churn across deploys — never usable as a stable selector.
const UNSTABLE_CLASS_RE =
  /^(astro-|css-|sc-|jsx-|emotion-|styled-|_[a-z0-9]{5,}$|[a-z]{1,3}-[0-9a-f]{6,}$)/i;

// CSS-module output, which the rule above misses: `CookieConsent_cookieConsent__pIj_y`
// and `_cookie-consent_tpc72_1`. The hash suffix changes on every build. incogni.com
// (#58) proves this churns for real: fanboy still carries a DEAD rule for that exact
// element from an older hash of the same class.
const CSS_MODULE_RE = /__[A-Za-z0-9_-]{4,}$|^_[A-Za-z0-9-]+_[a-z0-9]{4,}/;

// A class is only trustworthy as a cookie-banner hook if it actually names the
// thing. This is what separates `.page-cookie-container` (#59, correct) from
// `.fixed` (#57 — a Tailwind utility meaning `position: fixed`, which would have
// hidden every fixed-positioned element on the site: nav, modals, tooltips).
// If no class names the banner, we bail to a human rather than guess.
const CONSENT_WORD_RE = /(cookie|consent|gdpr|privacy|cmp|ccpa)/i;

// Ids ending in a long digit run are almost always per-render generated
// (React/Vue/Radix aria-linking ids, etc.) — not stable across page loads.
const UNSTABLE_ID_RE = /-\d{5,}$/;

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...opts });

const ghJson = (args) => JSON.parse(sh("gh", args));

const bumpPatch = (version) => {
  const parts = version.split(".").map(Number);
  parts[2] += 1;
  return parts.join(".");
};

// Reporters paste the banner element they inspected as the root of the
// snippet — only that root's own attributes are trustworthy. Matching id/class
// anywhere in the body would just as happily grab a nested heading or button.
const firstTag = (body) => {
  const match = body.match(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/);
  return match ? { tag: match[1].toLowerCase(), attrs: match[2] } : null;
};

const attr = (attrs, name) => {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  const value = match?.[1].trim();
  // A value containing a quote or backslash would break out of the selector
  // string we build from it. Vanishingly rare; not worth escaping, worth refusing.
  return value && !/["\\]/.test(value) ? value : null;
};

// Priority ladder. Every rule we hand-wrote for the #46–#62 batch came from a
// SEMANTIC attribute (role / aria-label / aria-labelledby / data-testid), and the
// two the bot got wrong (#60, #63 — both closed unmerged) came from reaching for a
// class. So attributes first, classes last and only when the class names the banner.
//
// Returning null is a good outcome: main() then comments "needs a manual look"
// rather than opening a PR. A no-op selector wastes a review; a wrong one ships a
// broken page.
const pickSelector = (body) => {
  const root = firstTag(body);
  if (!root) return null;
  const { tag, attrs } = root;

  const id = attr(attrs, "id");
  if (id && /^[a-zA-Z][\w-]*$/.test(id) && !UNSTABLE_ID_RE.test(id)) {
    return `#${id}`;
  }

  // Test hooks exist to be stable, and unlike aria-label they don't move with
  // the site's copy or locale.
  const testId = attr(attrs, "data-testid");
  if (testId) return `${tag}[data-testid="${testId}"]`;

  const role = attr(attrs, "role");
  const label = attr(attrs, "aria-label");
  if (role && label) return `${tag}[role="${role}"][aria-label="${label}"]`;

  const labelledBy = attr(attrs, "aria-labelledby");
  if (role && labelledBy && !UNSTABLE_ID_RE.test(labelledBy)) {
    return `${tag}[role="${role}"][aria-labelledby="${labelledBy}"]`;
  }

  if (label) return `${tag}[aria-label="${label}"]`;

  const classes = attr(attrs, "class");
  if (classes) {
    const candidate = classes
      .split(/\s+/)
      .find(
        (c) =>
          c &&
          !UNSTABLE_CLASS_RE.test(c) &&
          !CSS_MODULE_RE.test(c) &&
          CONSENT_WORD_RE.test(c),
      );
    if (candidate) return `.${candidate}`;
  }
  return null;
};

const extractHostname = (body) => {
  const urlMatch = body.match(/URL:\s*(\S+)/);
  if (!urlMatch) return null;
  try {
    return new URL(urlMatch[1]).hostname;
  } catch {
    return null;
  }
};

const alreadyHandled = (comments) =>
  comments.some((c) => c.body.includes(BOT_MARKER));

const addSiteRule = (hostname, selector) => {
  const content = readFileSync(SITE_SPECIFIC_PATH, "utf8");
  const lines = content.split("\n");
  const markerIdx = lines.findIndex((l) => l.includes(SAFARI_MARKER));
  const rule = `${hostname}##${selector}`;
  const insertIdx =
    markerIdx > 0 && lines[markerIdx - 1] === "" ? markerIdx - 1 : markerIdx;
  lines.splice(insertIdx === -1 ? lines.length : insertIdx, 0, rule);
  writeFileSync(SITE_SPECIFIC_PATH, lines.join("\n"));
  return rule;
};

const bumpManifestVersion = () => {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const newVersion = bumpPatch(JSON.parse(raw).version);
  // Replace only the version string. Re-serializing with JSON.stringify would
  // reflow the whole file (every compact array exploded onto its own lines),
  // burying the one-line change under a noisy hand-formatting diff.
  const updated = raw.replace(
    /("version"\s*:\s*)"[^"]+"/,
    (_, prefix) => `${prefix}"${newVersion}"`,
  );
  if (updated === raw) {
    throw new Error(`could not find "version" to bump in ${MANIFEST_PATH}`);
  }
  writeFileSync(MANIFEST_PATH, updated);
  return newVersion;
};

const revert = () => sh("git", ["checkout", "--", SITE_SPECIFIC_PATH, MANIFEST_PATH]);

const commentBotSeen = (num, text) => sh("gh", ["issue", "comment", String(num), "--body", `${BOT_MARKER}\n\n${text}`]);

const main = () => {
  const issues = ghJson([
    "issue", "list",
    "--state", "open",
    "--search", "\"Cookie banner not hidden on\" in:title",
    "--json", "number,title,body",
    "--limit", "100",
  ]).sort((a, b) => a.number - b.number);

  for (const issue of issues) {
    if (EXCLUDED_ISSUES.has(issue.number)) continue;

    const { comments } = ghJson([
      "issue", "view", String(issue.number), "--json", "comments",
    ]);
    if (alreadyHandled(comments)) continue;

    // Skip if there's already an open PR referencing this issue.
    const openPrs = ghJson([
      "pr", "list", "--state", "open", "--json", "title,body",
    ]);
    if (openPrs.some((pr) => (pr.title + pr.body).includes(`#${issue.number}`))) {
      continue;
    }

    const hostname = extractHostname(issue.body);
    const selector = pickSelector(issue.body);

    if (!hostname || !selector) {
      console.log(`#${issue.number}: couldn't extract hostname/selector, skipping`);
      commentBotSeen(
        issue.number,
        "Couldn't find a stable `id`/`class` (or a parseable `URL:` line) in the pasted markup — needs a manual look.",
      );
      continue;
    }

    // Already fixed but issue not yet closed (e.g. merged PR hasn't landed the
    // auto-close, or someone fixed it by hand)?
    const existing = readFileSync(SITE_SPECIFIC_PATH, "utf8");
    if (existing.includes(hostname)) {
      console.log(`#${issue.number}: ${hostname} already has a rule, skipping`);
      continue;
    }

    console.log(`#${issue.number}: ${hostname} -> ${selector}`);
    const rule = addSiteRule(hostname, selector);
    const newVersion = bumpManifestVersion();

    try {
      sh("npm", ["run", "build"], { stdio: "inherit" });
      sh("npm", ["test"], { stdio: "inherit" });
      sh("npm", ["run", "lint"], { stdio: "inherit" });
    } catch (e) {
      console.log(`#${issue.number}: build/test/lint failed, reverting`);
      revert();
      commentBotSeen(
        issue.number,
        `Generated selector \`${selector}\` for \`${hostname}\` but it failed \`npm run build/test/lint\` — needs a manual look.`,
      );
      continue;
    }

    const branch = `bot/fix-issue-${issue.number}`;
    // -B (not -b) so a leftover local branch from a prior run is reset, not a
    // fatal "branch already exists".
    sh("git", ["checkout", "-B", branch]);
    sh("git", ["add", SITE_SPECIFIC_PATH, MANIFEST_PATH]);
    sh("git", [
      "commit", "-m",
      `Hide cookie banner on ${hostname} (fixes #${issue.number})\n\n` +
      `Adds \`${rule}\` to data/site-specific.txt from the markup pasted in the issue.\n\n` +
      `Bump version to ${newVersion} so the merge auto-deploys to AMO via release.yml.\n\n` +
      `Fully automated by scripts/triage-issues.js — no LLM involved. Please verify\n` +
      `the selector against the live page before merging.`,
    ]);
    // --force so an orphan branch from a run that died between push and
    // pr-create (see #47) gets overwritten instead of rejecting a non-fast-
    // forward push. Safe: bot/* branches are exclusively bot-owned and always
    // regenerated from scratch. (--force-with-lease can't be used — checkout@v4
    // only fetches main, so there's no remote-tracking ref to lease against.)
    sh("git", ["push", "-u", "--force", "origin", branch]);
    sh("gh", [
      "pr", "create",
      "--title", `Hide cookie banner on ${hostname}`,
      "--body",
      `Automated fix for #${issue.number} by \`scripts/triage-issues.js\` (deterministic, no LLM).\n\n` +
      `- Adds \`${rule}\` to \`data/site-specific.txt\`\n` +
      `- Bumps version to \`${newVersion}\`\n` +
      `- \`npm run build/test/lint\` all passed\n\n` +
      `**Please verify the selector against the live page before merging** — this ` +
      `was picked heuristically (first stable id, or class, in the pasted markup) ` +
      `and hasn't been checked against the actual rendered page.`,
    ]);
    commentBotSeen(issue.number, `Opened a fix PR: see the linked pull request above.`);

    sh("git", ["checkout", "main"]);
    // One issue per run — keeps branch/PR state simple and gives a human a
    // steady, reviewable trickle instead of a batch to rubber-stamp.
    return;
  }

  console.log("Nothing to do.");
};

export { pickSelector, extractHostname, bumpPatch };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
