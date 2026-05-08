(() => {
  const map = globalThis.__crumbCosmetic;
  if (!map) return;

  const host = location.hostname.toLowerCase();
  if (!host) return;

  const selectors = [];
  const seen = new Set();

  const collect = (key) => {
    const rule = map[key];
    if (!rule || seen.has(key)) return;
    seen.add(key);
    selectors.push(rule);
  };

  collect(host);
  // Strip leading "www." / "wwwN." then walk parent labels until two remain.
  const stripped = host.replace(/^w{2,3}\d*\./i, "");
  if (stripped !== host) collect(stripped);
  const parts = stripped.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    collect(parts.slice(i).join("."));
  }

  if (!selectors.length) return;

  const joined = selectors.join(",\n");
  const style = document.createElement("style");
  style.textContent = `${joined} { display: none !important; }`;
  (document.head || document.documentElement).appendChild(style);

  // Only the top frame reports counts so the badge isn't stomped by subframes.
  if (window.top !== window) return;

  let lastCount = -1;
  const report = () => {
    let count;
    try {
      count = document.querySelectorAll(joined).length;
    } catch {
      return;
    }
    if (count === lastCount) return;
    lastCount = count;
    try {
      browser.runtime.sendMessage({ type: "crumb:count", count });
    } catch {}
  };

  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(report, 250);
  };

  report();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
