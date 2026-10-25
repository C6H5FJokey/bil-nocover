import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href)
  : await import("playwright");
const executablePath = process.env.BROWSER_EXECUTABLE || chromium.executablePath();
const extension = resolve(root, "dist/edge");
const errors = [];
const data = [
  { bvid: "BV1Match00001", title: "JavaScript 闭包入门", description: "作用域", tag: "编程", type: "video" },
  { bvid: "BV1Tag000001", title: "什么是闭包", description: "函数", tag: "前端,JavaScript", type: "video" },
  { bvid: "BV1Weak00001", title: "JavaScript 表格增删改查", description: "表格", tag: "前端", type: "video" },
  { bvid: "BV1Ad0000001", title: "JS 闭包推广", description: "", tag: "", type: "video_ad_82" },
  { bvid: "BV1AdRedirect", title: "推广跳转卡片", description: "", tag: "", type: "picture_ad_0", biz_data: { ad_content: { extra: { card: { jump_url: "https://store.example/product" } } } } },
];
const unknown = { bvid: "BV1Unknown01", title: "信息不完整的视频" };
const secondPage = [
  { bvid: "BV1Second001", title: "JS 闭包进阶", description: "作用域", tag: "", type: "video" },
  { bvid: "BV1Second002", title: "JavaScript 动画", description: "动画", tag: "", type: "video" },
];
const godotPage = [
  { bvid: "BV1Godot0001", title: "Godot 背包", description: "", tag: "", type: "video" },
  { bvid: "BV1Godot0002", title: "Godot 灯光", description: "", tag: "", type: "video" },
];
function card(item) {
  const destination = item.biz_data?.ad_content?.extra?.card?.jump_url;
  const attributes = destination ? `href="http://cm.bilibili.com/cm/api/fees/pc/sync/v2" data-target-url="${destination}"` : `href="http://www.bilibili.com/video/${item.bvid}/"`;
  return `<div class="col_3"><div class="bili-video-card" data-id="${item.bvid}"><a ${attributes}><h3>${item.title}</h3></a></div></div>`;
}
function visibleSnapshot() {
  return Object.fromEntries([...document.querySelectorAll(".bili-video-card")].map(el => [el.dataset.id,
    el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  ]));
}
function fixture() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>本地搜索回归测试</title></head><body>
    <form><input class="search-input-el" placeholder="推荐占位词" value="JavaScript 闭包"><button>搜索</button></form>
    <div class="video-list row" id="grid">${[...data, unknown].map(card).join("")}</div>
    <button id="next" type="button">下一页</button>
    <script>
      window.__pinia = { searchResponse: { searchAllResponse: { page: 1, result: [{result_type: 'video', data: ${JSON.stringify(data)}}] } } };
      window.cardMarkup = ${card.toString()};
      document.querySelector('#next').onclick = async () => {
        const url = new URL(location.href); url.searchParams.set('page', '2'); history.pushState({}, '', url);
        const api = 'http://api.bilibili.com:' + location.port + '/x/web-interface/wbi/search/type?keyword=' + encodeURIComponent('JavaScript 闭包') + '&page=2';
        const response = await fetch(api); const json = await response.json();
        document.querySelector('#grid').innerHTML = json.data.result.map(window.cardMarkup).join('');
        requestAnimationFrame(() => { window.__secondFrame = (${visibleSnapshot.toString()})(); });
      };
      requestAnimationFrame(() => { window.__firstFrame = (${visibleSnapshot.toString()})(); });
    </script></body></html>`;
}

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  response.setHeader("Access-Control-Allow-Origin", request.headers.origin || "*");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Cache-Control", "no-store");
  if (url.searchParams.has("probe") || url.pathname.endsWith("/nav")) {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ hasCookie: (request.headers.cookie ?? "").includes("bnc_test=") }));
  } else if (url.pathname.includes("/x/web-interface/")) {
    const results = url.searchParams.get("keyword") === "Godot 背包" ? godotPage : secondPage;
    const finish = () => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ code: 0, data: { page: Number(url.searchParams.get("page") || 1), result: results } }));
    };
    setTimeout(finish, url.searchParams.has("delay") ? 250 : 0);
  } else {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(fixture());
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const searchUrl = `http://search.bilibili.com:${port}/all?keyword=${encodeURIComponent("JavaScript 闭包")}`;
const args = ["--no-proxy-server", "--host-resolver-rules=MAP *.bilibili.com 127.0.0.1"];
let context, userBrowser;

async function waitState(page, id, state) {
  await page.waitForFunction(({ id, state }) => document.querySelector(`[data-id="${id}"]`)?.getAttribute("data-bnc-state") === state, { id, state });
}
async function verifyResults(page, name) {
  page.on("pageerror", error => errors.push(`${name}: ${error.message}`));
  await page.goto(searchUrl, { waitUntil: "load" });
  await waitState(page, data[0].bvid, "match");
  await waitState(page, data[1].bvid, "match");
  await waitState(page, data[2].bvid, "weak");
  await waitState(page, data[3].bvid, "ad");
  await waitState(page, unknown.bvid, "unknown");
  for (const item of data.slice(0, 2)) assert.equal(await page.locator(`[data-id="${item.bvid}"]`).isVisible(), true);
  for (const item of data.slice(2)) assert.equal(await page.locator(`[data-id="${item.bvid}"]`).isVisible(), false);
  assert.equal(await page.locator(`[data-id="${unknown.bvid}"]`).isVisible(), true);
  const frame = await page.evaluate(() => window.__firstFrame);
  assert.equal(frame[data[2].bvid], false, `${name}: weak result flashed`);
  assert.equal(frame[data[3].bvid], false, `${name}: ad flashed`);
  assert.equal(await page.locator("[data-bnc-slot=weak]").isVisible(), false, "grid slot should collapse");
  assert.equal(await page.locator("#next").isVisible(), true);
  assert.equal(await page.locator(".search-input-el").inputValue(), "JavaScript 闭包");
  console.log(`PASS ${name}: SSR metadata, tags, folding, ads, first frame, unknown fallback, retained controls`);
}

try {
  context = await chromium.launchPersistentContext("", {
    executablePath, headless: true,
    args: [...args, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const page = await context.newPage();
  await verifyResults(page, "extension");
  const tools = page.locator("#bnc-search-tools");
  await tools.locator("summary").first().click();
  await tools.getByLabel("展开本页偏题结果").check();
  assert.equal(await page.locator(`[data-id="${data[2].bvid}"]`).isVisible(), true);
  assert.equal(await page.locator(`[data-id="${data[3].bvid}"]`).isVisible(), false);
  await tools.getByLabel("展开本页偏题结果").uncheck();
  await tools.getByText("偏题结果与原因（1）", { exact: true }).click();
  await tools.getByRole("button", { name: "恢复", exact: true }).click();
  await waitState(page, data[2].bvid, "restored");
  assert.equal(await page.locator(`[data-id="${data[2].bvid}"]`).isVisible(), true);

  await tools.getByLabel("必须匹配的核心词").fill("JavaScript 表格");
  await tools.getByRole("button", { name: "应用核心词" }).click();
  await waitState(page, data[2].bvid, "match");
  await waitState(page, data[0].bvid, "weak");
  await tools.getByRole("button", { name: "使用搜索词" }).click();
  await waitState(page, data[0].bvid, "match");
  console.log("PASS controls: reveal, individual restore, editable AND conditions and reset");

  await page.evaluate(() => {
    const card = document.querySelector('[data-id="BV1Unknown01"]');
    const marker = document.createElement("span"); marker.className = "ad-feedback-entry"; card.append(marker);
  });
  await waitState(page, unknown.bvid, "ad");
  assert.equal(await page.locator(`[data-id="${unknown.bvid}"]`).isVisible(), false);
  console.log("PASS ad recognition: tracking redirect destinations and late explicit DOM markers");

  await page.locator("#next").click();
  await waitState(page, secondPage[0].bvid, "match");
  await waitState(page, secondPage[1].bvid, "weak");
  assert.equal((await page.evaluate(() => window.__secondFrame))[secondPage[1].bvid], false);
  console.log("PASS fetch pagination: metadata follows new results without flashing weak cards");

  // A response for an old query can arrive after a new query. It must not classify
  // the new cards using unrelated metadata, even when their DOM nodes are reused.
  await page.evaluate(async () => {
    const base = `http://api.bilibili.com:${location.port}/x/web-interface/wbi/search/type`;
    const old = fetch(base + "?keyword=JavaScript%20%E9%97%AD%E5%8C%85&page=2&delay=1");
    history.pushState({}, "", "/all?keyword=Godot%20%E8%83%8C%E5%8C%85");
    const response = await fetch(base + "?keyword=Godot%20%E8%83%8C%E5%8C%85&page=1");
    const json = await response.json();
    document.querySelector("#grid").innerHTML = json.data.result.map(window.cardMarkup).join("");
    await old;
  });
  await waitState(page, godotPage[0].bvid, "match");
  await waitState(page, godotPage[1].bvid, "weak");
  console.log("PASS SPA: new keyword, reset conditions and out-of-order response isolation");

  await page.evaluate(() => new Promise(resolve => {
    const request = new XMLHttpRequest();
    request.open("GET", `http://api.bilibili.com:${location.port}/x/web-interface/search/type?keyword=JavaScript%20%E9%97%AD%E5%8C%85&page=1`);
    history.pushState({}, "", "/video?keyword=JavaScript%20%E9%97%AD%E5%8C%85");
    request.onload = () => { const json = JSON.parse(request.responseText); document.querySelector("#grid").innerHTML = json.data.result.map(window.cardMarkup).join(""); resolve(); };
    request.send();
  }));
  await waitState(page, secondPage[0].bvid, "match");
  await waitState(page, secondPage[1].bvid, "weak");
  console.log("PASS XHR: legacy search endpoint and video-tab results");

  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  popup.on("pageerror", error => errors.push(`popup: ${error.message}`));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator("#searchEnabled").uncheck();
  await page.waitForFunction(() => document.documentElement.getAttribute("data-bnc-filter") === "off");
  assert.equal(await page.locator(`[data-id="${secondPage[1].bvid}"]`).isVisible(), true);
  await popup.locator("#searchEnabled").check();
  await page.waitForFunction(() => document.documentElement.getAttribute("data-bnc-filter") === "on");
  console.log("PASS extension preferences: popup updates already-open search pages");

  await context.addCookies([{ name: "bnc_test", value: "test-only", domain: ".bilibili.com", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const probe = await context.newPage();
  async function mainCookie(url) {
    const response = await probe.goto(url, { waitUntil: "domcontentloaded" });
    return (await response.json()).hasCookie;
  }
  const probeUrl = `http://search.bilibili.com:${port}/all?keyword=probe&probe=main`;
  assert.equal(await mainCookie(probeUrl), true);
  await popup.locator("#guestSearch").click();
  await popup.waitForFunction(() => !document.querySelector("#guestSearch").disabled);
  assert.equal(await popup.locator("#guestSearch").isChecked(), true, await popup.locator("#settings-status").innerText());
  await popup.getByText("已保存，请刷新搜索页。", { exact: true }).waitFor();
  assert.equal(await mainCookie(probeUrl), false, "guest mode must cover SSR document requests");
  const cookies = await probe.evaluate(async port => {
    async function read(path) { const response = await fetch(`http://api.bilibili.com:${port}${path}`, { credentials: "include" }); return (await response.json()).hasCookie; }
    return { search: await read("/x/web-interface/wbi/search/type?probe=api"), nav: await read("/x/web-interface/nav") };
  }, port);
  assert.deepEqual(cookies, { search: false, nav: true });
  assert.equal(await mainCookie(`http://www.bilibili.com:${port}/video/BVtest?probe=video`), true);
  const fromVideo = await probe.evaluate(async port => {
    const response = await fetch(`http://api.bilibili.com:${port}/x/web-interface/wbi/search/type?probe=video-api`, { credentials: "include" });
    return (await response.json()).hasCookie;
  }, port);
  assert.equal(fromVideo, true, "API stripping must be limited to search-page initiators");
  assert.equal((await context.cookies()).some(cookie => cookie.name === "bnc_test"), true);
  await popup.locator("#guestSearch").uncheck();
  await worker.evaluate(async () => { for (let i = 0; i < 50; i++) { if (!(await chrome.declarativeNetRequest.getDynamicRules()).length) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error("Guest rules were not removed"); });
  assert.equal(await mainCookie(probeUrl), true);
  console.log("PASS guest search: real network cookie removal for SSR/API, video/login isolation, cookie jar retained, switch off restores requests");

  // Userscript behavior is tested separately with only its GM APIs stubbed.
  const script = await readFile(resolve(root, "dist/userscript/bili-nocover.user.js"), "utf8");
  userBrowser = await chromium.launch({ executablePath, headless: true, args });
  const userContext = await userBrowser.newContext();
  await userContext.addInitScript({ content: `
    window.unsafeWindow = window;
    const values = new Map();
    window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
    window.GM_setValue = (key, value) => values.set(key, value);
    window.GM_addStyle = css => {
      const style = document.createElement('style'); style.textContent = css;
      const attach = () => { if (!style.isConnected && document.documentElement) document.documentElement.append(style); };
      attach();
      if (!style.isConnected) { const observer = new MutationObserver(() => { attach(); if (style.isConnected) observer.disconnect(); }); observer.observe(document, {childList:true}); }
      return style;
    };
    ${script}
  ` });
  const userPage = await userContext.newPage();
  await verifyResults(userPage, "userscript");
  assert.deepEqual(errors, []);
  console.log("All search browser checks passed against local fixtures and an actual Edge extension.");
} finally {
  await userBrowser?.close();
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
