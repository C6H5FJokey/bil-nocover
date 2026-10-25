export function createGuestRules(enabled) {
  if (!enabled) return [];
  const action = { type: "modifyHeaders", requestHeaders: [{ header: "cookie", operation: "remove" }] };
  return [
    {
      id: 4101, priority: 1, action,
      condition: {
        regexFilter: "^https?://search\\.bilibili\\.com(:[0-9]+)?/(all|video)?([/?]|$)",
        resourceTypes: ["main_frame"],
      },
    },
    {
      id: 4102, priority: 1, action,
      condition: {
        regexFilter: "^https?://api\\.bilibili\\.com(:[0-9]+)?/x/web-interface/(wbi/)?search/(all(/v2)?|type)([?]|$)",
        initiatorDomains: ["search.bilibili.com"],
        resourceTypes: ["xmlhttprequest"],
      },
    },
  ];
}
