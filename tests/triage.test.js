// Tests for the auto-triage bot's selector heuristic.
//
// Every case below is the REAL markup pasted into a real issue, and the expected
// selector is the one we hand-wrote and verified live in Firefox. So this suite
// asks the only question that matters: on the batch we just did by hand, would
// the bot have got it right on its own?
//
// The two it previously got wrong (PRs #60 and #63, both closed unmerged rather
// than shipped) are pinned as explicit regression tests.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { pickSelector } from "../scripts/triage-issues.js";

// Reporters paste an issue body, not a bare tag; pickSelector reads the first tag.
const issue = (html) => `URL: https://example.com/\n\nCookie banner.\n\n${html}`;

// ---------------------------------------------------------------------------
// The #46–#62 batch. Expected values are the rules that actually shipped.
// ---------------------------------------------------------------------------

test("#57 pocketpal.dev: role + aria-label, NOT the .fixed utility class", () => {
  const html = `<div role="dialog" aria-label="Cookie consent" class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface transition-transform duration-300 ease-out translate-y-0">`;
  assert.equal(
    pickSelector(issue(html)),
    'div[role="dialog"][aria-label="Cookie consent"]',
  );
});

test("#58 incogni.com: data-testid, NOT the CSS-module hash", () => {
  const html = `<aside class="CookieConsent_cookieConsent__pIj_y CookieConsent_newFlow__TQTox" data-expanded="false" data-testid="cookie-consent-wrapper">`;
  assert.equal(
    pickSelector(issue(html)),
    'aside[data-testid="cookie-consent-wrapper"]',
  );
});

test("#59 tatanexarc.com: a class that actually names the banner", () => {
  const html = `<div class="page-cookie-container" style="display: block;">`;
  assert.equal(pickSelector(issue(html)), ".page-cookie-container");
});

test("#61 frigade.com: role + aria-labelledby when there's no aria-label", () => {
  const html = `<div role="dialog" aria-labelledby="consent-banner-heading" class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4">`;
  assert.equal(
    pickSelector(issue(html)),
    'div[role="dialog"][aria-labelledby="consent-banner-heading"]',
  );
});

test("#48 moxiedocs.com: aria-label alone, with no role", () => {
  const html = `<section aria-label="Privacy preferences" class="mx-auto flex max-w-3xl flex-col gap-4">`;
  assert.equal(
    pickSelector(issue(html)),
    'section[aria-label="Privacy preferences"]',
  );
});

test("#46 x.com: role + aria-label on a region", () => {
  const html = `<div role="region" aria-label="Cookie consent" class="css-175oi2r r-1p0dtai r-1d2f490">`;
  assert.equal(
    pickSelector(issue(html)),
    'div[role="region"][aria-label="Cookie consent"]',
  );
});

test("a stable id still wins outright", () => {
  const html = `<div id="cmpbox" role="dialog" class="cmpbox cmpstyleroot">`;
  assert.equal(pickSelector(issue(html)), "#cmpbox");
});

// ---------------------------------------------------------------------------
// Regressions: the two the bot actually got wrong and would have shipped.
// ---------------------------------------------------------------------------

test("never returns a bare utility class like .fixed (PR #60)", () => {
  // `.fixed` is Tailwind for `position: fixed`. As a hide rule it takes out every
  // fixed-positioned element on the site — nav, modals, tooltips.
  const html = `<div class="fixed inset-x-0 bottom-0 z-40 border-t bg-surface">`;
  const selector = pickSelector(issue(html));
  assert.notEqual(selector, ".fixed");
  assert.equal(
    selector,
    null,
    "with no semantic hook and no consent-named class, the bot must bail to a human",
  );
});

test("never returns a CSS-module hash (PR #63)", () => {
  const html = `<aside class="CookieConsent_cookieConsent__pIj_y CookieConsent_newFlow__TQTox">`;
  assert.equal(
    pickSelector(issue(html)),
    null,
    "the __hash suffix churns every deploy — fanboy already carries a dead rule for this exact element",
  );
});

test("never returns the older CSS-module shape either", () => {
  const html = `<div class="_cookie-consent_tpc72_1">`;
  assert.equal(pickSelector(issue(html)), null);
});

// ---------------------------------------------------------------------------
// Bailing out is a feature: main() comments "needs a manual look" on null.
// ---------------------------------------------------------------------------

test("bails on a per-render id rather than using it", () => {
  const html = `<div id="radix-dialog-284917">`;
  assert.equal(pickSelector(issue(html)), null);
});

test("bails on a per-render aria-labelledby target", () => {
  const html = `<div role="dialog" aria-labelledby="radix-heading-193024">`;
  assert.equal(pickSelector(issue(html)), null);
});

test("bails when there is no markup at all", () => {
  assert.equal(pickSelector("URL: https://example.com/\n\nNo snippet."), null);
});
