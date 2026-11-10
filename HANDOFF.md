# 交接文档（给 WorkBuddy / 任何新接手的 Agent）

> 写这份文档的人：上一个在这个项目上连续做了十几轮改动的 Agent。  
> 你现在看到的是 **2026-11 第十轮（P2：例句 + 主词书管理）之后**的状态。**先读完第 1 节跑通验证，再读第 4 节的设计军规，然后再动手。**

---

## 0. 路径（先解决「找不到路径」）

> ⚠️ **这个仓库可能同时有多个 Agent 在改。** 动手写代码前先跑 `git status --short` 和 `git diff --stat`：
> 如果只有一两个文件是脏的、而且不是你改的，那就是别人正在做的一轮 —— **先读、再决定**，别直接覆盖。
> 已知的协作痕迹：`e28380d snapshot: 改造前的工作区快照（40 个文件）` 是接手前的一次快照提交；
> 之后另一个 Agent 做了「数据页第六轮」（环比 `comparePeriods` / 活跃度带 `getActivityDays` /
> 图表空状态兜底 / 词汇区同构），README 的数据页小节已补记，并修掉了三处标签与实现不符的地方。

| 是什么              | 绝对路径                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **项目根目录**        | `C:\Users\shawn\wordlord-mini`                                                                            |
| 源码               | `C:\Users\shawn\wordlord-mini\src`                                                                        |
| 编译产物（微信开发者工具读这里） | `C:\Users\shawn\wordlord-mini\dist`                                                                       |
| 微信开发者工具项目配置      | `C:\Users\shawn\wordlord-mini\project.config.json`（`miniprogramRoot: "dist/"`，appid `wxf46a75f64921bdca`） |
| 设计评审技能（可选）       | `C:\Users\shawn\.dsh\skills\weapp-ui`                                                                     |
| 那个技能里的静态体检脚本     | `C:\Users\shawn\.dsh\skills\weapp-ui\scripts\audit-weapp-ui.mjs`                                          |
| 例句数据（R9）           | 产物 `src\data\examples.json`；管线 `scripts\build-examples.mjs`（`slice` / `merge`）；中间分片 `.worddata\examples\`（gitignore） |
| **设计决策的唯一真相**    | `C:\Users\shawn\wordlord-mini\README.md`（1200+ 行，每个决定都有「为什么」）                                              |

⚠️ **不要**在 `C:\Users\shawn\Documents\deepseek-harness\default-workspace` 里找这个项目 —— 那只是一个空的会话工作目录，项目不在这里。

---

## 1. 第一件事：跑一遍验证（应该全绿）

```powershell
cd C:\Users\shawn\wordlord-mini
npx tsc --noEmit                              # 期望：没有任何输出（项目开了 noUnusedLocals，未使用的 import 会报错）
npm run build:weapp                           # 期望：末行 "Compiled successfully in X.Xs"
node C:\Users\shawn\.dsh\skills\weapp-ui\scripts\audit-weapp-ui.mjs .
npx tsc -p p0-check/tsconfig.json; node p0-check/run.js   # 期望末行「结果：74 通过 / 0 失败」
```

体检脚本的期望输出：**只有 3 条 INFO**（`px-in-style` 一处、`longpress-hidden` 两处），这三条是已知且故意的；  
任何新的 WARN/MEDIUM 都是你这轮引入的。  
（跑过 `p0-check` 之后，`p0-check/lib` 里编译出来的组件会被一起扫到，多两条重复的 INFO —— 那是产物，不是新问题。）

**两个必须知道的构建约定**：

1. **构建不会清空 `dist`**（`config/index.ts` 里 `output.clean: false`）。这是故意的：微信开发者工具开着时，  
   清空 dist 会造成「找不到 app.json」并白屏。**代价**：删掉/改名页面后，`dist\pages\<旧页面>` 会残留，  
   要么手动删那个目录，要么跑一次 `npm run clean`（会白屏几秒，之后再 build）。
2. 改完源码**必须 `npm run build:weapp`**，否则开发者工具里看不到变化（它读 `dist/`）。

> ⚠️ **`dist` 里的 H5 残留会让主包超过 2MB 上限**（2026-10 第七轮清过一次）：
> `npm run build:h5` 也输出到同一个 `dist`，产物是 `dist/js/*.js` + `dist/css/*.css` + `dist/index.html`
> —— 它们是 H5 的，**weapp 的 app.json 一个字都不引用**，但会被算进小程序代码包。
> 清过一次：2.3MB → 0.74MB（微信主包上限 2MB，超了直接传不上去）。
> 跑过 H5 构建之后，记得 `npm run clean:h5` 再 build weapp。

---

## 2. 这个项目是什么

**「单词君」微信小程序**：Taro 4.2.1 + React 18 + TypeScript，编译目标 `weapp`。  
一个背六级单词的工具，核心是「翻书页」（一页 10 个词，先考你再露释义）+ 生词本 + 复习 + 计划。

- **没有任何后端逻辑在页面里**：所有数据都在 `src/store/storage.ts`（微信本地缓存），  
  云同步（`src/services/sync.ts` + `cloudfunctions/wordlord`）是**可选**的，没配环境 ID 时整条链路静默关闭。
- **14 个页面**，注册在 `src/app.config.ts`。**⚠️ 数组第一项就是启动页**（现在是 `pages/home/index`）。
- 没有原生 tabBar：底部 Tab 栏是自绘组件（`src/components/tab-bar.tsx`），只有翻书页 / 生词本 / 熟练掌握词汇渲染它。

---

## 3. 页面地图

| 路由                         | 职责                                                            | 文件                                 |
| -------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| `pages/home/index`         | **启动页**：顶部总进度（主词书整体 / 距考试 / 预计完成日 / 今日待办，R8）+ 封面（单词君）+ 下一个词 + 今日 + **复习（一次一批）** + 计划 + **查词** + 「背单词」+ 3 个入口。**一屏不滚动、无导航栏** | `src/pages/home/index.tsx`         |
| `pages/stats/index`        | **数据**：节奏（7/30 天图，96rpx 高）/ 累计 / 词汇（**只按主词书**，R10）/ 生词库（今天该复习**一批** + 主按钮）/ 本地数据（备份 + **主词书设置**）。**五个分区、无卡片**                | `src/pages/stats/index.tsx`        |
| `pages/plan/index`         | **计划**：按日期 or 按每天数量两种模式 + 领先/落后 + 预测 + 一键放宽；词书默认主词书（R10）                   | `src/pages/plan/index.tsx`         |
| `pages/index/index`        | **词书管理**（R10）：主词书一行 + 归档词书（默认折叠，可设为主词书 / 删除）+ 我的上传入口                                  | `src/pages/index/index.tsx`        |
| `pages/levels/index`       | 档次（高频/中频/低频/完整）                                               | `src/pages/levels/index.tsx`       |
| `pages/reader/index`       | **翻书页**（核心页）：一页 10 个词、标记圆圈、「我会了」                              | `src/pages/reader/index.tsx`       |
| `pages/vocab/index`        | 生词本首页：**不显示单词**，只放复习设置 + 入口（R7：默认一批 20）                         | `src/pages/vocab/index.tsx`        |
| `pages/vocab-all/index`    | 全部生词（分批 80 个展开；**释义默认藏着、点卡片展开** R6）                           | `src/pages/vocab-all/index.tsx`    |
| `pages/search/index`       | **查词**（R5）：主词书内匹配 → 模糊列表 → 表外词自建并加入生词本                           | `src/pages/search/index.tsx`       |
| `pages/mastered/index`     | 熟练掌握词汇（点过「我会了」的词），分页翻                                         | `src/pages/mastered/index.tsx`     |
| `pages/review/index`       | 卡片式复习：一屏一词，我会了 / 还不认识 / 跳过                                    | `src/pages/review/index.tsx`       |
| `pages/review-log/index`   | 复习记录：按标记 7~1 分档的目录                                            | `src/pages/review-log/index.tsx`   |
| `pages/review-level/index` | 标记档位：某一档的全部单词 + 随机抽查                                          | `src/pages/review-level/index.tsx` |
| `pages/uploads/index`      | 上传 CSV 词表（这些书归在「归档词书」里，R10）                                  | `src/pages/uploads/index.tsx`      |

**共用组件**（`src/components/`）：`nav-bar`（含返回 / big 大标题）、`tab-bar`、`pager-bar`（上一页/下一页）、  
`mark-circle`（标记圆圈，视觉 56rpx / 热区 88rpx）、`master-pill`（「我会了」药丸）、`chip`（**小胶囊，视觉 56rpx / 热区 88rpx**，新写胶囊一律用它）、  
`speak-btn`（发音按钮，喇叭是纯 CSS 画的）、`list-row`、`error-box`（列表页兜底：出错把原文摊在屏幕上）。  
**主题与度量**：`src/theme.ts`（颜色/字号/公用样式 + `PRESS` 按下态）、`src/app.css`（玻璃配方 + `.press` + `.text-break` + 喇叭图标）、  
`src/utils/metrics.ts`（安全区、导航栏/Tab 栏高度）。

---

## 4. 动手前必读：设计军规（用户反复要求「不能乱」「要高级」）

每一条都在 `README.md` 里有展开（含数字和「为什么」），这里只列结论：

1. **项目自带设计系统优先**。挑战 `theme.ts` 里的 token 只有一种理由：它违反硬约束（对比度 / 热区 / 被胶囊遮住）。  
   改了就写清数字（例如「`#86868B` 白底 3.62:1 → 换 `#6E6E73` 5.07:1」）。
2. **一套栅格**：所有信息行都是「标签列 **144rpx** + 值列」，值永远从同一个 x 开始。
3. **数据页不要卡片、不要分割线**：分区靠 **48rpx 空白 + 22rpx 灰字小标题**。  
   一页四张卡就是「卡片堆」，这是用户骂过「乱」的原因。
4. **图形只有发丝级**：进度 **4rpx**、柱状图细柱。图形越小越像数据，越大越像仪表盘。
5. **全页只有一个彩色**：`COLOR.progress`（蓝）= 进度。黑色只留给主操作（黑底胶囊）。
6. **对比度按真值算**：小字（≤24rpx）≥ **4.5:1**，大字/粗体 ≥ **3:1**，非文字控件 ≥ **3:1**。  
   常用值见 `README.md` 的对比度表（已实测）。
7. **可点元素必须 `{...PRESS}`**（来自 `theme.ts`）：微信里 `:hover` / `cursor` 完全无效，  
   触屏唯一的按下反馈是 `hover-class`，`hoverStartTime: 0` 不能省。
8. **可点区域 ≥ 88rpx**：视觉尺寸可以小，热区用 padding + **负外边距**撑大（行高不变）。
9. **封面一屏不滚动**（`100vh` flex + `space-between`）→ 因此**不需要导航栏**，也就不会有重复标题。
10. **日期文案一律走 `storage.shortDate()`**：跨年时只写 `03-12` 会被读成「今年」。
11. **「每天背多少」只有一个来源：`getDailyGoal()` = `DAILY_GOAL` = 34**（2026-11 第八轮改的）。
    首页 / 数据页 / 打卡全读它；`plan.perDay` 只是「计划为赶上截止日需要的量」，是派生结果，
    不是第二个目标。**别再引入第三个**（原来那套「有计划听计划、没计划听 `dailyGoal`」已经作废）。
    ⚠️ **34 只是进度条的分母，不是每天的天花板**（2026-11 用户要求「每天可以背无限个，不限量」）：
    翻书页 / 卡片页背完一批后「再背 / 继续背」按钮**永远在**（只要这一档还有没碰过的词），
    超额之后也不收走；`reader` 不再按「配额 − 今日已背」裁剪第一批。别把上限加回来。
12. **隐藏操作（长按）必须有静态提示或等价可见入口**。
13. **中文注释写「为什么」**：这个项目的注释密度是刻意的，接手的人靠它理解取舍。改代码时**保留并更新**注释。
14. **统计只按「主词书」一本算**（2026-11 第十轮 R10）：页面里**不许再 import `ALL_WORDS`**，
    一律走 `store/books.ts` 的 `mainBookWords()` / `mainBookTitle()`。其它词书是「归档词书」，
    它们的词频标签不参与任何统计（用户报的正是「两本的高频定义对不上账」）。
15. **例句的来源必须标出来**（第十轮 R9）：AI 生成的一律显示「AI 生成例句，仅供参考」，
    真题原句显示「六级真题 · 出处」。加例句只走 `exampleOf()`，查不到就**不占位**（不编句子）。

---

## 5. 踩过的坑（别重复踩）

| 坑                         | 事实                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-webkit-backdrop-filter` | **会被 WXSS 编译器整个丢掉**，只有标准属性活着 → iOS 18 之前玻璃退化成半透明白，**必须给不依赖模糊的底色**                                                                                                           |
| Taro 的 CSS 单位             | `.css` 里的 **`1px` 会被 1:1 写成 `1rpx`**（designWidth 750）；要物理像素写大写 `PX`                                                                                                         |
| Taro 行内样式白名单              | `textOverflow` / `wordBreak` / `overflowWrap` / `backdropFilter` 会被**静默丢掉** → 这些必须写进 `.css`                                                                                 |
| 边框                        | Taro 必须显式写 `borderStyle: 'solid'`，否则 CSS 初始值 `none` 一条线都不画                                                                                                                  |
| 自定义导航栏                    | `navigationStyle: custom` 会**连系统返回一起隐藏** → 返回箭头要自己画；`big` 大标题要带返回时用紧凑栏，内边距用 `bigNavBarHeightPx(true)`                                                                       |
| ScrollView                | **不虚拟化**：一次挂上千个节点会卡 → 「全列出来」的页面统一 `CHUNK = 80` 分批 + 「显示更多」                                                                                                                  |
| 事件冒泡                      | 父子都挂 `onClick` 会触发两次 → 装饰性子元素传 `noop`，点击落在整颗药丸上                                                                                                                             |
| 每日历史                      | `wordlord_state_v3.daily` **只留最近 62 天**（`pruneDaily`），所以「最长连续 / 总词数」只算 62 天内                                                                                                |
| 真机差异                      | 开发者工具是 Chromium，**玻璃/字体/圆角/模糊都可能不一样**，最终以真机为准                                                                                                                               |
| **改源码的方式**                | ⚠️ **必须用编辑工具改文件，不要用 shell 字符串替换** —— 上一轮我用 PowerShell 做替换，把 `pages/plan/index.tsx` 的 UTF-8 双重编码搞坏（`'已达成'` → `'宸茶揪鎴?'`），`tsc` 报了一堆「未终止的字符串」才发现。源码是 UTF-8，shell 的读写编码很容易把中文毁掉 |
| `showModal` 的 `editable`   | 带输入框的 Modal（基础库 2.17.1+）**Taro 4.2.1 的类型声明里没有** → `tsc` 会报 `editable does not exist`。运行时原样透传，所以断言绕开类型即可（见 `pages/stats/index.tsx` 的 `restore()`），别为了迁就类型去新开一个只有粘贴框的页面 |
| 音频播放与域名白名单                 | `InnerAudioContext`（`services/tts.ts` 的发音）**不受「request 合法域名」限制** —— 白名单管的是 `wx.request` / `downloadFile` 这类接口。所以词典音频地址不需要在 mp 后台配任何东西；代价是要联网 |
| 写缓存会抛异常                    | 微信本地缓存上限 10MB，写满时 `setStorageSync` **直接抛**。裸调用会让异常冒到 `onClick`，表现成「点了没反应」+ 数据已丢。**所有写路径一律 `safeWrite()`**（storage.ts），失败会在数据页顶部提示 |
| JSON 顶层别放 `default` 键          | 词表里**真的有一个词叫 `default`**。例句表要是按 `word -> [...]` 摊在 JSON 顶层，`import x from './examples.json'`（CJS 产物 = `require(...).default`）拿到的是**那个词的例句数组**，症状是「所有词都查不到例句」而且**不报错**。所以数据装在 `words` 子对象里（`data/examples.json`），`p0-check` 有一条回归断言 |
| H5 预览量不到行内 rpx 字号            | `_scratch_weapp` 那套 H5 预览里，Taro 的 pxTransform 会把**行内 style 里带 `rpx` 的 `font-size` / `margin` / `line-height` 整条丢掉**（页面上所有字看起来一样大、也几乎没有间距）。预览只能验「内容 / 结构对不对」，字号和间距以**源码 + 真机**为准 |
| 开发者工具起不来（2026-10 遇到）       | 把开发者工具关掉之后再启动，可能一直起不来（进程秒退、日志里 `webcontents-render-process-gone reason: crashed`）。清 `%APPDATA%\微信开发者工具\GPUCache`、`Code Cache` 也没救回来；服务端口在 `WeappLocalData\ls_*.json` 里改了会被覆盖（要在 IDE 里手动开）。**结论：别随手 kill 开发者工具**；预览一律以它自己打开的那个实例为准 |

---

## 6. 数据层速查（`src/store/storage.ts`，900+ 行）

微信本地缓存 key：

| key                                                         | 内容                                                                                                               | 上云？                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `wordlord_progress_v3`                                      | `单词 -> 标记次数(1–7)`                                                                                                | ✅                      |
| `wordlord_mastered_v3`                                      | `单词 -> 掌握时间戳`                                                                                                    | ✅                      |
| `wordlord_marked_at_v1`                                     | `单词 -> 最近一次标记时间`（复习挑词排序 + 抽查加权用）                                                                                 | ❌ 本地                   |
| `wordlord_state_v3`                                         | 翻页位置 / 今日计数 / `daily` 每天词数 / `examDate` 考试日期（计划页锚点）/ `plan` 学习计划 / `lastReader` / `reviews` 复习记录 / `reviewBatch` 复习批量。⚠️ `dailyGoal` 是**废弃字段**：2026-11 起每日目标固定为 `DAILY_GOAL`=34，没有任何读取方 | 部分（只有翻页位置和 lastReader） |
| `wordlord_upload_index_v3` + `wordlord_upload_book_v3_<id>` | 上传的词书                                                                                                            | ✅                      |
| `wordlord_main_book_v1`                                     | **当前主词书 id**（R10，默认 `builtin`）。统计（整体 / 三个词频档 / 查词范围 / 计划默认落点）只认这一本；指定的上传词书被删掉时 `getMainBookId()` 自动退回内置 | ❌ 本地（但备份会带上它）          |
| `src/data/examples.json`（不是缓存）                             | 例句表 `words[word] = [英文, 中文, 出处?]`，第三项在 = 真题、缺 = AI 生成（页面必须标出来）。由 `scripts/build-examples.mjs` 生成          | 随包发布                    |

几条**必须知道的口径**：

- **统计的分母只有一个来源：主词书**（R10）。`store/books.ts` 的 `mainBookWords()` / `mainBookTitle()`
  是唯一入口，页面里**不许再 import `ALL_WORDS`**（首页总进度 / 数据页「词汇」区 / 查词范围 /
  计划默认落点都走它）。归档词书的词频标签**不参与任何统计**。
  数据页的「背过的词」是**活动量**（全部词书），界面上写明了「全部词书 · …」——
  它和「词汇 · 主词书」本来就不是一个口径，别再让它们看着像同一个。

- **「今日已背 N 个词」** = 今天**点过标记或点过「我会了」**&#x7684;词（去重），不是「翻到过多少词」。  
  写入点在 `incrementMark()` / `masterWord()` 里，所以**在哪一页动手都算**。  
  口径换过一次，用 `todayWordsRule` 版本号做一次性迁移（重建当天数据，不是清 0）。
- **今日口径只有一个（2026-11 第八轮收紧）**：显示「今天背了多少」**一律**走 `getTodayWordCount()`
  （首页 / 翻书页 / 数据页 / 计划页）；数据页的节奏图、合计、达标天数、活跃度带、环比、连续天数
  一律走 `dailyLoggedCount()`（今天那一格 = `max(loadTodayCounts().wordCount, daily[今天])`）。
  `daily` 和 `todayWords` 由 `addTodayWord()` 同时写、并在 `resetToday()` 里用 `syncDailyToday()`
  对齐。**别绕过这两个函数直接读 `daily`** —— 用户截图里「今日 22/20」配「合计 1 个词」就是这么来的。
- **零点清零**：所有读写今日计数的入口都先过 `resetToday()`（跨天清 `todayPageCount`/`todayMarkCount`/`todayWords`）。  
  `daily` 历史**不清**，它是累计统计的来源。跨天时若去重表被清空而 `daily[今天]` 还有记录，**认历史记录**。
- **计划**只存五个事实（`bookId`/`level`/`deadline`/`perDay`/`startedAt`/`baseDone`/`scopeTotal`），  
  其中 **`deadline` 和 `perDay` 只存一个**（另一个永远现算）。`getPlanStatus()` 算全部派生量。  
  ⚠️ 两个刻度别混：`done`/`scopeTotal` 是**整本书绝对进度**，`plannedDone` 从 `baseDone` 起算。  
  ⚠️ `done` 的分子是 `countLearnedWords()`（**标记 ∪ 已掌握，去重**），不是只数 `mastered` ——
  用户习惯在翻书页点标记，只数 `mastered` 会让进度条长期钉在 0。
- **第一轮缓冲期是提示线，不是闸门（2026-11 第四轮改的）**：`FIRST_ROUND_DEADLINE = 2026-12-02`
  （考试 `examDate` 默认 `2026-12-12`，可改但**不影响 12-02**）。用户要求「计划完全由自己定」，
  所以没有任何一处拿它去拒绝或改写用户的设定：`checkBuffer()` 只用来出提示（「会晚 7 天」），
  `planAdvice()` 只做除法（剩余 ÷ 每天 + 起点 = 完成日，`respectsBuffer` 恒为 `true`）。
  ⚠️ `respectsBuffer` 是历史字段，别再拿它做拦截；`p0-check` 里对应断言已改成新口径。
- **复习一次只领一批（2026-11 第九轮 R7）**：`REVIEW_BATCH_DEFAULT = 20`（从 10 改的）。
  首页 / 数据页 / 生词本报的都是 `min(每批几个, 今天到期数)`，**不要**再用 `due.due` 直接
  当 `?size=` 传给复习页（那正是 R7 要修掉的「一次推 62 个」）。做完一批回到首页再领下一批，
  剩下的顺带顺延 —— 判过的词 `markReviewed()` 会把到期日推到未来。
  用户填过 `reviewBatch` 就按他填的（0 = 全部，只有生词本里能选）。
- **`setPlan()` 同一本书同一档会保留起点和分母**（是「调整」不是「重开」）。
- **两个预测函数别混**：`forecastByPace()` 永远用**最近实际速度**；`getPlanStatus().etaDate`  
  在「按每天数量」模式下用**用户定的量**。
- 符号约定：`etaLateDays = daysBetween(deadline, etaDate)`，**正数 = 会晚到，负数 = 能提前**（写反了最危险）。
- 日期工具：`todayString()` 本地日期、`daysBetween()` 按 **UTC 零点**解析（跨月跨年不受时区影响）、  
  `shortDate()` 跨年才显示年份。
- **间隔重复（第七轮加的，零新增缓存 key）**：`REVIEW_INTERVALS = [1,2,4,7,15,30,60]` 天，
  下标 = 标记次数 − 1；`到期日 = max(markedAt, reviewedAt) + 间隔(markCount)`。  
  `getReviewDue()`（首页 / 生词本 / 数据页共用）、`getDueWords(limit)`、`scheduleOf(w)`。  
  **复习页的「还不认识」走 `markForgotten()`（打回第 1 档），不是 `incrementMark()`（+1 会让间隔变长）**；
  翻书页的圆圈仍然是 +1。两个入口别再合并。
- **累计口径有两套，别混**：`daily` 加总（`totalWords`，只覆盖最近 62 天）vs
  `countTouchedWords()`（`progress` ∪ `mastered`，**数据页「背过的词」用的是这个**）。
  用前者当「累计」会和老用户的实际进度自相矛盾。
- **写缓存一律 `safeWrite()`**：它返回 boolean，并在失败时把原因记进模块变量（`getWriteError()`）。
  页面要在界面上显式提示（数据页顶部那条反馈条），不允许静默。
- **备份恢复是覆盖式**：`exportBackup()` → JSON 字符串；`inspectBackup()` 先给用户看清里面有什么；
  `importBackup()` 把 `wordlord_*` 写回去（**不合并** —— 恢复的语义就是回到那个时间点）。

这些算式都有**独立的断言脚本**跑过。⚠️ 2026-11（第八轮）起有一个**进了仓库**：
`p0-check/`（74 条断言，覆盖每日目标唯一性 / 今日四处口径一致 / 口径迁移 / 跨天 / 去重 / 计划算法）：

```powershell
cd C:\Users\shawn\wordlord-mini
npx tsc -p p0-check/tsconfig.json
node p0-check/run.js          # 期望末行「结果：74 通过 / 0 失败」
```

它加载**真的编译产物**（`p0-check/lib`，已 gitignore），只把 `@tarojs/taro` 的缓存接口换成内存实现。
改 `storage.ts` 的口径/日期算式时，**先加一条断言再改代码**。
其余临时脚本（计划两种模式、应完成、预测文案、跨年日期、柱状图）仍然没进仓库 —— 请自己重新推导，别凭感觉。

---

## 7. 没做完 / 可以接着做的

> **2026-10 第七轮已经做掉的**（别再当 TODO 捡起来）：
> ① **间隔重复**：`REVIEW_INTERVALS` + `getReviewDue()` / `getDueWords()` / `scheduleOf()` / `markForgotten()`，
> 首页/生词本/数据页共用一套到期口径；② **写缓存全部走 `safeWrite()`**（写满不再静默丢数据）；
> ③ **备份 / 恢复**（`exportBackup()` / `inspectBackup()` / `importBackup()` + 数据页入口）；
> ④ **发音**（`services/tts.ts` 真接了，翻书页和复习页各一个按钮）；
> ⑤ 复习页**撤销**、翻书页**点词展开释义**、全部生词的**移除可撤销**；
> ⑥ 全站 8 处小热区补到 88rpx、3 处占位符对比度从 1.51:1 改到 4.49:1、超长 Toast 缩短、返回箭头补 aria。

> **2026-11 第八轮（P0，口径统一）已经做掉的**（别再当 TODO 捡起来）：
> ① 每日目标全 app 唯一 = `DAILY_GOAL`（**34**），首页那颗改目标的 ActionSheet 删了；
> ② 数据页「今日 / 达标 / 活跃」三处数字同源（`dailyLoggedCount()` + `syncDailyToday()`，
> 顺手修了「换口径的迁移只重建一半」和「跨天打开」两个会打架的场景）；
> ③ 「六级整体」和三个词频档、计划进度都改成**标记 ∪ 已掌握去重**（`countLearnedWords()`）；
> ④ 计划页新增**考试日期锚点**（默认 2026-12-12）+ **12-02 缓冲期硬约束**
> （`checkBuffer()` / `planAdvice()`，任何建议越界都拒绝并给替代方案）。
> ⚠️ 这条在 **2026-11 第四轮被用户推翻**：缓冲期降级成提示、计划完全由用户定，
> 见第 9 节和 `README` 第八轮第 4 条的最新版本。

> **2026-11 第九轮（P1，体验）已经做掉的**（别再当 TODO 捡起来）：
> ① 查词页 `pages/search`（R5：1 次点击进搜索、表外词可自建并进生词本）；
> ② 全部生词默认藏释义、点卡片展开（R6）；③ 复习**一次只领一批**（R7，默认 20，剩余顺延不算欠账）；
> ④ 首页顶部总进度 + 考试倒计时 + 预计完成日 + 今日待办（R8）。

> **2026-11 第十轮（P2，内容与词书管理）已经做掉的**（别再当 TODO 捡起来）：
> ① **每词一条例句**（R9）：`src/data/examples.json` + `exampleOf()` / `exampleSourceLabel()`，
> 翻书页和复习闪卡各渲染一处；1824 个词全部有例句，**全部是 AI 生成的、全部带「AI 生成例句，仅供参考」**；
> ② **只保留一个主词书**（R10）：`wordlord_main_book_v1` + `store/books.ts` 的
> `mainBookWords()` / `allBooks()` / `archivedBooks()`；词书管理页分「主词书 / 归档词书（默认折叠）」，
> 统计（首页整体 / 数据页词汇区 / 查词范围 / 计划默认）全部只按主词书算。

1. **例句的真题语料还没接**（R9 的「优先用六级真题原句」只做了一半）：
   通道是通的 —— `scripts/build-examples.mjs` 的 `merge` 认 `from` 字段，页面会把带 `from` 的
   例句标成「六级真题 · 出处」。缺的是**语料本身**：本机 GitHub 直连不通（`fetch` 10s 失败，
   只有 harness 的 `web_fetch` 能出去），也没有落盘的授权真题文本。
   拿到语料后改 `out-NN.json` 里对应词条加 `from` 再 `merge` 即可，代码不用动。
   **别凭记忆瞎标「2019.06 阅读」** —— 出处错了比不标更糟。
2. **git 仍然没提交干净**：`git log` 只有两个提交，工作区一直挂着一批改动。
   接手第一件事建议先 `git add -A && git commit` 一次快照。
2. **深色模式没做**（README 里明确写着「要么整套要么不做」，现在仍是「不做」）。
   用户的截图是系统深色下的效果，页面底色仍走 `theme.ts` 的浅色渐变。
   要做就得动 `app.json` 的 `darkmode` + `theme.json` + 所有硬编码色 + 玻璃配方。
3. **云同步仍然是关着的**：`src/cloud/config.ts` 的 `CLOUD_ENV_ID` 是空串 → `initSync()` 直接返回，
   整条云链路静默关闭（备份功能就是为这件事兜底的）。
4. **订阅消息提醒**：每天固定时间推「今天还差 N 个词」。需要小程序后台配模板 ID，
   代码侧做不了 —— 但**到期词的数据已经有了**（`getReviewDue()`），接上去只是接一个模板。
5. **正确率 / 记忆强度统计**：现在 `reviews[word]` 只记 `{at, times}`，没有「判对 / 判错」维度。
   要做得给 `ReviewRecord` 加字段（`again` 次数），再加一次性迁移 —— 会动数据口径，单独一轮做。
6. **计划口径**：进度按「**已掌握**」算，而用户习惯点标记，所以计划进度几乎不动。
   和 `getReviewDue()`（算记忆强度）语义重叠，优先级要产品决策。
7. **计划历史 / 多计划**：现在只能一个计划，结束就删。
8. **「全部生词」和「标记档位」两个列表页**用 80 一批的分批展开，数据量大时可考虑虚拟列表。
9. 体检脚本是**启发式**的（会误报），它查不出对比度是否达标、信息层级、真机渲染差异 —— 别把它当结论。

---

## 8. 给 WorkBuddy 的一句话指令（可直接粘贴）

```text
项目在 C:\Users\shawn\wordlord-mini（微信小程序，Taro + React + TS）。
先读 C:\Users\shawn\wordlord-mini\HANDOFF.md 和 README.md 的相关小节，
然后跑：
  cd C:\Users\shawn\wordlord-mini
  npx tsc --noEmit
  npm run build:weapp
确认全绿之后再动手改代码。改完必须重新 build:weapp（微信开发者工具读 dist/）。
设计要求「对齐、留白、不能乱」：改之前先读 HANDOFF.md 第 4 节的 13 条军规。
不要用 shell 字符串替换改源码（会毁掉中文编码），用编辑器工具改。
```

---

## 9. 2026-11 第四轮：作答流程统一（「认识 / 不认识」类按钮的硬规矩）

用户报的三件事，全部落在这一条规矩上：

> **点「认识 / 不认识 / 我会了」都要：先记录 → 当场展开答案 → 停在原地；
> 按钮变成「下一个」；翻到下一个词再变回来。**

| 位置 | 文件 | 现在的行为 |
| --- | --- | --- |
| 卡片版式 | `components/card-deck.tsx` | `answer(v)` 记录 + `setVerdict(v)`（不换卡）；已作答时按钮是「上一个 / 下一个」；`advance()` 在最后一张进完成面板 |
| 复习页 | `pages/review/index.tsx` | `handleForgot / handleMaster` 只记录 + `setJudged()` + `setRevealed(true)`；`goNext()` 才换词；判定后多了「撤销这一步」（`undoCurrent`，只退当前这个词） |
| 抽查卡 | `pages/review-level/index.tsx` | `handleMaster` 记录后停在原地，按钮只剩「下一个」 |

另外两条经验：

1. **「点了没反应」比「点错」更糟**：任何推进都必须有可见结果（新卡 or 结算屏）。
   所以最后一屏不是 `return`，而是完成面板：「今天的 N 个背完了 / 还要再背 N 个吗」。
2. **一个词不能被判两次**：作答后按钮不再有「认识 / 不认识」，要改就「撤销这一步」。
   （旧版「不认识」之后再点「认识」会把词直接送进「熟练掌握词汇」，等于一次误触抹掉一次判断。）
3. 复核方式：`npm run build:h5` 后 `cd dist && python -m http.server 8777`，
   浏览器 390×844 走一遍「认识 → 下一个 → 到最后一张 → 完成 → 再背一批」。
   ⚠️ H5 预览会丢行内 rpx 字号与间距（见第 5 节的坑），只用来验**交互和文案**，
   跑完记得 `npm run clean:h5` 再 `npm run build:weapp`（否则主包超 2MB）。

---

## 10. 2026-11 第五轮：判定状态按卡片记账 + 生词本等级优先（两条硬规矩）

### 10.1 一条判定只能落在**眼前这个词**上

用户报的现象：「不小心点错认识/不认识 → 点下一个 → 滑回那个词 → 按钮全是好的（还能再点）」。

根因不是按钮坏了，是**记账槽位和卡片对不上**：

| 位置 | 老写法 | 后果 | 现在 |
| --- | --- | --- | --- |
| `components/card-deck.tsx` | 判定按 `index` 记（`verdicts`），但撤销只有一个 `undo` 槽位，里面存 `at: index` | 答 A → 下一个 → 答 B → 滑回 A → 按「返回」时，撤的是 **B**，人还被滑到 B 那张上去 | 判定和撤销都按 `index` 记账（`answers: Record<index, { verdict, wrote }>`）。「↩ 撤销」**只作用于当前这张卡**，不换卡、不动别的词 |
| `pages/review/index.tsx` | 判定是全局 `judged` | 按「上一步」回到上一个词，`judged` 还是 null → 那个已判过的词又长出「还不认识 / 我会了」，能再判一次 | 判定按 `index` 记账（`verdicts`）；「上一步」连带把要回去的那个词的判定清掉（数据已经 `restoreWord` 回滚了） |
| `pages/review-level/index.tsx` | `masteredPick` 是 state | 同一 tick 连点两下会 `masterWord + markReviewed` 记两遍 | 守卫读 `masteredPickRef` |

**通用规矩（以后再写这类页面照这个来）：**

1. **界面状态必须按「这一张卡」记账**（`Record<index, …>`），不能用「这一轮判了没有」的单槽。
   单槽一换卡就失配，表现为「按钮都点得动，但点的是别人的事」。
2. **撤销只退眼前这一张，绝不跨卡移动**。跨卡的「返回」= 用户没要求过的跳转。
3. **守卫读 ref、不读 state**：动画/滚动期间的重复点击，state 要到下一轮渲染才提交，
   同一个 tick 里的第二下会漏过去（一次误触 = 记两遍 / 滑两张卡）。`busyRef` 就是干这个的。
4. **只退真正写过的**：`wrote` 标记那一下有没有落存储 —— 标满 7 次时点「不认识」不加档，
   本来就已掌握的词点「认识」不改状态；撤销这两种情况**只能清界面，不能动数据**
   （否则会把 7 减成 6，或把之前就有的掌握抹掉）。

### 10.2 生词本：等级越高越靠前（**覆盖旧的「到期优先」**）

用户原话：「没有点过认识的单词会按照不认识的七级等级一直出现再生词本，并且等级越高越在前面」。

- `storage.getVocabPool()`：口径不变 —— **`markCount > 0` 且没被掌握**的词；
  只有点「认识」（`masterWord`）才会离开生词本，**判过「不认识」的词会一直在**。
- `storage.pickReviewBatch()`：排序从「到期优先」改成 **`markCount` 降序**
  （7 档永远排 1 档前面），同档内才按 到期日（逾期久的在前）→ 最近动过手 → 字母序。
  理由：高等级间隔长（7 档 60 天），到期优先会让刚到期的 1 档词把它挤到后面，
  越不熟越见不到 —— 和记忆目标正好相反。
- `vocab-all` / `review-log` 本来就走 `getVocabPool()` 的顺序，无需改。
- ⚠️ **入口仍按到期数开门**（首页「复习」在 `due = 0` 时去生词本、数据页 `reviewBatch = 0` 时去生词本）。
  没到期的词从生词本里选「全部」仍然能复习到。要改成「首页永远能直接开复习」，说一声即可。
  → **已被 §11 覆盖**：现在首页只要有词就直接进复习页。

---

## 11. 2026-11 第六轮：七级等级体系（**覆盖 §10.2 的「等级越高越前」**）

用户原话：「分 7 级，复习的时候级别越低出现在越前面，记住每个等级，点一次认识减一个等级一次，
其他的你按照大厂做法优化」。§10.2 的排序方向**反了，已作废**。

### 11.1 等级刻度（唯一一套，两个入口共用）

| 等级 | 含义 | 动作 |
| --- | --- | --- |
| 7 | 完全不认识 | 复习点「不认识」→ **+1 封顶 7** |
| 6…2 | 逐步熟悉 | 每点一次「认识」→ **−1** |
| 1 | 只差最后一关 | 再「认识」一次 → 0 = 掌握 |
| 0 | 已掌握 | 进「熟练掌握词汇」，移出生词本 |

- 存储不变：`wordlord_progress_v3` 里 `word → 1..7`（就是 UI 上的等级），跨天不丢。
- 实现：`storage.reviewKnown()`（−1，落到 0 时内部调 `masterWord`）、
  `storage.reviewForgot()`（+1，封顶 `MAX_MARK`）。`markForgotten()` 保留成 `reviewForgot()` 的别名。
- **「认识」不再是一次性掌握**：从 7 级磨到 0 级要连续答对 7 次 —— 大厂口径（答对一次不等于会，
  连对才算），也是这次用户明确要的「一次减一级」。

### 11.2 排序与间隔

- `pickReviewBatch()`：**等级升序**（1 级永远排 7 级前面）→ 同等级按到期日（逾期久的先）
  → 最近动过手 → 字母序。理由：快掌握的词要趁热打铁连对，断一次就白磨。
- `REVIEW_INTERVALS` 从 `[1,2,4,7,15,30,60]` **反转**成 `[14,10,7,4,3,2,1]`（等级 1..7）：
  等级越高（越不熟）间隔越短。旧表配「认识 = 直接掌握」才自洽，换成「−1」之后它会让
  7 级词等 60 天 —— 越不熟越见不到，正是要避免的那类错。
- 首页「复习」不再用到期数开门：生词库有词就直接进复习页（`openReview`）。

### 11.3 保持不变的地方（别顺手改）

- **翻书页那颗「我会了」药丸仍是「直接掌握」**（长按可撤回）：那是用户主动表达「这个词我会了」，
  和复习口径的「答对磨一级」不是同一个动作。卡片版式的「认识」才是 −1（`handleKnownInDeck`）。
- 生词库口径不变：`markCount > 0 && !mastered`。只有等级落 0 才会离开。
- 卡片/复习页的判定记账仍是**按 index**（见 §10.1），撤销仍是「只作用于眼前这一张」。

### 11.4 实测记录（H5 预览，真实点击）

| 场景 | 结果 |
| --- | --- |
| 播种 1/2/3/4/5/6/7 级各一词，进复习 | 第一张是 **1 级**，顺序 1→2→3…（等级低在前）✅ |
| 1 级点「认识」 | 等级归零 → 进「熟练掌握词汇」，`progress` 里删除、`mastered` 里出现 ✅ |
| 2 级点「还不认识」 | 等级 2→3，回执「等级 +1 · 现在 3/7」✅；「撤销这一步」退回 2 级 ✅ |
| 2 级点「认识」 | 等级 2→1，仍在生词库，回执「等级 2 → 1 · 还差 1 次答对」✅ |
| 卡片版式（0 级新词）点「认识」 | 直接掌握，回执「等级归零 · 已掌握，移出生词本」✅ |
| 卡片版式点「不认识」 | 角标「等级 1/7」，回执「等级 +1 · 现在 1/7」✅ |


