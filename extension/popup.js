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
  $("version").textContent = `v${browser.runtime.getManifest().version}`;

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

  if (!res) {
    setStatus(`${host} — no site rule, 0 hidden`);
    return;
  }

  const displayHost = host.replace(/^w{2,3}\d*\./i, "");
  const match = res.matchedKey
    ? res.matchedKey === displayHost
      ? "site rule"
      : `site rule (${res.matchedKey})`
    : "no site rule";
  const count = res.count > 0 ? `${res.count} hidden` : "0 hidden";
  setStatus(`${displayHost} — ${match}, ${count}`);
})();
