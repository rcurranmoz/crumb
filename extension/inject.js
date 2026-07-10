(() => {
  const map = globalThis.__crumbCosmetic;
  if (!map) return;

  // Classes CMPs put on <html>/<body> to lock the page while a consent message
  // is open. Stripped after we hide a banner so the page underneath is usable.
  const LOCK_CLASSES = ["sp-message-open"];

  const host = location.hostname.toLowerCase();
  if (!host) return;

  const matchedKeys = [];
  // Domain-specific selectors: injected as CSS + counted.
  // Generic selectors ("" key): counted only — generic.css already hides them.
  const domainSelectors = [];
  const seen = new Set();

  const collect = (key) => {
    const rule = map[key];
    if (!rule || seen.has(key)) return;
    seen.add(key);
    matchedKeys.push(key);
    domainSelectors.push(rule);
  };

  collect(host);
  // Strip leading "www." / "wwwN." then walk parent labels until two remain.
  const stripped = host.replace(/^w{2,3}\d*\./i, "");
  if (stripped !== host) collect(stripped);
  const parts = stripped.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    collect(parts.slice(i).join("."));
  }

  const isTop = window.top === window;
  let maxCount = 0;

  if (isTop) {
    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.type !== "crumb:status") return;
      return Promise.resolve({
        host,
        matchedKey: matchedKeys[0] ?? null,
        count: maxCount,
      });
    });
  }

  const genericRule = map[""];

  if (!domainSelectors.length && !genericRule) return;

  if (domainSelectors.length) {
    const style = document.createElement("style");
    style.textContent = `${domainSelectors.join(",\n")} { display: none !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }

  // Only the top frame reports counts so the badge isn't stomped by subframes.
  if (!isTop) return;

  let unlocked = false;
  const unlockBodyScroll = () => {
    if (unlocked) return;
    unlocked = true;
    // Banners often come with body { overflow: hidden } and a sticky position
    // hack to lock scroll. Once we've hidden a banner, restore scroll. Scoped
    // to "we matched something" so we don't fight legitimate modals on pages
    // where Crumb didn't fire.
    const undo = document.createElement("style");
    // pointer-events: some modal banners (Radix/Headless UI dialogs) set an
    // inline `pointer-events: none` on <body> while open; hiding the dialog
    // alone would leave the whole page unclickable.
    // :not(#crumb) is a no-op match that inflates specificity to id-level so
    // this beats class-scoped CMP scroll-locks like Sourcepoint's
    // `.sp-message-open body { position: fixed !important }` (issue #44).
    undo.textContent =
      "html:not(#crumb), body:not(#crumb) { overflow: auto !important; position: static !important; pointer-events: auto !important; }";
    (document.head || document.documentElement).appendChild(undo);

    // Some CMPs lock the page by adding a class to <html>/<body> that does more
    // than scroll-locking — Sourcepoint's `sp-message-open` also clamps <html>
    // to 100vh/100vw and hides the nav, blanking the article even after the
    // banner itself is hidden (issue #44). CSS can't reliably out-specify every
    // such rule, so once we've hidden a banner we strip the known lock classes.
    // This is page cleanup, not consent interaction (no accept/reject clicked).
    for (const cls of LOCK_CLASSES) {
      document.documentElement.classList.remove(cls);
      document.body?.classList.remove(cls);
    }
  };

  const send = (count) => {
    if (count <= maxCount) return;
    maxCount = count;
    if (count > 0) unlockBodyScroll();
    try {
      browser.runtime.sendMessage({ type: "crumb:count", count });
    } catch {}
  };

  // Generic hits are counted by identity so late injectors add to the total
  // without double-counting elements already seen (issue #13).
  const genericHits = new Set();
  let genericCount = 0;
  let domainCount = 0;
  const sendTotal = () => send(genericCount + domainCount);

  // Generic-rule elements are hidden by generic.css; here we only need to COUNT
  // them so the badge/popup reflect a generic hide instead of "no rule matched,
  // 0 hidden". Re-running the ~15k-selector megaquery over the whole document on
  // every mutation is too expensive, so scan the full document once when it's
  // parsed, then check only freshly-inserted subtrees. (These elements are
  // display:none, so a CSS-animation detector can't help — animations never
  // fire on display:none elements.)
  const countGenericIn = (root) => {
    if (!genericRule) return;
    let changed = false;
    const mark = (el) => {
      if (!genericHits.has(el)) {
        genericHits.add(el);
        changed = true;
      }
    };
    try {
      if (root.nodeType === 1 && root.matches(genericRule)) mark(root);
      for (const el of root.querySelectorAll(genericRule)) mark(el);
    } catch {
      return;
    }
    if (changed) {
      genericCount = genericHits.size;
      sendTotal();
    }
  };

  if (genericRule) {
    const scan = () => countGenericIn(document);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", scan, { once: true });
    } else {
      scan();
    }
    // Safety net for banners revealed between DOMContentLoaded and load.
    window.addEventListener("load", scan, { once: true });
  }

  // Watch for late insertion. Domain selectors are few, so re-query the whole
  // document; generic matches are scoped to the inserted subtrees so we never
  // re-run the megaquery over the entire page.
  if (domainSelectors.length || genericRule) {
    const domainJoined = domainSelectors.join(",\n");
    let timer;
    let pending = [];
    const flush = () => {
      if (domainSelectors.length) {
        try {
          domainCount = document.querySelectorAll(domainJoined).length;
          sendTotal();
        } catch {}
      }
      for (const node of pending) countGenericIn(node);
      pending = [];
    };
    const schedule = (records) => {
      if (genericRule) {
        for (const rec of records) {
          for (const node of rec.addedNodes) {
            if (node.nodeType === 1) pending.push(node);
          }
        }
      }
      clearTimeout(timer);
      timer = setTimeout(flush, 250);
    };
    if (domainSelectors.length) flush(); // initial domain count
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
