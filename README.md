# Bili NoCover · 免疫推荐

在页面渲染前隐藏哔哩哔哩的推荐入口，保留主动搜索、视频播放和关注动态。提供 Edge / Chrome 扩展和油猴脚本，使用同一套规则。

**0.2.0 增加搜索结果筛选**：综合标题、简介、标签判断相关性，折叠疑似偏题结果并保留恢复入口。Edge 版另提供默认关闭的游客搜索开关。

**优先使用 Edge 扩展**：静态 CSS 直接写在 manifest 的 `content_scripts.css` 中，由浏览器提前注入。屏蔽推荐不需要等待 JavaScript 执行、页面加载完成或 MutationObserver 扫描。

## 安装 Edge 扩展

项目已包含构建好的文件，安装时不需要 Node.js 或 npm。

1. 在 Edge 地址栏打开 `edge://extensions`。
2. 打开「开发人员模式」。
3. 点击「加载解压缩的扩展」，选择本项目的 **`dist/edge` 文件夹**，其中包含 `manifest.json`。
4. 刷新已经打开的 B 站页面。此后打开的新页面会自动生效。

从旧版更新时，在扩展管理页点击「重新加载」，确认扩展处于启用状态，再刷新搜索页。0.2.0 新增本地设置和搜索请求规则权限。

可把扩展固定到工具栏，通过弹窗直接进入搜索或关注动态。Chrome 同样支持，在 `chrome://extensions` 加载同一文件夹。

## 安装油猴脚本

1. 在 Tampermonkey 中新建脚本。
2. 用 `dist/userscript/bili-nocover.user.js` 的全部内容替换默认模板，保存。
3. 确认脚本管理器在 B 站有执行权限，然后刷新页面。

两种版本选择一种即可。油猴使用 `@run-at document-start` 和 `GM_addStyle`，但实际启动时机仍取决于脚本管理器和浏览器配置；对于最在意首屏推荐闪现的使用场景，推荐扩展。

## 屏蔽范围

| 位置 | 行为 |
| --- | --- |
| 首页 | 隐藏推荐主区域（包括轮播）和频道导航 |
| 顶部搜索 | 隐藏热搜面板和推荐 placeholder；不修改手动输入的 value |
| 搜索页 | 清除推荐 placeholder；按核心词折叠疑似偏题卡片，隐藏已识别推广，可展开恢复 |
| 视频页 | 隐藏右侧推荐、播放结束推荐和评论；保留合集、分 P 和选集切换 |
| 动态页 | 隐藏右侧 sticky 区域；在 `t.bilibili.com` 隐藏评论按钮，保留正文、点赞和转发 |
| 首页顶部导航 | 兼容原规则，隐藏第 7 / 8 / 9 项；这些规则按位置匹配 |

原来的 AdGuard 规则已迁移，并增加基于原有 class / ID 的短选择器，减少 `nth-child` 和父子层级变化的影响。播放结束推荐和部分新版评论容器是补充覆盖。

**0.1.1 修复合集 / 分 P 误隐藏**：视频页 `.rcmd-tab` 同时包含 `.video-pod`（合集或选集）和 `.recommend-list-v1`（推荐）。现在只隐藏后者。升级后，Edge 用户重新加载扩展并刷新视频页；油猴用户替换为新版脚本并刷新。

如果 AdGuard 中仍保留了原来的这条规则，也会继续误隐藏合集和分 P：

```text
bilibili.com###mirror-vdcon > div.right-container > div > div.rcmd-tab
```

请删除它，或替换为只屏蔽推荐列表的规则：

```text
bilibili.com###mirror-vdcon .right-container .recommend-list-v1
```

搜索占位词采用两层处理：提前注入 `::placeholder` 样式使其不可见，再清除搜索框的 `placeholder` 属性。脚本只观察新增节点和 `placeholder` 的变更，网站重新写入的占位词会再次清除；不会清空 `input.value`、改变焦点或阻止输入。CSS 本身始终匹配后续插入的推荐模块，无需定时器反复删除 DOM。

## 搜索筛选的使用

搜索页左下角会显示「搜索筛选」面板，默认折叠疑似偏题结果、隐藏已识别的推广。

1. 点击面板展开设置。默认核心词从搜索词提取，每个核心条件都需要在**标题、简介或标签**中命中，匹配不区分英文大小写。已内置 JS / JavaScript、GTNH / 格雷科技新视野等少量别名。
2. 可以编辑「必须匹配的核心词」，点击「应用核心词」。空格表示多个条件，`/` 连接可替换的词，例如 `GTNH 炼钢/制钢`。英文双引号可指定完整短语。修改只用于当前搜索，不会保存搜索历史；更换关键词时自动重置。
3. 「展开本页偏题结果」可显示全部弱匹配卡片；「偏题结果与原因」列出缺少的词，可单条点击「恢复」。这些卡片始终保留在页面里，没有删除视频数据。
4. 拿不到完整元数据的卡片会先等待最多约 1.2 秒，再保留并标记「完整信息暂不可用」。它不会被当作已确认偏题而折叠。未分类卡片在等待期间先隐藏，避免先露出再消失。
5. 扩展弹窗可同步切换搜索过滤与推广隐藏。油猴版通过搜索页内的面板设置；两者都支持本地保存开关。

这是本地字面匹配和少量别名规则，不是语义搜索或 AI 判断。简介和标签可能堆砌关键词，分词也可能不符合你的意图；请用核心词调整及恢复入口纠正结果。保留结果的原有排序，不修改分页，也不自动请求额外页面。番剧、用户等独立分类页不启用视频相关性折叠。

### 游客搜索（仅 Edge / Chrome 扩展）

在扩展弹窗开启「游客搜索」并刷新搜索页。开关默认关闭。开启后仅对 `search.bilibili.com` 的综合 / 视频搜索文档请求，以及由搜索页发起的指定搜索结果 API 请求，移除发出的 Cookie 请求头；首屏与翻页均覆盖。登录接口、播放页和从其他页面发起的请求不在规则内，浏览器保存的 Cookie 不会被删除。关闭后请求恢复原样。

此功能只减少搜索请求携带的 Cookie 身份信息，不保证匿名，也不保证结果更相关。其他网络信息和请求参数仍可能影响搜索。油猴版本轮不提供这个网络开关，也不接管或重新绘制原站搜索页面。

## 开发

需要 Node.js 20+。构建和基础测试不依赖第三方包：

```powershell
node scripts/build.mjs
node --test tests/*.test.mjs
```

修改规则后重新构建，在扩展管理页点击「重新加载」，再刷新 B 站。不要直接修改 `dist`，下次构建会覆盖。

- `src/rules.mjs`：屏蔽选择器、搜索框匹配范围。
- `src/placeholder-cleaner.mjs`：搜索占位词清理。
- `src/search-core.mjs`：核心词、别名、相关性分类。
- `src/search-bridge.mjs`：读取首屏公开元数据，观察后续 fetch / XHR 搜索响应。
- `src/search-filter.mjs`：卡片状态、折叠与恢复面板、页面切换处理。
- `src/guest-rules.mjs`：限定搜索请求范围的游客规则。
- `src/extension/`：扩展 manifest 与弹窗。
- `scripts/build.mjs`：生成两种发行产物。
- `scripts/browser-test.mjs`：用实际 Chromium 检查渲染、动态插入、占位词恢复和正常内容保留。

浏览器测试需要 Playwright 和 Chromium：

```powershell
npm install
npx playwright install chromium
node scripts/browser-test.mjs
node scripts/search-browser-test.mjs
```

也支持通过 `PLAYWRIGHT_MODULE` 指向已安装的 Playwright 模块文件夹，通过 `BROWSER_EXECUTABLE` 指向现有 Chromium / Edge 可执行文件（需支持命令行加载扩展）。测试使用独立临时配置，不读取日常浏览器的登录状态。

2026-10-24 的验证：实际 Edge 加载扩展，通过本地测试页面检查首帧隐藏、异步插入、占位词恢复、用户输入保留及域名隔离；油猴产物通过模拟 `GM_addStyle` 的浏览器测试（不代表已在真实 Tampermonkey 中验证启动时机）。另在未登录的真实 B 站首页、搜索页和视频页检查了匹配情况，补充了新版首页 `.bili-header__channel` 规则。动态页登录后的实际结构尚未验证。

0.1.1 增加了合集与多 P 的真实嵌套结构回归测试，保留内容检查会沿父节点检查可见性，避免漏掉「自身 display 正常，但父容器被隐藏」的情况。实际 Edge 复验了反馈的两个页面：`BV1pN3f6PEim` 的 15 集合集可见并能切换；`BV1VpgX6eEvv/?p=2` 的 10 个分 P 可见，点击后成功切换至 `p=3`；推荐列表继续隐藏。

0.2.0：核心判断有 Node 测试；实际 Edge 扩展在本地 HTTP 服务器上验证首屏、fetch / XHR 翻页、乱序响应、词条件编辑、单条恢复、推广跳转、设置同步，以及真实网络中游客开关的 Cookie 范围和关闭恢复。原有首页、视频、合集、分 P 回归测试继续通过。未登录的真实 B 站公开案例「JavaScript 闭包」「GTNH 炼钢」「塔菲 麦克风」已验证能按元数据分类、折叠卡片且无页面脚本错误。这些检查不代表人工标注过相关性准确率；真实 Tampermonkey 的执行环境仍需用户侧复验。

## 边界与排查

- 这是界面屏蔽工具，不会阻止推荐接口请求，也不会改变 B 站的推荐算法。推荐数据仍可能下载，但匹配区域不会显示。
- 不含统计上报、远程代码或第三方 AI 请求。扩展新增 `storage`（只保存功能开关）和 `declarativeNetRequestWithHostAccess`（游客开关）权限；后台仅协调游客网络规则。没有申请 cookies、tabs 或 webRequest 权限。搜索桥只传递视频标题、简介、标签、ID、目标地址和推广标记，不传递账户状态、Cookie 或推广追踪数据。
- 首页推荐区域会留空，这是有意的；搜索栏和顶部个人入口仍可使用。
- 样式只作用于已知选择器。B 站改版、更换 class、切换实验版本或引入新的 Shadow DOM 容器后，可能需要更新规则；不能保证未知页面结构也完全屏蔽。
- 顶部第 7 / 8 / 9 项沿用原规则。如果 B 站调整导航顺序而误隐藏了需要的入口，可在 `src/rules.mjs` 删除或修改「位置兼容规则」组后重新构建。
- 占位词清除不会改动搜索框真正的输入内容。如果网站把推荐词写进 `value`、用额外节点渲染，或在空搜索时使用默认关键词，那属于其他机制，需要另加针对性规则。
- 首次安装、扩展更新、重新启用扩展之后，必须刷新已有页面。确认扩展的站点访问权限包含 B 站；若仍有推荐漏出，先确认具体页面的元素是否匹配现有选择器。
- 搜索筛选只能处理 B 站已经返回的候选；不会找回搜索接口没有返回的视频。B 站更改初始数据、卡片或请求结构时，元数据可能暂时不可用，未知结果会保留并标记，避免误删。

实现依据：[Chromium 静态 content scripts 的 CSS 注入时机](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)、[Edge 加载本地扩展](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)、[Tampermonkey 的 run-at](https://www.tampermonkey.net/documentation.php?q=run_at)。
