const defaults = { searchEnabled: true, hideSearchAds: true, guestSearch: false };
const status = document.querySelector("#settings-status");
const controls = Object.fromEntries(Object.keys(defaults).map(key => [key, document.getElementById(key)]));
for (const control of Object.values(controls)) control.disabled = true;

async function initialize() {
  const settings = await chrome.storage.local.get(defaults);
  for (const [key, control] of Object.entries(controls)) {
    control.checked = settings[key]; control.disabled = false;
    control.addEventListener("change", async () => {
      const before = !control.checked;
      control.disabled = true;
      try {
        if (key === "guestSearch") {
          const result = await chrome.runtime.sendMessage({ type: "bnc:set-guest", enabled: control.checked });
          if (!result?.ok) throw new Error(result?.error || "游客搜索设置未生效");
          status.textContent = "已保存，请刷新搜索页。";
        } else {
          await chrome.storage.local.set({ [key]: control.checked });
          status.textContent = "已保存，打开的搜索页会同步更新。";
        }
      } catch (error) {
        control.checked = before;
        status.textContent = `未能保存：${error.message}`;
      } finally { control.disabled = false; }
    });
  }
}
initialize().catch(error => { status.textContent = `无法读取设置：${error.message}`; });
