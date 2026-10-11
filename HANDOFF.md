# 交接文档（给 WorkBuddy / 任何新接手的 Agent）

> 写这份文档的人：上一个在这个项目上连续做了十几轮改动的 Agent。  
> 你现在看到的是 **2026-10** 的状态。**先读完第 1 节跑通验证，再读第 4 节的设计军规，然后再动手。**

---

## 0. 路径（先解决「找不到路径」）

| 是什么              | 绝对路径                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **项目根目录**        | `C:\Users\shawn\wordlord-mini`                                                                            |
| 源码               | `C:\Users\shawn\wordlord-mini\src`                                                                        |
| 编译产物（微信开发者工具读这里） | `C:\Users\shawn\wordlord-mini\dist`                                                                       |
| 微信开发者工具项目配置      | `C:\Users\shawn\wordlord-mini\project.config.json`（`miniprogramRoot: "dist/"`，appid `wxf46a75f64921bdca`） |
| 设计评审技能（可选）       | `C:\Users\shawn\.dsh\skills\weapp-ui`                                                                     |
| 那个技能里的静态体检脚本     | `C:\Users\shawn\.dsh\skills\weapp-ui\scripts\audit-weapp-ui.mjs`                                          |
| **设计决策的唯一真相**    | `C:\Users\shawn\wordlord-mini\README.md`（800+ 行，每个决定都有「为什么」）                                              |

⚠️ **不要**在 `C:\Users\shawn\Documents\deepseek-harness\default-workspace` 里找这个项目 —— 那只是一个空的会话工作目录，项目不在这里。

---

## 1. 第一件事：跑一遍验证（应该全绿）

```powershell
cd C:\Users\shawn\wordlord-mini
npx tsc --noEmit                              # 期望：没有任何输出（项目开了 noUnusedLocals，未使用的 import 会报错）
npm run build:weapp                           # 期望：末行 "Compiled successfully in X.Xs"
node C:\Users\shawn\.dsh\skills\weapp-ui\scripts\audit-weapp-ui.mjs .
```

体检脚本的期望输出：**只有 3 条 INFO**（`px-in-style` 一处、`longpress-hidden` 两处），这三条是已知且故意的；  
任何新的 WARN/MEDIUM 都是你这轮引入的。

**两个必须知道的构建约定**：

1. **构建不会清空 `dist`**（`config/index.ts` 里 `output.clean: false`）。这是故意的：微信开发者工具开着时，  
   清空 dist 会造成「找不到 app.json」并白屏。**代价**：删掉/改名页面后，`dist\pages\<旧页面>` 会残留，  
   要么手动删那个目录，要么跑一次 `npm run clean`（会白屏几秒，之后再 build）。
2. 改完源码**必须 `npm run build:weapp`**，否则开发者工具里看不到变化（它读 `dist/`）。

---

## 2. 这个项目是什么

**「单词君」微信小程序**：Taro 4.2.1 + React 18 + TypeScript，编译目标 `weapp`。  
一个背六级单词的工具，核心是「翻书页」（一页 10 个词，先考你再露释义）+ 生词本 + 复习 + 计划。

- **没有任何后端逻辑在页面里**：所有数据都在 `src/store/storage.ts`（微信本地缓存），  
  云同步（`src/services/sync.ts` + `cloudfunctions/wordlord`）是**可选**的，没配环境 ID 时整条链路静默关闭。
- **13 个页面**，注册在 `src/app.config.ts`。**⚠️ 数组第一项就是启动页**（现在是 `pages/home/index`）。
- 没有原生 tabBar：底部 Tab 栏是自绘组件（`src/components/tab-bar.tsx`），只有翻书页 / 生词本 / 熟练掌握词汇渲染它。

---

## 3. 页面地图

| 路由                         | 职责                                                            | 文件                                 |
| -------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| `pages/home/index`         | **启动页**：封面（单词君）+ 下一个词 + 今日 + 计划 + 「背单词」+ 3 个入口。**一屏不滚动、无导航栏** | `src/pages/home/index.tsx`         |
| `pages/stats/index`        | **数据**：节奏（7/30 天图）/ 累计 / 词汇 / 生词库。**四个分区、无卡片**                | `src/pages/stats/index.tsx`        |
| `pages/plan/index`         | **计划**：按日期 or 按每天数量两种模式 + 领先/落后 + 预测 + 一键放宽                   | `src/pages/plan/index.tsx`         |
| `pages/index/index`        | 词书列表（六级 / 我的上传）                                               | `src/pages/index/index.tsx`        |
| `pages/levels/index`       | 档次（高频/中频/低频/完整）                                               | `src/pages/levels/index.tsx`       |
| `pages/reader/index`       | **翻书页**（核心页）：一页 10 个词、标记圆圈、「我会了」                              | `src/pages/reader/index.tsx`       |
| `pages/vocab/index`        | 生词本首页：**不显示单词**，只放复习设置 + 入口                                   | `src/pages/vocab/index.tsx`        |
| `pages/vocab-all/index`    | 全部生词（分批 80 个展开）                                               | `src/pages/vocab-all/index.tsx`    |
| `pages/mastered/index`     | 熟练掌握词汇（点过「我会了」的词），分页翻                                         | `src/pages/mastered/index.tsx`     |
| `pages/review/index`       | 卡片式复习：一屏一词，我会了 / 还不认识 / 跳过                                    | `src/pages/review/index.tsx`       |
| `pages/review-log/index`   | 复习记录：按标记 7~1 分档的目录                                            | `src/pages/review-log/index.tsx`   |
| `pages/review-level/index` | 标记档位：某一档的全部单词 + 随机抽查                                          | `src/pages/review-level/index.tsx` |
| `pages/uploads/index`      | 上传 CSV 词表                                                     | `src/pages/uploads/index.tsx`      |

**共用组件**（`src/components/`）：`nav-bar`（含返回 / big 大标题）、`tab-bar`、`pager-bar`（上一页/下一页）、  
`mark-circle`（标记圆圈，视觉 56rpx / 热区 88rpx）、`master-pill`（「我会了」药丸）、  
`list-row`、`error-box`（列表页兜底：出错把原文摊在屏幕上）。  
**主题与度量**：`src/theme.ts`（颜色/字号/公用样式 + `PRESS` 按下态）、`src/app.css`（玻璃配方 + `.press`）、  
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
11. **「每天背多少」只有一个来源**：有计划听计划的 `perDay`，没计划才用 `dailyGoal`。别再引入第三个。
12. **隐藏操作（长按）必须有静态提示或等价可见入口**。
13. **中文注释写「为什么」**：这个项目的注释密度是刻意的，接手的人靠它理解取舍。改代码时**保留并更新**注释。

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

---

## 6. 数据层速查（`src/store/storage.ts`，900+ 行）

微信本地缓存 key：

| key                                                         | 内容                                                                                                               | 上云？                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `wordlord_progress_v3`                                      | `单词 -> 标记次数(1–7)`                                                                                                | ✅                      |
| `wordlord_mastered_v3`                                      | `单词 -> 掌握时间戳`                                                                                                    | ✅                      |
| `wordlord_marked_at_v1`                                     | `单词 -> 最近一次标记时间`（复习挑词排序 + 抽查加权用）                                                                                 | ❌ 本地                   |
| `wordlord_state_v3`                                         | 翻页位置 / 今日计数 / `daily` 每天词数 / `dailyGoal` 每日目标 / `plan` 学习计划 / `lastReader` / `reviews` 复习记录 / `reviewBatch` 复习批量 | 部分（只有翻页位置和 lastReader） |
| `wordlord_upload_index_v3` + `wordlord_upload_book_v3_<id>` | 上传的词书                                                                                                            | ✅                      |

几条**必须知道的口径**：

- **「今日已背 N 个词」** = 今天**点过标记或点过「我会了」**&#x7684;词（去重），不是「翻到过多少词」。  
  写入点在 `incrementMark()` / `masterWord()` 里，所以**在哪一页动手都算**。  
  口径换过一次，用 `todayWordsRule` 版本号做一次性迁移（重建当天数据，不是清 0）。
- **零点清零**：所有读写今日计数的入口都先过 `resetToday()`（跨天清 `todayPageCount`/`todayMarkCount`/`todayWords`）。  
  `daily` 历史**不清**，它是累计统计的来源。
- **计划**只存五个事实（`bookId`/`level`/`deadline`/`perDay`/`startedAt`/`baseDone`/`scopeTotal`），  
  其中 **`deadline` 和 `perDay` 只存一个**（另一个永远现算）。`getPlanStatus()` 算全部派生量。  
  ⚠️ 两个刻度别混：`done`/`scopeTotal` 是**整本书绝对进度**，`plannedDone` 从 `baseDone` 起算。
- **`setPlan()` 同一本书同一档会保留起点和分母**（是「调整」不是「重开」）。
- **两个预测函数别混**：`forecastByPace()` 永远用**最近实际速度**；`getPlanStatus().etaDate`  
  在「按每天数量」模式下用**用户定的量**。
- 符号约定：`etaLateDays = daysBetween(deadline, etaDate)`，**正数 = 会晚到，负数 = 能提前**（写反了最危险）。
- 日期工具：`todayString()` 本地日期、`daysBetween()` 按 **UTC 零点**解析（跨月跨年不受时区影响）、  
  `shortDate()` 跨年才显示年份。

这些算式都有**独立的断言脚本**跑过（这一轮就跑了：计划两种模式 25 条、应完成 18 条、预测与文案 16 条、  
跨年日期 7 条、柱状图 18 条、目标底柱 10 条），但脚本是临时的、**没有进仓库** ——  
改这些算式时请自己重新推导一遍，别凭感觉。

---

## 7. 没做完 / 可以接着做的

1. **git 全部没提交**：`git log` 只有 `7eadfe0 Initial Commit`，工作区有 **39 个改动文件**（含大量未跟踪的新目录）。  
   接手第一件事建议先提交一次快照，别让这些改动只存在于磁盘上。
2. **深色模式没做**（README 里明确写着「要么整套要么不做」，现在是「不做」）。  
   要做就得动 `app.json` 的 `darkmode` + `theme.json` + 所有硬编码色 + 玻璃配方。
3. **计划口径**：现在进度按「**已掌握**」算。用户提过一个更根本的问题 ——  
   「标记过算不算学习进度？」（他习惯点标记，掌握得少，计划进度几乎不动）。这是个产品决策，要问他。
4. **订阅消息提醒**：每天固定时间推「今天还差 N 个词」。项目已有云函数（`cloudfunctions/wordlord`），  
   接定时触发器 + 用户一次性订阅即可。
5. **计划历史 / 多计划**：现在只能一个计划，结束就删。
6. **「全部生词」和「标记档位」两个列表页**用 80 一批的分批展开，如果数据量大可以考虑虚拟列表。
7. 体检脚本是**启发式**的（会误报），它查不出对比度是否达标、信息层级、真机渲染差异 —— 别把它当结论。

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
