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

  const style = document.createElement("style");
  style.textContent = `${selectors.join(",\n")} { display: none !important; }`;
  (document.head || document.documentElement).appendChild(style);
})();
