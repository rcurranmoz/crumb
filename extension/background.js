browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "crumb:count") return;
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  const count = Math.max(0, msg.count | 0);
  browser.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" });
  browser.action.setBadgeBackgroundColor({ tabId, color: "#3a8" });
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    browser.action.setBadgeText({ tabId, text: "" });
  }
});
