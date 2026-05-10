(() => {
  const map = globalThis.__crumbCosmetic;
  if (!map) return;

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

  const send = (count) => {
    if (count <= maxCount) return;
    maxCount = count;
    try {
      browser.runtime.sendMessage({ type: "crumb:count", count });
    } catch {}
  };

  // Count generic matches once at load — the megaquery (~15k selectors) is too
  // expensive to re-run on every DOM mutation.
  let genericCount = 0;
  if (genericRule) {
    try {
      genericCount = document.querySelectorAll(genericRule).length;
    } catch {}
    send(genericCount);
  }

  // Domain-specific selectors are few; re-run on mutations to catch late injection.
  if (domainSelectors.length) {
    const domainJoined = domainSelectors.join(",\n");
    let timer;
    const report = () => {
      let count;
      try {
        count = document.querySelectorAll(domainJoined).length;
      } catch {
        return;
      }
      send(genericCount + count);
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
