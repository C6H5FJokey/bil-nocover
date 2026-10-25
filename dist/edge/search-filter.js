(function startSearchFilter(win, engine, preferences = {}) {
  if (win.location.hostname !== "search.bilibili.com") return;
  const doc = win.document;
  const settings = { searchEnabled: true, hideSearchAds: true };
  const metadata = new Map();
  let pendingSince = new WeakMap();
  const restored = new Set();
  let currentKey = "", groups = [], customTerms = false, showWeak = false;
  let scheduled = false, timer, host, ui, disposed = false;

  function route() {
    const url = new URL(win.location.href);
    return {
      query: url.searchParams.get("keyword") ?? "",
      page: Number(url.searchParams.get("page") ?? 1),
      order: url.searchParams.get("order") ?? "",
      active: /^\/(?:all|video)\/?$/.test(url.pathname) && Boolean(url.searchParams.get("keyword")),
    };
  }

  function key(info) { return JSON.stringify([info.query, info.page, info.order]); }
  function formattedTerms() { return groups.map(group => group.literal ? `"${group.label}"` : group.label).join(" "); }
  function element(tag, text, attributes = {}) {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }

  function ensureUi() {
    if (host?.isConnected || !doc.body) return;
    host = element("aside", "", { id: "bnc-search-tools", "aria-label": "Bili NoCover 搜索筛选" });
    const shadow = host.attachShadow({ mode: "open" });
    const style = element("style");
    style.textContent = `:host{position:fixed;bottom:16px;left:16px;z-index:10000;width:min(360px,calc(100vw - 32px));font:13px/1.6 'Segoe UI','Microsoft YaHei',sans-serif;color:#263b32;color-scheme:light}section{background:#f8fbf8;border:1px solid #b8cdbd;border-radius:10px;box-shadow:0 4px 18px #0002;padding:12px 14px}summary{cursor:pointer;font-weight:600}p{margin:7px 0}label{display:block;margin:8px 0}input[type=text]{box-sizing:border-box;width:100%;padding:7px;border:1px solid #a7bfae;border-radius:5px;background:white;color:#263b32;font:inherit}button{cursor:pointer;border:1px solid #a7bfae;border-radius:5px;padding:4px 9px;background:#edf5ef;color:#24553b;font:inherit}button:focus-visible,input:focus-visible{outline:2px solid #357957;outline-offset:2px}.buttons{display:flex;gap:8px;margin-top:8px}.note{font-size:12px;color:#52685a}ul{max-height:210px;overflow:auto;padding-left:18px}li{margin-bottom:9px}li button{margin-left:6px}input[type=checkbox]{vertical-align:middle}`;
    const section = element("section");
    const details = element("details");
    const summary = element("summary", "搜索筛选");
    const status = element("p", "正在读取搜索结果…", { role: "status", "aria-live": "polite" });
    const enabled = element("input", "", { type: "checkbox", id: "enabled" });
    enabled.checked = settings.searchEnabled;
    const enabledLabel = element("label"); enabledLabel.append(enabled, " 折叠疑似偏题结果");
    const ads = element("input", "", { type: "checkbox", id: "ads" });
    ads.checked = settings.hideSearchAds;
    const adsLabel = element("label"); adsLabel.append(ads, " 隐藏已识别的推广");
    const terms = element("input", "", { type: "text", id: "terms", "aria-label": "必须匹配的核心词" });
    const termsLabel = element("label", "必须匹配的核心词"); termsLabel.append(terms);
    const note = element("p", "空格分隔条件，/ 连接同义词。设置仅用于当前搜索。", { class: "note" });
    const buttons = element("div", "", { class: "buttons" });
    const apply = element("button", "应用核心词", { type: "button" });
    const reset = element("button", "使用搜索词", { type: "button" });
    buttons.append(apply, reset);
    const reveal = element("input", "", { type: "checkbox", id: "reveal" });
    const revealLabel = element("label"); revealLabel.append(reveal, " 展开本页偏题结果");
    const reasons = element("details");
    const reasonsTitle = element("summary", "折叠原因");
    const list = element("ul"); reasons.append(reasonsTitle, list);
    details.append(summary, enabledLabel, adsLabel, termsLabel, note, buttons, revealLabel, reasons);
    section.append(details, status);
    shadow.append(style, section); doc.body.append(host);
    ui = { status, summary, enabled, ads, terms, reveal, reasonsTitle, list };
    terms.value = formattedTerms();
    enabled.addEventListener("change", () => changeSettings({ searchEnabled: enabled.checked }));
    ads.addEventListener("change", () => changeSettings({ hideSearchAds: ads.checked }));
    reveal.addEventListener("change", () => { showWeak = reveal.checked; schedule(); });
    function applyTerms() { customTerms = true; groups = engine.parseTerms(terms.value); restored.clear(); schedule(); }
    apply.addEventListener("click", applyTerms);
    terms.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); applyTerms(); } });
    reset.addEventListener("click", () => {
      customTerms = false; groups = engine.parseTerms(route().query, true);
      terms.value = formattedTerms(); restored.clear(); schedule();
    });
  }

  function changeSettings(patch) {
    Object.assign(settings, patch); schedule();
    Promise.resolve(preferences.write?.(patch)).catch(() => {
      if (ui) ui.status.textContent = "设置暂未保存，当前页面仍会生效。";
    });
  }

  function readIdentity(card) {
    // Promoted cards often link through cm.bilibili.com. Their target URL is
    // available as an attribute; match that destination without following it.
    const targets = [...card.querySelectorAll("a[href]")].map(node => node.getAttribute("data-target-url") || node.href);
    const href = targets.find(value => /\/video\/(?:BV[\da-z]+|av\d+)/i.test(value)) ?? targets[0] ?? "";
    const bvid = href.match(/\/(BV[\da-z]+)/i)?.[1] ?? "";
    const aid = href.match(/\/av(\d+)/i)?.[1] ?? "";
    let canonical = "";
    try { const url = new URL(href, win.location.href); canonical = url.origin + url.pathname; } catch {}
    return { bvid, aid, url: canonical };
  }

  function findMetadata(card, items) {
    const identity = readIdentity(card);
    return items.find(item => (identity.bvid && identity.bvid === item.bvid)
      || (identity.aid && identity.aid === item.aid)
      || (identity.url && identity.url === item.url));
  }

  function mark(card, status, reason) {
    card.setAttribute("data-bnc-state", status);
    // Hide the grid slot only when it is a dedicated one-card column, never a
    // shared result container, pagination, or a video-page navigation container.
    const parent = card.parentElement;
    if (parent && [...parent.classList].some(name => /^col_/.test(name)) && parent.querySelectorAll(".bili-video-card").length === 1) {
      parent.setAttribute("data-bnc-slot", status);
    }
    let badge = card.querySelector(":scope > .bnc-search-reason");
    if (reason) {
      if (!badge) { badge = element("p", "", { class: "bnc-search-reason" }); card.append(badge); }
      if (badge.textContent !== reason) badge.textContent = reason;
    } else badge?.remove();
  }

  function render() {
    if (disposed || !doc.documentElement) return;
    const info = route();
    const nextKey = key(info);
    if (nextKey !== currentKey) {
      const previous = JSON.parse(currentKey || "[]");
      if (previous[0] !== info.query) { groups = engine.parseTerms(info.query, true); customTerms = false; }
      currentKey = nextKey; restored.clear(); showWeak = false;
      pendingSince = new WeakMap();
      if (ui) { ui.terms.value = formattedTerms(); ui.reveal.checked = false; }
    }
    if (!customTerms && !groups.length) groups = engine.parseTerms(info.query, true);
    const root = doc.documentElement;
    root.setAttribute("data-bnc-search", info.active ? "on" : "off");
    root.setAttribute("data-bnc-reveal", showWeak ? "yes" : "no");
    root.setAttribute("data-bnc-filter", settings.searchEnabled ? "on" : "off");
    root.setAttribute("data-bnc-ads", settings.hideSearchAds ? "hide" : "show");
    if (!info.active) { if (host) host.hidden = true; return; }
    ensureUi(); if (host) host.hidden = false;
    const items = metadata.get(currentKey) ?? [];
    const counts = { match: 0, weak: 0, unknown: 0, ad: 0, pending: 0, restored: 0 };
    const folded = [];
    for (const card of doc.querySelectorAll(".bili-video-card")) {
      const item = findMetadata(card, items);
      const title = card.querySelector("h3")?.textContent?.trim() || item?.title || "未命名结果";
      const identity = readIdentity(card);
      const id = identity.bvid || identity.aid || identity.url || title;
      let result;
      if (item) result = engine.classify(item, groups);
      else if (card.querySelector(".ad-feedback-entry, .bili-video-card__info--ad")) result = { status: "ad", missing: [] };
      else if (!settings.searchEnabled && !settings.hideSearchAds) result = { status: "unknown", missing: [] };
      else {
        if (!pendingSince.has(card)) pendingSince.set(card, Date.now());
        result = Date.now() - pendingSince.get(card) < 1200
          ? { status: "pending", missing: [] }
          : engine.classify({ title, complete: false }, groups);
      }
      let state = result.status;
      let reason = "";
      if (state === "weak") {
        reason = `疑似偏题：缺少 ${result.missing.join("、")}`;
        if (restored.has(id)) state = "restored";
        else folded.push({ title, reason, id });
      } else if (state === "unknown") reason = "完整信息暂不可用，已保留此结果";
      counts[state]++;
      mark(card, state, reason);
    }
    if (ui) {
      ui.enabled.checked = settings.searchEnabled; ui.ads.checked = settings.hideSearchAds;
      ui.summary.textContent = "搜索筛选 · 可展开恢复";
      ui.status.textContent = `匹配 ${counts.match} · ${settings.searchEnabled && !showWeak ? "折叠" : "偏题"} ${counts.weak} · 推广 ${counts.ad}${counts.unknown ? ` · 未确认 ${counts.unknown}` : ""}${counts.pending ? ` · 检查中 ${counts.pending}` : ""}${counts.restored ? ` · 已恢复 ${counts.restored}` : ""}`;
      ui.reasonsTitle.textContent = `偏题结果与原因（${folded.length}）`;
      ui.list.replaceChildren(...folded.map(item => {
        const row = element("li", `${engine.normalize(item.title).slice(0, 90)} — ${item.reason}`);
        const restore = element("button", "恢复", { type: "button" });
        restore.addEventListener("click", () => { restored.add(item.id); schedule(); });
        row.append(restore); return row;
      }));
    }
    clearTimeout(timer);
    if (counts.pending) timer = win.setTimeout(schedule, 1250);
  }

  function schedule() {
    if (scheduled || disposed) return;
    scheduled = true;
    win.queueMicrotask(() => { scheduled = false; render(); });
  }

  function onData(event) {
    const data = event.data;
    if (event.origin !== win.location.origin || data?.channel !== "bili-nocover:search:v1" || !Array.isArray(data.items)) return;
    const packetKey = key(data);
    metadata.set(packetKey, data.items.slice(0, 200).filter(item => item && typeof item === "object"));
    if (metadata.size > 8) metadata.delete(metadata.keys().next().value);
    schedule();
  }

  const observer = new win.MutationObserver(mutations => {
    if (mutations.some(mutation => {
      const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (target?.closest?.("#bnc-search-tools, .bnc-search-reason")) return false;
      if (mutation.type === "attributes") return Boolean(target?.closest?.(".bili-video-card"));
      return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1
        && node.id !== "bnc-search-tools" && !node.classList.contains("bnc-search-reason")
        && (node.matches(".bili-video-card") || node.querySelector(".bili-video-card")))
        || Boolean(target?.closest?.(".bili-video-card")
          && [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType !== 1 || !node.classList.contains("bnc-search-reason")))
        || !doc.documentElement?.hasAttribute("data-bnc-search");
    })) schedule();
  });
  observer.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  win.addEventListener("message", onData);
  win.addEventListener("popstate", schedule);
  doc.addEventListener("DOMContentLoaded", schedule, { once: true });
  render();
  Promise.resolve(preferences.read?.()).then(value => { if (value) Object.assign(settings, value); schedule(); }).catch(() => {});
  preferences.listen?.(value => { Object.assign(settings, value); schedule(); });
  win.postMessage({ channel: "bili-nocover:search:request" }, win.location.origin);
  return { refresh: schedule, destroy() { disposed = true; observer.disconnect(); clearTimeout(timer); host?.remove(); win.removeEventListener("message", onData); win.removeEventListener("popstate", schedule); } };
})(window, (function createSearchEngine() {
  const aliases = [
    ["javascript", "js"], ["typescript", "ts"],
    ["gtnh", "格雷科技新视野", "gregtech new horizons"],
    ["炼钢", "制钢"], ["麦克风", "话筒"], ["存档", "存读档", "save load"],
  ];
  const optionalWords = new Set(["的", "了", "吗", "呢", "怎么", "如何", "什么", "一个", "教程", "视频"]);

  function normalize(value) {
    return String(value ?? "").replace(/<[^>]*>/g, " ")
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, " ")
      .normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }

  function alternatives(term) {
    const normalized = normalize(term);
    const group = aliases.find(items => items.includes(normalized));
    return group ? [...group] : [normalized];
  }

  function parseTerms(text, automatic = false) {
    let chunks = String(text ?? "").match(/"[^"]+"|“[^”]+”|[^\s]+/g) ?? [];
    if (automatic) {
      chunks = chunks.flatMap(chunk => {
        if (/^["“]/.test(chunk) || chunk.includes("/")) return [chunk];
        const mixed = chunk.replace(/([a-z0-9])([\u3400-\u9fff])/gi, "$1 $2")
          .replace(/([\u3400-\u9fff])([a-z0-9])/gi, "$1 $2").split(/\s+/);
        return mixed.flatMap(part => {
          if (!/^[\u3400-\u9fff]{4,}$/.test(part) || typeof Intl.Segmenter !== "function") return [part];
          const words = [...new Intl.Segmenter("zh", { granularity: "word" }).segment(part)]
            .filter(item => item.isWordLike).map(item => item.segment);
          const combined = [];
          let singles = "";
          for (const word of words) {
            if (word.length === 1) singles += word;
            else { if (singles) combined.push(singles); singles = ""; combined.push(word); }
          }
          if (singles) combined.push(singles);
          return combined.length ? combined : [part];
        });
      });
      const essential = chunks.filter(chunk => !optionalWords.has(normalize(chunk)));
      if (essential.length) chunks = essential;
    }
    const groups = chunks.map(chunk => {
      const literal = /^["“]/.test(chunk);
      const label = chunk.replace(/^["“]|["”]$/g, "");
      const terms = literal ? [normalize(label)] : label.split("/").flatMap(alternatives);
      return { label, terms: [...new Set(terms.filter(Boolean))], literal };
    }).filter(group => group.terms.length);
    return groups.filter((group, index) => groups.findIndex(other => other.terms.join("|") === group.terms.join("|")) === index);
  }

  function contains(text, term) {
    if (!/^[a-z0-9][a-z0-9 .+#-]*$/i.test(term)) return text.includes(term);
    // Short aliases such as JS must not match unrelated English words.
    let position = -1;
    while ((position = text.indexOf(term, position + 1)) !== -1) {
      const before = text[position - 1] ?? "";
      const after = text[position + term.length] ?? "";
      if (!/[a-z0-9_]/i.test(before) && !/[a-z0-9_]/i.test(after)) return true;
    }
    return false;
  }

  function classify(item, groups) {
    if (item.isAd === true || /^(?:video|picture|brand)_ad(?:_|$)/.test(item.type ?? "")) {
      return { status: "ad", missing: [], hits: [] };
    }
    const fields = { title: normalize(item.title), tag: normalize(item.tag), description: normalize(item.description) };
    const hits = groups.map(group => ({
      term: group.label,
      fields: Object.entries(fields).filter(([, text]) => group.terms.some(term => contains(text, term))).map(([name]) => name),
    }));
    const missing = hits.filter(hit => !hit.fields.length).map(hit => hit.term);
    if (!groups.length || !missing.length) return { status: "match", missing, hits };
    return { status: item.complete === true ? "weak" : "unknown", missing, hits };
  }

  return { normalize, parseTerms, classify };
})(), {
  read: () => chrome.storage.local.get({ searchEnabled: true, hideSearchAds: true }),
  write: patch => chrome.storage.local.set(patch),
  listen: callback => chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const patch = {};
    for (const key of ['searchEnabled', 'hideSearchAds']) {
      if (changes[key]) patch[key] = changes[key].newValue ?? true;
    }
    if (Object.keys(patch).length) callback(patch);
  }),
});
