// Tests for the one ARIA-based generic rule in data/generic.txt.
//
// Generic rules run on every page for every user, so this one is worth pinning
// down: it is the only selector in the list that matches on a *pattern* rather
// than a literal id or class, which is what gives it reach and what makes an
// accidental broadening dangerous.
//
// These tests read the rule out of data/generic.txt and derive their matcher
// from it, rather than hardcoding the predicate. So loosening the rule — dropping
// the role gate, swapping "cookie" for "consent" — makes the negative cases below
// start matching and fails CI, which is the whole point.
//
// What this does NOT test is Firefox's own CSS matching. The corpus below is
// real markup from real reports, but the authority on whether the selector fires
// is a browser. See the PR for the manual-verification note.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAll } from "../scripts/src/parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const GENERIC_TXT = readFileSync(
  resolve(__dirname, "../data/generic.txt"),
  "utf8",
);

// The rule under test: the only generic selector keying on aria-label.
const ariaRules = parseAll(GENERIC_TXT).filter(
  (r) => r.kind === "hide" && /aria-label/.test(r.selector),
);

// Pull the role list and the required label substring back out of the selector,
// so the matcher below is driven by the rule rather than a copy of it.
const readSelector = (selector) => {
  const roles = [...selector.matchAll(/\[role="([^"]+)"\]/g)].map((m) => m[1]);
  const label = selector.match(/\[aria-label\*="([^"]+)"(\s+i)?\]/);
  return {
    roles,
    needle: label?.[1] ?? null,
    caseInsensitive: Boolean(label?.[2]),
  };
};

// Stands in for CSS matching: an element matches if its role is one the rule
// gates on AND its aria-label contains the required substring.
const matches = (rule, el) => {
  if (!rule.needle) return false;
  if (!rule.roles.includes(el.role)) return false;
  const label = el["aria-label"] ?? "";
  return rule.caseInsensitive
    ? label.toLowerCase().includes(rule.needle.toLowerCase())
    : label.includes(rule.needle);
};

test("data/generic.txt carries exactly one aria-label rule", () => {
  assert.equal(
    ariaRules.length,
    1,
    "a second pattern rule needs its own tests and its own budget justification",
  );
});

test("the aria rule is generic, not domain-scoped", () => {
  // A stray domain prefix would silently drop it out of generic.css and into a
  // single site's bucket, quietly undoing the whole point of the rule.
  assert.deepEqual(ariaRules[0].domains, []);
});

test("the aria rule survives the parser intact", () => {
  // `:is()` and the case-insensitive `i` attribute flag are the only uses of
  // either in the whole list, so they are worth a guard: a parser change that
  // mangles them would degrade this to a no-op with no other test failing.
  const { selector } = ariaRules[0];
  assert.match(selector, /^:is\(/, "role gate must survive");
  assert.match(selector, /\[aria-label\*="[^"]+"\s+i\]/, "the i flag must survive");
});

// ---------------------------------------------------------------------------
// The corpus. Every positive is the banner root exactly as pasted into its
// issue — these are the 7 reports the rule is meant to have preempted.
// ---------------------------------------------------------------------------

const REPORTED_BANNERS = [
  { issue: 42, site: "lovable.dev", role: "region", "aria-label": "Cookie banner" },
  { issue: 43, site: "letsdatascience.com", role: "region", "aria-label": "Cookie consent" },
  { issue: 46, site: "x.com", role: "region", "aria-label": "Cookie consent" },
  { issue: 47, site: "jamdesk.com", role: "region", "aria-label": "Cookie consent" },
  { issue: 57, site: "pocketpal.dev", role: "dialog", "aria-label": "Cookie consent" },
  { issue: 68, site: "socradar.io", role: "dialog", "aria-label": "Cookie consent" },
  { issue: 73, site: "st-andrews.ac.uk", role: "region", "aria-label": "Cookie preferences" },
];

for (const banner of REPORTED_BANNERS) {
  test(`matches the ${banner.site} banner (#${banner.issue})`, () => {
    assert.ok(
      matches(readSelector(ariaRules[0].selector), banner),
      `#${banner.issue} needed a hand-written site rule; this rule should preempt it`,
    );
  });
}

// ---------------------------------------------------------------------------
// The negatives are the reason the rule is shaped the way it is. Each one is a
// thing that would break if the rule were written the obvious lazy way.
// ---------------------------------------------------------------------------

const MUST_NOT_MATCH = [
  {
    why: "a page's own content region",
    el: { role: "region", "aria-label": "Main content" },
  },
  {
    why: "an ordinary application dialog",
    el: { role: "dialog", "aria-label": "Sign in" },
  },
  {
    why: "a medical or legal consent form — why the rule requires 'cookie', not 'consent'",
    el: { role: "region", "aria-label": "Patient consent" },
  },
  {
    why: "a footer cookie-policy link with no role — why the role gate exists",
    el: { role: undefined, "aria-label": "Cookie policy" },
  },
  {
    why: "a nav landmark, outside the gated role list",
    el: { role: "navigation", "aria-label": "Cookie settings" },
  },
  {
    why: "a labelled region with no aria-label at all",
    el: { role: "region", "aria-label": undefined },
  },
];

for (const { why, el } of MUST_NOT_MATCH) {
  test(`does not match ${why}`, () => {
    assert.equal(
      matches(readSelector(ariaRules[0].selector), el),
      false,
      "the rule runs on every page — a false positive here breaks real sites",
    );
  });
}

test("label matching is case-insensitive", () => {
  // Authors capitalize inconsistently ("Cookie consent", "COOKIE CONSENT",
  // "cookie banner"); the `i` flag is what makes one rule cover all of them.
  assert.ok(
    matches(readSelector(ariaRules[0].selector), {
      role: "dialog",
      "aria-label": "COOKIE CONSENT",
    }),
  );
});
