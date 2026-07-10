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

  let genericCount = 0;
  let domainCount = 0;
  const sendTotal = () => send(genericCount + domainCount);

  // Count generic matches after the DOM is parsed — at document_start it's
  // mostly empty, and the megaquery (~15k selectors) is too expensive to re-run
  // on every mutation. DOMContentLoaded covers most banners; the load event
  // catches late injectors.
  const recountGeneric = () => {
    if (!genericRule) return;
    try {
      const c = document.querySelectorAll(genericRule).length;
      if (c > genericCount) {
        genericCount = c;
        sendTotal();
      }
    } catch {}
  };

  if (genericRule) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", recountGeneric, { once: true });
    } else {
      recountGeneric();
    }
    window.addEventListener("load", recountGeneric, { once: true });
  }

  // Domain-specific selectors are few; re-run on mutations to catch late injection.
  if (domainSelectors.length) {
    const domainJoined = domainSelectors.join(",\n");
    let timer;
    const report = () => {
      let c;
      try {
        c = document.querySelectorAll(domainJoined).length;
      } catch {
        return;
      }
      domainCount = c;
      sendTotal();
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(report, 250);
    };
    report();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
