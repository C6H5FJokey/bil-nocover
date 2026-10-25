(function startSearchBridge(win) {
  if (win.location.hostname !== "search.bilibili.com" || win.__bncSearchBridge) return;
  win.__bncSearchBridge = true;
  const doc = win.document;
  const channel = "bili-nocover:search:v1";

  function canonicalUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, win.location.href);
      return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : "";
    } catch { return ""; }
  }

  function publish(data, source) {
    if (!data || typeof data !== "object") return false;
    const result = Array.isArray(data.result) ? data.result : [];
    const group = result.find(item => item?.result_type === "video");
    const videos = group ? group.data : result.filter(item => item?.type === "video" || /_ad(?:_|$)/.test(item?.type ?? ""));
    if (!Array.isArray(videos) || !videos.length) return false;
    const url = new URL(source, win.location.href);
    const items = videos.slice(0, 200).map(item => {
      const adCard = item.biz_data?.ad_content?.extra?.card;
      return {
        bvid: String(item.bvid ?? "").slice(0, 24),
        aid: String(item.aid ?? item.id ?? "").slice(0, 24),
        type: String(item.type ?? "").slice(0, 50),
        title: String(item.title || adCard?.title || "").slice(0, 1000),
        description: String(item.description ?? "").slice(0, 8000),
        tag: String(item.tag ?? "").slice(0, 3000),
        url: canonicalUrl(item.arcurl || item.url || adCard?.jump_url || ""),
        isAd: Boolean(item.biz_data?.ad_content || item.is_ad === true || /_ad(?:_|$)/.test(item.type ?? "")),
        complete: "description" in item && "tag" in item,
      };
    });
    win.postMessage({
      channel,
      query: url.searchParams.get("keyword") ?? "",
      page: Number(data.page ?? url.searchParams.get("page") ?? 1),
      order: url.searchParams.get("order") ?? "",
      items,
    }, win.location.origin);
    return true;
  }

  function readInitial() {
    const all = win.__pinia?.searchResponse?.searchAllResponse;
    const types = Object.values(win.__pinia?.searchTypeResponse ?? {});
    const candidates = win.location.pathname.startsWith("/video") ? [...types, all] : [all, ...types];
    return candidates.some(state => publish(state, win.location.href));
  }

  function resultRequest(value) {
    try {
      const url = new URL(typeof value === "string" ? value : value?.url ?? String(value), win.location.href);
      return url.hostname === "api.bilibili.com"
        && /^\/x\/web-interface\/(?:wbi\/)?search\/(?:all(?:\/v2)?|type)\/?$/.test(url.pathname) ? url.href : "";
    } catch { return ""; }
  }

  const originalFetch = win.fetch;
  if (typeof originalFetch === "function") {
    win.fetch = function (...args) {
      const url = resultRequest(args[0]);
      const response = Reflect.apply(originalFetch, this, args);
      if (url) {
        response.then(value => value.clone().json()).then(value => {
          if (value.code === 0) publish(value.data, url);
        }).catch(() => {});
      }
      return response;
    };
  }

  const xhr = win.XMLHttpRequest?.prototype;
  if (xhr) {
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    const urls = new WeakMap();
    xhr.open = function (method, url, ...args) {
      urls.set(this, resultRequest(url));
      return Reflect.apply(originalOpen, this, [method, url, ...args]);
    };
    xhr.send = function (...args) {
      const source = urls.get(this);
      if (source) this.addEventListener("load", () => {
        try {
          const data = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
          if (data.code === 0) publish(data.data, source);
        } catch { /* Unsupported response type or a non-JSON error. */ }
      }, { once: true });
      return Reflect.apply(originalSend, this, args);
    };
  }

  // SSR assigns __pinia in an inline script after document_start. The observer
  // ends as soon as initial data is available; later pages use the response hooks.
  const observer = new win.MutationObserver(() => { if (readInitial()) observer.disconnect(); });
  if (!readInitial()) observer.observe(doc, { childList: true, subtree: true });
  doc.addEventListener("DOMContentLoaded", () => { readInitial(); observer.disconnect(); }, { once: true });
  win.addEventListener("message", event => {
    if (event.origin === win.location.origin && event.data?.channel === "bili-nocover:search:request") readInitial();
  });
})(window);
