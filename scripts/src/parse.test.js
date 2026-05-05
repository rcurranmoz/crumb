import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseLine } from "./parse.js";

test("skips comments and headers", () => {
  assert.equal(parseLine("! a comment"), null);
  assert.equal(parseLine("[Adblock Plus 2.0]"), null);
  assert.equal(parseLine(""), null);
});

test("parses generic element-hide", () => {
  const r = parseLine("###privacy-policy-banner");
  assert.deepEqual(r, {
    kind: "hide",
    domains: [],
    selector: "#privacy-policy-banner",
  });
});

test("parses domain-scoped element-hide", () => {
  const r = parseLine("nytimes.com##.gdpr");
  assert.deepEqual(r, {
    kind: "hide",
    domains: ["nytimes.com"],
    selector: ".gdpr",
  });
});

test("splits multi-domain element-hide", () => {
  const r = parseLine("a.com,b.com##.banner");
  assert.deepEqual(r.domains, ["a.com", "b.com"]);
});

test("drops pure-exclusion element-hide rules", () => {
  assert.equal(parseLine("~exempt.com##.banner"), null);
});

test("strips exclusion domains from mixed list", () => {
  const r = parseLine("a.com,~b.com##.banner");
  assert.deepEqual(r.domains, ["a.com"]);
});

test("parses element-hide exception", () => {
  const r = parseLine("nytimes.com#@#.gdpr");
  assert.equal(r.kind, "hide-exception");
  assert.deepEqual(r.domains, ["nytimes.com"]);
  assert.equal(r.selector, ".gdpr");
});

test("parses simple network block with domain anchor", () => {
  const r = parseLine("||sourcepointcmp.bloomberg.com$script");
  assert.equal(r.kind, "network");
  assert.equal(r.action.type, "block");
  assert.equal(r.condition.urlFilter, "||sourcepointcmp.bloomberg.com");
  assert.deepEqual(r.condition.resourceTypes, ["script"]);
});

test("network block with $domain= maps to initiatorDomains", () => {
  const r = parseLine("/wrapperMessagingWithoutDetection.js$domain=n-tv.de");
  assert.deepEqual(r.condition.initiatorDomains, ["n-tv.de"]);
});

test("network block with mixed domains splits include/exclude", () => {
  const r = parseLine("||x.com$domain=a.com|~b.com");
  assert.deepEqual(r.condition.initiatorDomains, ["a.com"]);
  assert.deepEqual(r.condition.excludedInitiatorDomains, ["b.com"]);
});

test("network block with $third-party maps to domainType", () => {
  const r = parseLine("||x.com$third-party");
  assert.equal(r.condition.domainType, "thirdParty");
});

test("$~third-party maps to firstParty", () => {
  const r = parseLine("||x.com$~third-party");
  assert.equal(r.condition.domainType, "firstParty");
});

test("@@ exception becomes allow action", () => {
  const r = parseLine("@@||x.com$script");
  assert.equal(r.action.type, "allow");
});

test("drops rules with unsupported options", () => {
  assert.equal(parseLine("||x.com$csp=script-src 'none'"), null);
  assert.equal(parseLine("||x.com$redirect=noop.js"), null);
});

test("drops rules with extended selectors", () => {
  assert.equal(parseLine("x.com#?#.banner:has(.cookie)"), null);
  assert.equal(parseLine("x.com#$#window.foo = bar;"), null);
});

test("subdocument maps to sub_frame; document maps to main_frame", () => {
  const sub = parseLine("||x.com$subdocument");
  assert.deepEqual(sub.condition.resourceTypes, ["sub_frame"]);
  const doc = parseLine("||x.com$document");
  assert.deepEqual(doc.condition.resourceTypes, ["main_frame"]);
});

test("excluded resource type uses excludedResourceTypes", () => {
  const r = parseLine("||x.com$~script");
  assert.deepEqual(r.condition.excludedResourceTypes, ["script"]);
  assert.equal(r.condition.resourceTypes, undefined);
});
