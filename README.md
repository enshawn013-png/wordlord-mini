# 单词君 · 微信小程序版

「单词君」的微信小程序版本（Taro + React + TypeScript）。

## 功能

页面分三层，每层一个独立路由：

```
第一层  词书列表 ──┬── 大学六级（官方词书）──┐
                   │                        │
                   └── 我的上传 ── 某本书 ──┤
                                            ↓
第二层                          高频词 / 中频词 / 低频词 / 完整词表
                                            ↓
第三层                                    翻书
```

| 路由 | 页面 |
| --- | --- |
| `pages/index/index` | 第一层 · 词书列表 |
| `pages/uploads/index` | 第一层 ·「我的上传」书目列表 |
| `pages/levels/index` | 第二层 · 档次（`?bookId=` 指定词书） |
| `pages/reader/index` | 第三层 · 翻书（`?bookId=&level=`） |
| `pages/vocab/index` | 生词本（底部 Tab 栏的第二个 Tab） |

**没有原生 tabBar，但翻书页和生词本底部有自绘的 Tab 栏**（`components/tab-bar.tsx`，两个 Tab：翻书 / 生词本）。
不用微信原生 tabBar 的原因：它是 `app.config.ts` 里编译期写死的，而翻书页必须带 `?bookId=&level=` 才知道翻哪本书，
原生 Tab 给不了参数；`switchTab` 还会把页面栈清空，翻书页左上角的「返回」就废了。
所以自绘一个普通 View 放在页面最后一行——顺便解决了原来的坑：生词本入口放右上角会被微信原生胶囊（… 和 ○）盖住。

**第一层 · 词书列表**（打开小程序默认看到的就是它）—— 只有两项：

| 条目 | 说明 |
| --- | --- |
| 大学六级 | 官方词书，六级大纲新增词 1824 个 |
| 我的上传 | 自己导入的 CSV；一本都没传时显示「暂无上传」 |

这一层不出现高频 / 中频 / 低频。点「我的上传」会先进到上传的书目列表，点某本书再进档次页。

排版照苹果「设置」页来：顶部大标题「单词君」（36rpx 粗体、左边对齐），下面一行行文字，
每行左边书名（32rpx 黑）+ 一行灰色小字说明，右边一个灰色箭头 `›`。
**没有卡片、没有渐变、没有阴影、没有分割线、没有图标**，行高约 100rpx，靠留白分行，左右各留 32rpx。

**第二层 · 档次**：高频词 / 中频词 / 低频词 / 完整词表，每档显示「共 N 词 · 还剩 M 词」，
用的还是第一层那套简洁列表样式（书名换成档次名，右边同样是灰色箭头）。
**每档多少个词不是写死的**，是按词频分布算出来的（见下面「词频分档」）；上传的词表用同一把尺子分档。

**第三层 · 翻书**：每页 10 个词，**像备忘录打开一篇笔记**——字大、留白多、不挤。

```
environmental                     ← 40rpx / font-weight 600 / #1D1D1F
/inˌvaiərənˈmentəl/  adj.         ← 24rpx / #86868B / margin-top 8rpx
                  周围的；环境的    ← 28rpx / #3A3A3C / margin-top 16rpx / 右对齐
(③) [我会了]                       ← margin-top 24rpx / 靠左
      ↑ 条目左右各 32rpx，上下各 32rpx（两个词之间就是 64rpx 的白）
```

- 每条词从上到下四行，一条就是一块
- **不画分割线、不画边框、不做卡片**，全靠留白区分
- 圆圈 44rpx：**单击 = 标记 +1**，**长按 = 标记 −1**（1–7 级，填充色由浅到深，满了停在 7）
- **「我会了」是药丸按钮**：浅灰底 `#F2F2F7` + 圆角 24rpx + 22rpx 灰字，
  点一下变浅绿底 `#E8F5E9` + 绿字 `#34C759` 显示「已掌握」，**长按绿色按钮撤回**（词立刻回到翻书列表）
- 底部：「上一页」/「下一页」两个**圆角胶囊按钮**（黑底白字、高 88rpx、左右各 48rpx、圆角 44rpx），
  居中并排、**固定在底部**不跟着内容滚；再下面是自绘的 Tab 栏
- 导航栏是一块白底 View，没有阴影

> **一屏看得见几个词：4 个左右**（iPhone X 尺寸）。一条词 214rpx 内容 + 64rpx 留白 ≈ 278rpx，
> 一屏 1158rpx 的正文区放得下 4 条。这是用户 2026-09-26 明确要的效果——「大量留白，字大，不挤」，
> **不是缺陷，别自作主张压回去**。`PAGE_SIZE` 还是 10，所以一页要上下滑两三屏才看完。
> **列表整段包在 `ScrollView` 里**（`STYLE.list` = `flex:1`，占满 nav 和底部两块之间的高度），
> 「上一页 / 下一页」翻的是另外 10 个词。

> ⚠️ **写边框必须带 `borderStyle: 'solid'`**。Taro 只是把样式原样透传给 WXSS，而 CSS 里 `border-style` 的初始值是 `none` —— 只写 `borderWidth` + `borderColor` 的话边框一条都不画。空标记圆圈是「透明底 + 灰描边」，漏了这句就会整个隐形，看起来像按钮没渲染出来（这个坑踩过一次）。

**生词本**：所有标记过的词按次数降序，顶部「你有 N 个生词」，每行右侧红色「移除」。
底部同一个 Tab 栏，点「翻书」回到刚才翻的那本书那一档（记在 `wordlord_state_v3.lastReader`）。

**上传**：CSV 列序固定 `word,phonetic,pos,definition`（有表头会自动跳过），存本地缓存，
每上传一次就在「我的上传」里新增一本词书（书名取文件名），导入后自动分好高 / 中 / 低频。

## 环境要求

- Node.js 18+
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（Windows 版）

## 首次运行

```bash
npm install          # 安装依赖
npm run dev:weapp    # 开发模式（监听文件变化，产物输出到 dist/）
# 或
npm run build:weapp  # 一次性构建
```

## 在微信开发者工具中预览

1. 打开微信开发者工具，登录你的微信
2. 「导入项目」→ 目录选择本项目的 **根目录**（`wordlord-mini/`）
   - 开发者工具会自动读取 `project.config.json`（其中 `miniprogramRoot` 指向 `dist/`）
3. 编译后即可在模拟器里操作；真机预览点工具栏的「预览」扫码

> 改了代码后如果开发者工具没反应，重新执行一次 `npm run build:weapp`（或用 `npm run dev:weapp` 挂着监听）。

**上传 CSV 的注意点**：小程序只能通过 `wx.chooseMessageFile` 选取文件，也就是**要从微信聊天记录里选**。所以测试时先把 CSV 发到「文件传输助手」，再在小程序里选它。开发者工具的模拟器里点「上传 CSV 词表」会弹出本地文件选择框。

## AppID 配置

注册小程序后，把 AppID 填到 `project.config.json` 的 `appid` 字段：

```json
{
  "appid": "wx你的一串AppID"
}
```

## 词库数据

`src/data/cet6.json` 是**六级大纲新增词（1824 词）**，按词频从高到低排列，
每个词条带音标 / 词性 / 中文释义：

```json
{ "word": "environmental", "phonetic": "/inˌvaiərənˈmentəl/", "pos": "adj.", "definition": "周围的；环境的" }
```

「新增词」= 六级大纲里**剔掉 cet4 / 高考 / 中考 标签**的词，也就是过了四级之后新要背的那些。
不收基础词，否则高频档里会排满 what / can / way 这类早就会的词，翻半天没有收获。

生成流程（`scripts/build-wordlist.mjs`）：

1. 取 ECDICT 里 `tag` 含 `cet6` 的词 + KyleBing 补充的词，合成六级大纲
2. 按 COCA 词频排序后截到 5500（六级大纲的规模）
3. 剔掉带 `cet4` / `gk` / `zk` 标签的 3669 个基础词、33 个专有名词 → 剩 **1824 词**
4. 对剩下的词算分档阈值，写出 `cet6.json` 和 `frequency.json`

## 词频分档

高频 / 中频 / 低频的**分档阈值是算出来的，不是写死的比例**，
对词表的 COCA 词频排名做 1D k-means(k=3) 聚类（在 `log10(排名)` 上做，
词频是重尾分布必须先取对数）：

| | 值 |
| --- | --- |
| 簇心（COCA 排名） | 3362 / 6231 / 10313 |
| 阈值 | 相邻簇心中点 → 取整 **4577 / 8016** |
| 稳定性 | 固定随机种子 + k-means++ 初始化 + 25 次重启取 SSE 最小，重跑结果逐字节一致 |

聚类在**构建期**完成（`scripts/build-wordlist.mjs` 里的 `kmeans1d`），
结果落成 `src/data/frequency.json`：`high`（4396 词）/ `mid`（3541 词）两段词表 + 两条阈值。
**内置词表和用户上传的词表在运行时走的是同一把尺子**（`bandOf()`），所以口径一致。

对内置词表（1824 词）的实际分档结果：

| 档次 | 词数 |
| --- | --- |
| 高频词 | 323 |
| 中频词 | 759 |
| 低频词 | 742 |
| 完整词表 | 1824 |

要重新生成词表和词频表：

```bash
node scripts/build-wordlist.mjs   # 原始数据已在 .worddata/ 里
```

数据来源：

| 来源 | 用途 |
| --- | --- |
| [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)（MIT） | `tag` 含 `cet6` 的词条，提供音标 / 词性 / 中文释义；`frq`(COCA) / `bnc` 词频排名用来排序和分档；`tag` 里的 `cet4`/`gk`/`zk` 用来识别基础词 |
| [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) | 补上 ECDICT 漏标的六级词 |

`scripts/build-wordlist.mjs` 会依次写出 `src/data/cet6.json` 和 `src/data/frequency.json`。

原始数据（`.worddata/`，约 65MB）已加进 `.gitignore`，要重新下载：

```bash
mkdir -p .worddata
curl -L -o .worddata/ecdict.csv \
  https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
curl -L -o .worddata/cet6-kylebing.json \
  https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/4-CET6-%E9%A1%BA%E5%BA%8F.json
node scripts/build-wordlist.mjs
```

## 目录结构

```
src/
├── app.ts              # 入口
├── app.config.ts       # 页面注册 + 窗口（没有原生 tabBar，底部 Tab 栏是自绘的）
├── theme.ts            # 颜色 / 字号 / 公用样式（纯白底、无圆角，32rpx 边距；分割线只有翻书页用）
├── components/
│   ├── nav-bar.tsx     # 自绘顶部栏（返回 + 居中标题；big=true 是首页那种左对齐大标题）
│   ├── list-row.tsx    # 列表行（标题 + 说明 + 灰色箭头 + 可选红色文字操作）
│   ├── tab-bar.tsx     # 底部 Tab 栏（翻书 / 生词本），翻书页和生词本各渲染一个
│   ├── master-pill.tsx # 「我会了」药丸按钮（浅灰 → 已掌握变浅绿，长按撤回）
│   └── mark-circle.tsx # 标记圆圈（可点版 + 只读版）
├── data/
│   ├── cet6.json       # 六级大纲新增词（1824 词，按词频排序，带音标/词性/释义）
│   ├── frequency.json  # 运行时词频分档表（给内置词表和上传的词表分档）
│   └── words.ts        # 词表类型 + 词频分档 + 四个档次定义
├── store/
│   ├── storage.ts      # 本地缓存持久化（标记进度 / 已掌握 / 上传词书 / 今日计数）
│   └── books.ts        # 词书读取入口（内置读词表文件，上传的读缓存）
├── services/tts.ts     # 单词发音（占位，待接入腾讯云 TTS）
├── utils/csv.ts        # CSV 解析 + 上传流程
└── pages/
    ├── index/          # 第一层 · 词书列表
    ├── uploads/        # 第一层 ·「我的上传」书目列表
    ├── levels/         # 第二层 · 档次
    ├── reader/         # 第三层 · 翻书
    └── vocab/          # 生词本
scripts/
├── build-wordlist.mjs  # 从 ECDICT + KyleBing 生成 cet6.json + frequency.json（含 k-means 分档）
└── csv-parse.mjs       # 流式 CSV 解析（给生成脚本用）
```

## 发音（TTS）待接入

`src/services/tts.ts` 是占位实现（点了只弹「发音待接入」）。UI 规格里没有发音按钮，所以目前**页面上没有调用入口**；
接了 TTS 之后在翻书页条目里加个喇叭按钮调 `speak(word)` 即可（2026-09-26 用户明确说这次先不加）。

接入方案：微信云开发云函数调用**腾讯云语音合成**，密钥留在服务端，小程序端用 `InnerAudioContext` 播放。
落点在 `src/pages/reader/index.tsx` 的条目里加个按钮调 `speak(word)`。

## 本地缓存

| key | 内容 |
| --- | --- |
| `wordlord_progress_v3` | `单词 -> 标记次数(1–7)` |
| `wordlord_mastered_v3` | `单词 -> 掌握时间戳` |
| `wordlord_upload_index_v3` | 上传词书的目录（书名 / 词数 / id） |
| `wordlord_upload_book_v3_<id>` | 单本上传词书的词条（一本一个 key，上限 5500 词） |
| `wordlord_state_v3` | 每本词书每个档次翻到第几页 + 今日计数 + 最后翻的那本书那一档（`lastReader`） |

都以**单词本身**为 key，所以同一个词在「高频词」和「完整词表」里共享标记进度；
翻页位置按 `词书id:档次` 分开记，换档次不会串页。

想重置：开发者工具 → 调试器 → Storage 面板 → Clear。
