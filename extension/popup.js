const REPO = "https://github.com/rcurranmoz/crumb";
const $ = (id) => document.getElementById(id);

const setStatus = (text) => {
  $("status").textContent = text;
};

const reportLink = (host, url) => {
  const title = `Cookie banner not hidden on ${host}`;
  const body = `URL: ${url}\n\nDescribe what you see (banner still visible, broken layout, etc.):\n`;
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
};

(async () => {
  const v = browser.runtime.getManifest().version;
  const versionEl = $("version");
  versionEl.textContent = `v${v}`;
  versionEl.href = `https://github.com/rcurranmoz/crumb/releases/tag/v${v}`;

  const autoRejectEl = $("autoReject");
  const { autoReject } = await browser.storage.local.get("autoReject");
  autoRejectEl.checked = Boolean(autoReject);
  autoRejectEl.addEventListener("change", () => {
    browser.storage.local.set({ autoReject: autoRejectEl.checked });
  });

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
    setStatus("Crumb only runs on web pages.");
    $("report").style.display = "none";
    return;
  }

  let host;
  try {
    host = new URL(tab.url).hostname;
  } catch {
    host = tab.url;
  }

  $("report").href = reportLink(host, tab.url);

  let res;
  try {
    res = await browser.tabs.sendMessage(tab.id, { type: "crumb:status" });
  } catch {
    setStatus(`${host} — page still loading`);
    return;
  }

  const displayHost = host.replace(/^w{2,3}\d*\./i, "");
  const match = res.matchedKey
    ? res.matchedKey.replace(/^w{2,3}\d*\./i, "") === displayHost
      ? "site rule"
      : `site rule (${res.matchedKey})`
    : res.count > 0
      ? "generic rule"
      : "no rule matched";
  const count = res.count > 0 ? `${res.count} hidden` : "0 hidden";
  setStatus(`${displayHost} — ${match}, ${count}`);
})();
