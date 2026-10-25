import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = modulePath
  ? await import(pathToFileURL(resolve(modulePath, "index.mjs")).href)
  : await import("playwright");
const extension = resolve(root, "dist/edge");
const executablePath = process.env.BROWSER_EXECUTABLE || chromium.executablePath();
if (!existsSync(executablePath)) {
  throw new Error("Chromium not found. Run npx playwright install chromium, or set BROWSER_EXECUTABLE.");
}
// An empty userDataDir gives Playwright ownership of an isolated temporary
// profile, which it removes on close. Never use the user's browser profile.
const context = await chromium.launchPersistentContext("", {
  executablePath,
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

// All requested pages are local fixtures served under real matching hostnames.
// No Bilibili account or network response is involved in these assertions.
const header = `<div class="center-search-container"><form id="nav-searchform"><input id="nav-input" class="nav-search-input" placeholder="今日推荐词"><div class="trending" data-hidden>热搜</div><button data-keep>搜索</button></form></div>`;
const pages = {
  home: `<div id="app"><div class="bili-feed4"><div class="bili-header bili-header--large"><div class="bili-header__menu is-zh bili-header__bar">${header}<div class="left-entry is-zh menu-left"><div>${Array.from({length: 9}, (_, i) => `<div ${i < 6 ? "data-keep" : "data-hidden"}>导航${i + 1}</div>`).join("")}</div></div></div><div class="bili-header__channel" data-hidden>新版频道栏</div></div><div class="header-channel" data-hidden>频道</div><main class="bili-feed4-layout" data-hidden>推荐</main><div id="late-parent"></div></div></div><input id="login" placeholder="输入验证码" data-keep>`,
  video: `${header}<div id="mirror-vdcon"><main class="left-container"><video id="player" data-keep></video><section id="commentapp" data-hidden>评论</section><div class="bpx-player-ending-related" data-hidden>结束推荐</div></main><div class="right-container"><div><div class="rcmd-tab" data-keep><div class="recommend-list-v1" data-hidden>推荐</div><div class="playlist" data-keep>主动选择的分集</div></div></div></div></div>`,
  // Both reported pages put the video-pod and recommendations in .rcmd-tab.
  // Keep the nested controls in their real ancestry so hiding the parent fails.
  collection: `${header}<div id="mirror-vdcon"><div class="right-container"><div class="right-container-inner"><div class="rcmd-tab"><div class="video-pod" data-keep><div class="video-pod__header" data-keep>合集标题</div><div class="video-pod__body"><div class="video-pod__list section"><div class="pod-item video-pod__item"><a id="collection-next" href="/video/BVnext?fixture=collection" data-keep>下一集</a></div></div></div></div><div class="recommend-list-v1" data-hidden><div class="rec-list"><a data-hidden>算法推荐</a></div></div></div></div></div></div>`,
  multipart: `${header}<div id="mirror-vdcon"><div class="right-container"><div class="right-container-inner"><div class="rcmd-tab"><div class="video-pod" data-keep><div class="video-pod__header" data-keep>视频选集（2/10）</div><div class="video-pod__body"><div class="video-pod__list multip list"><div class="simple-base-item video-pod__item active normal" data-keep>P2</div><div class="simple-base-item video-pod__item normal"><a id="part-next" href="?p=3&fixture=multipart" data-keep>P3</a></div></div></div></div><div class="recommend-list-v1" data-hidden><div class="rec-list"><a data-hidden>算法推荐</a></div></div></div></div></div></div>`,
  dynamic: `${header}<div id="app"><div class="bili-dyn-home--member"><aside class="left" data-keep>关注</aside><main><section><div class="bili-dyn-list"><div class="bili-dyn-list__items"><div class="bili-dyn-list__item"><div class="bili-dyn-item"><div class="bili-dyn-item__main"><article data-keep>动态正文</article><div class="bili-dyn-item__footer"><div class="bili-dyn-item__action"><div class="bili-dyn-action forward" data-keep>转发</div></div><div class="bili-dyn-item__action"><div class="bili-dyn-action comment" data-hidden>评论</div></div><div class="bili-dyn-item__action"><div class="bili-dyn-action like" data-keep>点赞</div></div></div></div></div></div></div></div></section></main><aside class="right"><section class="sticky" data-hidden>热门动态</section></aside></div></div>`,
  search: `${header}<div class="search-input"><input id="query" class="search-input-el" placeholder="搜索推荐" value="主动查找的内容" data-keep></div><main class="search-results" data-keep>主动搜索结果</main><textarea id="message" placeholder="输入正文" data-keep></textarea>`,
};
const snapshot = `() => {
  function visible(element) {
    // Checking only the element's display misses a hidden ancestor.
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  }
  return {
    hidden: [...document.querySelectorAll('[data-hidden]')].map(el => !visible(el)),
    kept: [...document.querySelectorAll('[data-keep]')].map(visible),
    placeholderHidden: !document.querySelector('#nav-input').getAttribute('placeholder') || getComputedStyle(document.querySelector('#nav-input'), '::placeholder').opacity === '0'
  };
}`;
function html(body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>本地屏蔽测试</title></head><body>${body}<script>
    window.__sync = (${snapshot})();
    requestAnimationFrame(() => { window.__firstFrame = (${snapshot})(); });
  </script></body></html>`;
}
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  const body = pages[url.searchParams.get("fixture")] ?? pages.home;
  return route.fulfill({ contentType: "text/html; charset=utf-8", body: html(body) });
});

const errors = [];
async function verify(page, name, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__firstFrame);
  for (const [phase, state] of Object.entries(await page.evaluate(() => ({ sync: window.__sync, firstFrame: window.__firstFrame })))) {
    assert.ok(state.hidden.length, `${name}: fixture must contain blocked content`);
    assert.ok(state.hidden.every(Boolean), `${name}/${phase}: recommendations visible`);
    assert.ok(state.kept.every(Boolean), `${name}/${phase}: normal content was hidden`);
    assert.ok(state.placeholderHidden, `${name}/${phase}: placeholder visible`);
  }
  await page.waitForFunction(() => !document.querySelector("#nav-input").hasAttribute("placeholder"));
  await page.locator("#nav-input").fill("我自己输入的文字");
  const immediate = await page.evaluate(() => {
    const input = document.querySelector("#nav-input");
    input.setAttribute("placeholder", "网站重新写入推荐词");
    return getComputedStyle(input, "::placeholder").opacity;
  });
  assert.equal(immediate, "0", `${name}: rewritten placeholder was not instantly hidden`);
  await page.waitForFunction(() => !document.querySelector("#nav-input").hasAttribute("placeholder"));
  assert.equal(await page.locator("#nav-input").inputValue(), "我自己输入的文字");
  console.log(`PASS ${name}: pre-script + first frame, placeholders, user input, retained content`);
}

try {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await verify(page, "extension/home", "https://www.bilibili.com/?fixture=home");
  assert.equal(await page.locator("#login").getAttribute("placeholder"), "输入验证码");
  const late = await page.evaluate(() => {
    const feed = document.createElement("main");
    feed.className = "bili-feed4-layout";
    document.querySelector(".bili-feed4").append(feed);
    const search = document.createElement("div");
    search.className = "center-search-container";
    search.innerHTML = '<input id="late-search" placeholder="异步插入的推荐词">';
    document.body.append(search);
    return { feed: getComputedStyle(feed).display, placeholder: getComputedStyle(search.firstElementChild, "::placeholder").opacity };
  });
  assert.deepEqual(late, { feed: "none", placeholder: "0" });
  await page.waitForFunction(() => !document.querySelector("#late-search").hasAttribute("placeholder"));
  console.log("PASS extension: asynchronously inserted feed and search input");

  await verify(page, "extension/video", "https://www.bilibili.com/video/BVfixture?fixture=video");
  await verify(page, "extension/collection", "https://www.bilibili.com/video/BVfixture?fixture=collection");
  await page.locator("#collection-next").click();
  await page.waitForURL("**/video/BVnext?fixture=collection");
  await verify(page, "extension/multipart", "https://www.bilibili.com/video/BVfixture?p=2&fixture=multipart");
  await page.locator("#part-next").click();
  await page.waitForURL("**?p=3&fixture=multipart");
  console.log("PASS extension: collection and part links stay visible and clickable");
  await verify(page, "extension/dynamic", "https://t.bilibili.com/?fixture=dynamic");
  await verify(page, "extension/search", "https://search.bilibili.com/all?fixture=search");
  assert.equal(await page.locator("#query").inputValue(), "主动查找的内容");
  assert.equal(await page.locator("#message").getAttribute("placeholder"), "输入正文");

  // Same fixture on an unrelated origin must remain untouched.
  await page.goto("https://example.com/?fixture=home");
  assert.equal(await page.locator(".bili-feed4-layout").evaluate(el => getComputedStyle(el).display), "block");
  assert.equal(await page.locator("#nav-input").getAttribute("placeholder"), "今日推荐词");
  console.log("PASS extension: no injection on unrelated origin");

  // Verify userscript behavior separately, using a local GM_addStyle stub.
  const script = await readFile(resolve(root, "dist/userscript/bili-nocover.user.js"), "utf8");
  const scriptContext = await chromium.launch({ executablePath, headless: true });
  try {
    const isolated = await scriptContext.newContext();
    await isolated.addInitScript({ content: `
      window.GM_addStyle = css => {
        const style = document.createElement('style');
        style.textContent = css;
        const attach = () => { if (!style.isConnected && document.documentElement) document.documentElement.append(style); };
        attach();
        if (!style.isConnected) {
          const watcher = new MutationObserver(() => { attach(); if (style.isConnected) watcher.disconnect(); });
          watcher.observe(document, {childList: true});
        }
        return style;
      };
      ${script}
    ` });
    await isolated.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html(pages[url.searchParams.get("fixture")] ?? pages.home) });
    });
    const userPage = await isolated.newPage();
    userPage.on("pageerror", (error) => errors.push(error.message));
    await verify(userPage, "userscript/home", "https://www.bilibili.com/?fixture=home");
    await verify(userPage, "userscript/collection", "https://www.bilibili.com/video/BVfixture?fixture=collection");
    await verify(userPage, "userscript/multipart", "https://www.bilibili.com/video/BVfixture?p=2&fixture=multipart");
    await verify(userPage, "userscript/dynamic", "https://t.bilibili.com/?fixture=dynamic");
  } finally {
    await scriptContext.close();
  }
  assert.deepEqual(errors, [], "No browser JS errors");
  console.log("All browser checks passed. Local fixtures only; real-site selectors need ongoing validation.");
} finally {
  await context.close();
}
