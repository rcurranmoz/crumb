(async () => {
  const map = globalThis.__crumbAutoReject;
  if (!map) return;

  const host = location.hostname.toLowerCase();
  const selector = map[host];
  if (!selector) return;

  let enabled;
  try {
    ({ autoReject: enabled } = await browser.storage.local.get("autoReject"));
  } catch {
    return;
  }
  if (!enabled) return;

  const tryClick = () => {
    const btn = document.querySelector(selector);
    if (!btn) return false;
    btn.click();
    return true;
  };

  if (tryClick()) return;

  const observer = new MutationObserver(() => {
    if (tryClick()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // Consent portals that never render the expected button (redirect chain
  // expired, A/B layout, etc.) shouldn't leave an observer running forever.
  setTimeout(() => observer.disconnect(), 10000);
})();
