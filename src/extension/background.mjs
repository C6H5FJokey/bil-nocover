import { createGuestRules } from "../guest-rules.mjs";

let queue = Promise.resolve();
function applyGuestMode(enabled, persist = false) {
  const operation = queue.catch(() => {}).then(async () => {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [4101, 4102], addRules: createGuestRules(enabled),
    });
    if (persist) await chrome.storage.local.set({ guestSearch: enabled });
  });
  queue = operation;
  return operation;
}

async function restore() {
  const { guestSearch = false } = await chrome.storage.local.get("guestSearch");
  await applyGuestMode(guestSearch === true);
}
chrome.runtime.onInstalled.addListener(() => { restore().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { restore().catch(console.error); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "bnc:set-guest" || !sender.url?.startsWith(chrome.runtime.getURL(""))) return;
  applyGuestMode(message.enabled === true, true).then(
    () => respond({ ok: true }),
    error => respond({ ok: false, error: error.message }),
  );
  return true;
});
