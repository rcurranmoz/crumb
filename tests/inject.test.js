// Behavioural tests for extension/inject.js — the only code that runs on every
// page load for every user, and the file that caused #55 ("Crumb is slowing down
// Firefox"). Until now it had no tests at all, so CI would have gone green on
// that bug.
//
// These do NOT test rendering. They test the *work* inject.js does: which
// selectors it hands to querySelectorAll, how often, and whether it attaches a
// MutationObserver. Those are exactly the properties that regressed in #55, and
// every assertion here fails against the 0.1.17 code.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const INJECT = readFileSync(
  resolve(__dirname, "../extension/inject.js"),
  "utf8",
);

// Stands in for the real ~15k-selector generic rule. Only its identity matters:
// if this string ever reaches a querySelectorAll during a mutation, #55 is back.
const MEGAQUERY = "#generic-a,#generic-b";
const DOMAIN_RULE = ".site-banner";

// Minimal DOM stand-in. Every querySelectorAll — on the document OR on an
// element — records its selector, so a per-subtree megaquery is just as visible
// as a whole-document one.
const run = ({ hostname, cosmetic, readyState = "loading", source = INJECT }) => {
  const queries = [];
  const observers = [];
  const styles = [];
  const events = {};
  let pendingTimer = null;

  const makeEl = (tag = "div") => {
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      textContent: "",
      classList: { remove() {} },
      appendChild() {},
      matches: () => false,
      querySelectorAll: (sel) => {
        queries.push(sel);
        return [];
      },
    };
    if (tag === "style") styles.push(el);
    return el;
  };

  const document = {
    readyState,
    head: makeEl("head"),
    body: makeEl("body"),
    documentElement: makeEl("html"),
    createElement: makeEl,
    addEventListener: (name, fn) => ((events[name] ??= []).push(fn)),
    querySelectorAll: (sel) => {
      queries.push(sel);
      return [];
    },
  };

  const window = {
    addEventListener: (name, fn) => ((events[name] ??= []).push(fn)),
  };
  window.top = window;

  class FakeMutationObserver {
    constructor(cb) {
      this.cb = cb;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  }

  const sandbox = {
    __crumbCosmetic: cosmetic,
    location: { hostname },
    document,
    window,
    MutationObserver: FakeMutationObserver,
    browser: {
      runtime: { onMessage: { addListener() {} }, sendMessage() {} },
    },
    setTimeout: (fn) => ((pendingTimer = fn), 1),
    clearTimeout: () => (pendingTimer = null),
  };

  runInContext(source, createContext(sandbox));

  return {
    queries,
    observers,
    styleText: () => styles.map((s) => s.textContent).join("\n"),
    genericRuns: () => queries.filter((q) => q === MEGAQUERY).length,
    fire: (name) => (events[name] ?? []).forEach((fn) => fn()),
    // Deliver a mutation batch, then let the debounce timer fire.
    mutate: (nodes = [makeEl()]) => {
      for (const o of observers) o.cb([{ addedNodes: nodes }], o);
      if (pendingTimer) {
        const fn = pendingTimer;
        pendingTimer = null;
        fn();
      }
    },
    makeEl,
  };
};

// ---------------------------------------------------------------------------
// #55 regression guards. These are the whole point of this file.
// ---------------------------------------------------------------------------

test("#55: no MutationObserver on a page with no site-specific rule", () => {
  // The generic rule is present on EVERY page, so gating the observer on it
  // (`domainSelectors.length || genericRule`) attached one everywhere. On
  // mutation-heavy pages like GitHub that is what tripped Firefox's slow-script
  // warning. A page with no rule of its own must do no post-load work at all.
  const env = run({ hostname: "github.com", cosmetic: { "": MEGAQUERY } });
  assert.equal(
    env.observers.length,
    0,
    "attached a MutationObserver on a page with no site rule — this is #55",
  );
});

test("#55: the generic megaquery never runs on a mutation", () => {
  const env = run({
    hostname: "example.com",
    cosmetic: { "": MEGAQUERY, "example.com": DOMAIN_RULE },
  });
  env.fire("DOMContentLoaded");

  const before = env.genericRuns();
  env.mutate();
  env.mutate();

  assert.equal(
    env.genericRuns(),
    before,
    "re-ran the ~15k-selector megaquery on a mutation — this is #55",
  );
});

test("#55: the generic megaquery runs at most twice per page load", () => {
  // Budget: once at DOMContentLoaded, once at load. Anything more means it has
  // crept back onto a hot path.
  const env = run({ hostname: "github.com", cosmetic: { "": MEGAQUERY } });
  env.fire("DOMContentLoaded");
  env.fire("load");

  const n = env.genericRuns();
  assert.ok(n <= 2, `megaquery ran ${n}x; budget is 2 (DOMContentLoaded + load)`);
});

// ---------------------------------------------------------------------------
// The other half of the contract: the perf guards above must not be satisfied
// by simply doing nothing. Late-injected banners still have to be caught.
// ---------------------------------------------------------------------------

test("a site with a rule gets an observer, and it queries only the small selector", () => {
  const env = run({
    hostname: "example.com",
    cosmetic: { "": MEGAQUERY, "example.com": DOMAIN_RULE },
  });
  assert.equal(env.observers.length, 1, "late-injected banners need an observer");

  env.queries.length = 0;
  env.mutate();

  assert.ok(
    env.queries.includes(DOMAIN_RULE),
    "mutation should re-query the domain selector",
  );
  assert.ok(
    !env.queries.includes(MEGAQUERY),
    "mutation must never re-query the megaquery",
  );
});

test("domain rules are injected as display:none", () => {
  const env = run({
    hostname: "example.com",
    cosmetic: { "example.com": DOMAIN_RULE },
  });
  const css = env.styleText();
  assert.ok(css.includes(DOMAIN_RULE));
  assert.match(css, /display:\s*none\s*!important/);
});

// ---------------------------------------------------------------------------
// Hostname matching. tatanexarc.com (#59) and dw.com (#62) are keyed on the bare
// domain but reported on www., so this walk is load-bearing for real rules.
// ---------------------------------------------------------------------------

test("www. hostnames match a bare-domain rule", () => {
  const env = run({
    hostname: "www.example.com",
    cosmetic: { "example.com": DOMAIN_RULE },
  });
  assert.ok(
    env.styleText().includes(DOMAIN_RULE),
    "www.example.com must match the example.com rule",
  );
});

test("subdomains match a parent-domain rule", () => {
  const env = run({
    hostname: "shop.example.com",
    cosmetic: { "example.com": DOMAIN_RULE },
  });
  assert.ok(env.styleText().includes(DOMAIN_RULE));
});

test("an unrelated host matches nothing", () => {
  const env = run({
    hostname: "notexample.com",
    cosmetic: { "example.com": DOMAIN_RULE },
  });
  assert.equal(env.observers.length, 0);
  assert.equal(env.styleText(), "");
});
