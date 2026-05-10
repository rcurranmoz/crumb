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
  let lastCount = 0;

  if (isTop) {
    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.type !== "crumb:status") return;
      return Promise.resolve({
        host,
        matchedKey: matchedKeys[0] ?? null,
        count: lastCount,
      });
    });
  }

  // Build the combined selector list for counting (domain-specific + generic).
  const genericRule = map[""];
  const allSelectors = genericRule
    ? [...domainSelectors, genericRule]
    : domainSelectors;

  if (!allSelectors.length) return;

  if (domainSelectors.length) {
    const style = document.createElement("style");
    style.textContent = `${domainSelectors.join(",\n")} { display: none !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }

  const joined = allSelectors.join(",\n");

  // Only the top frame reports counts so the badge isn't stomped by subframes.
  if (!isTop) return;

  let maxCount = 0;
  const report = () => {
    let count;
    try {
      count = document.querySelectorAll(joined).length;
    } catch (e) {
      console.warn("[crumb] querySelectorAll threw:", e.message);
      return;
    }
    console.log("[crumb] report count:", count, "maxCount:", maxCount);
    if (count <= maxCount) return;
    maxCount = count;
    console.log("[crumb] sending badge:", count);
    try {
      browser.runtime.sendMessage({ type: "crumb:count", count });
    } catch (e) {
      console.warn("[crumb] sendMessage failed:", e.message);
    }
  };

  console.log("[crumb] observer set up, joined length:", joined.length);
  report();
  new MutationObserver(report).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
