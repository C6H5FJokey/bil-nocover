// Adapt the supplied AdGuard rules, keeping shared navigation containers visible.
// Prefer selectors based on class names over positional chains for future changes.
export const commonRules = [
  {
    name: "首页推荐（包括轮播）",
    selectors: [
      "#app > div.bili-feed4:last-child > main.bili-feed4-layout:nth-child(3)",
      "#app .bili-feed4 > .bili-feed4-layout",
    ],
  },
  {
    name: "首页频道导航",
    selectors: [
      "#app > div.bili-feed4:last-child > div.header-channel:nth-child(2) > div.header-channel-fixed.header-channel-fixed-down.is-zh",
      "#app > div.bili-feed4 > div.header-channel > div",
      "#app .bili-feed4 > .header-channel",
      "#app .bili-feed4 .bili-header__channel",
    ],
  },
  {
    name: "搜索框热搜面板",
    selectors: [
      "#app > div.bili-feed4 > div.bili-header.bili-header--large > div.bili-header__menu.is-zh.bili-header__bar > div.center-search-container.menu-center > div > div > div.trending",
      "#biliMainHeader > div > div > div.center-search-container.white-bg-bar.menu-center > div > div > div.trending",
      ".center-search-container .trending",
      "#nav-searchform .trending",
      "#nav_searchform .trending",
    ],
  },
  {
    name: "视频右侧推荐",
    selectors: [
      // .rcmd-tab also contains .video-pod (collections and multi-part videos).
      // Hide only the recommendation list, never its shared parent container.
      "#mirror-vdcon .right-container .recommend-list-v1",
    ],
  },
  {
    name: "视频评论",
    selectors: ["#commentapp", "#mirror-vdcon #comment", "#mirror-vdcon bili-comments"],
  },
  {
    name: "播放结束后的推荐",
    selectors: [".bpx-player-ending-related", ".bilibili-player-ending-panel-box-recommend"],
  },
  {
    name: "动态右侧推荐",
    selectors: [
      "#app > div.bili-dyn-home--member > aside.right > section.sticky",
      "#app .bili-dyn-home--member aside.right > section.sticky",
    ],
  },
  {
    // The user supplied positions, not labels. Do not guess their destinations.
    name: "原规则中的首页顶部第 7 / 8 / 9 项（位置兼容规则）",
    selectors: [7, 8, 9].map((position) =>
      `#app > div.bili-feed4 > div.bili-header.bili-header--large > div.bili-header__menu.is-zh.bili-header__bar > div.left-entry.is-zh.menu-left > div > div:nth-child(${position})`,
    ),
  },
];

export const dynamicRules = [
  {
    name: "动态评论入口（仅 t.bilibili.com）",
    selectors: [
      "#app > div.bili-dyn-home--member:last-child > main:nth-child(2) > section:last-child > div.bili-dyn-list:last-child > div.bili-dyn-list__items:first-child > div.bili-dyn-list__item > div.bili-dyn-item > div.bili-dyn-item__main > div.bili-dyn-item__footer:last-child > div.bili-dyn-item__action:nth-child(2) > div.bili-dyn-action.comment",
      "#app .bili-dyn-home--member .bili-dyn-item__footer .bili-dyn-action.comment",
    ],
  },
];

// Scope this to search boxes: login fields, comments, and other form hints stay.
export const searchInputSelectors = [
  ".center-search-container input",
  "#nav-searchform input",
  "#nav_searchform input",
  "input.nav-search-input",
  ".nav-search input",
  ".search-input input",
  "input.search-input-el",
  "#search-input",
  "input[type='search']",
];

export function renderHideRules(groups) {
  return groups.map(({ name, selectors }) =>
    `/* ${name} */\n${selectors.join(",\n")} {\n  display: none !important;\n}\n`,
  ).join("\n");
}

export function renderPlaceholderRules() {
  // This stylesheet is loaded before the JS cleaner. A later placeholder write
  // is visually suppressed even before MutationObserver has processed it.
  return `/* 搜索推荐占位词：在清除 DOM 属性之前即隐藏 */\n:is(${searchInputSelectors.join(",\n")})::placeholder {\n  color: transparent !important;\n  opacity: 0 !important;\n  -webkit-text-fill-color: transparent !important;\n}\n`;
}
