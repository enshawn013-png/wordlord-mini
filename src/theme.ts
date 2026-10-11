import type { CSSProperties } from 'react'

/**
 * 设计规格里的固定值，集中放这里，避免散落在各处的魔法数字。
 *
 * 基调（2026-09-28 起）：**浅灰白渐变底 + 液态玻璃**，无分割线，分区靠留白和玻璃卡片。
 *
 * 两套语气，别混：
 * - **列表页**（首页 / 档次 / 上传 / 生词本）：左右 32rpx，每行一张玻璃卡片，按钮直角整行铺满
 * - **翻书页**：像备忘录打开一篇笔记——字大（单词 40rpx 半粗）、留白多，条目**不做卡片**，
 *   底部是圆角胶囊按钮（不是整行直角）。边距是左右 32rpx、条目上下各 36rpx。
 *
 * 用户 2026-09-28 又给了一轮「严格仿苹果」的全局数值（主文字 #1D1D1F、次要文字 #86868B、
 * 左右边距 32rpx；导航栏标题 17pt 半粗居中），已落到这里。
 *
 * ⚠️ **同一天晚些时候，用户把这轮推翻了，改成「液态玻璃」（iOS 26 控制中心那种）**：
 * 页面底色从纯白改成 #F5F5F7 → #FFFFFF 渐变；导航栏 / 底部 Tab 栏 / 按钮 / 列表行
 * 改成半透明白 + backdrop-filter 毛玻璃（配方在 app.css 的 .glass*）；
 * 极细的白色高光边 + 极淡投影；**列表行从纯文字行变成了圆角玻璃卡片**。
 * 最有结构性的一条：导航栏和底部按钮不再排在内容上下，而是**浮在滚动内容上面**
 * （STYLE.topBar / bottomBar），单词会从玻璃底下穿过去——不然毛玻璃没有东西可糊，
 * 看起来就只是一层白。页面因此要给内容留出上下内边距（高度算在 utils/metrics.ts）。
 * 「不要渐变、不要阴影、不要圆角卡片」那几句**已被这一轮取代**，别再按它们往回改。
 */
export const COLOR = {
  /** 页面背景渐变：顶 #F5F5F7 → 底 #FFFFFF（2026-09-28 液态玻璃那轮加的） */
  pageTop: '#F5F5F7',
  pageBottom: '#FFFFFF',
  /** 主文字：英文单词、标题 —— 白底 16.6:1 */
  text: '#1D1D1F',
  /**
   * 次要文字：音标 / 词性 / 说明 / 页码 / Tab 标签。
   *
   * ⚠️ **2026-10 按对比度改过**：原来是 `#86868B`（白底 **3.62:1**），
   * 而全站次要文字都用在 22~26rpx 的小字上 —— 小字要 **≥4.5:1** 才算达标，
   * 3.62:1 属于「看着高级但真机上发飘」。现在换成 `#6E6E73`（白底 **5.07:1**），
   * 仍然是同一个灰调子，只是一眼能看清了。直径更大的装饰元素不受影响。
   */
  secondary: '#6E6E73',
  /**
   * 已掌握的词在翻书页里压暗用的色。
   * 单词是 40rpx（大字），大字只需 ≥3:1，`#8E8E93` 白底 3.26:1 —— 刚好达标，
   * 所以它比 secondary 更浅、仍然一眼看得出「这个词点过了」。
   */
  wordDone: '#8E8E93',
  /** 正文色（翻书页的中文释义，比 secondary 深、比 text 软，备忘录正文那种）—— 11.4:1 */
  body: '#3A3A3C',
  /** 浅灰填充：上传页的次要按钮、头像占位块（玻璃件不用它，走 app.css 的 .glass） */
  fill: '#F2F2F7',
  /** 主按钮底色（「下一页」/「上传」） */
  black: '#000000',
  /**
   * 空标记圆圈的描边。
   * 2026-10 改：`#D2D2D7` 白底只有 1.66:1 —— 作为「这里可以点」的唯一视觉提示太淡了，
   * 现在是 `#8A8A90`（**3.43:1**，达到非文字控件 ≥3:1 的要求），看得见但不抢戏。
   */
  circleEmptyBorder: '#8A8A90',
  /** 列表行右侧的灰色箭头（整行都可点，箭头是装饰，所以保持很浅） */
  chevron: '#C7C7CC',
  /** 「我会了」药丸未点时的字色（底是 .glass 的半透明白）；`pill` 这个值已没人用，留着备用 */
  pill: '#F2F2F7',
  pillText: '#6E6E73',
  /** 「我会了」药丸：已掌握（浅绿底 + 深绿字，见下面的对比度说明） */
  pillDone: '#E8F5E9',
  /**
   * 已掌握药丸的字色。
   * 2026-10 改：原来 `#34C759` 在 `#E8F5E9` 底上只有 **1.97:1**（22rpx 小字要 ≥4.5:1），
   * 几乎等于没写。现在是 `#1E7A34`（**4.80:1**）—— 还是那个绿，只是读得出来了。
   * 浅绿底 `#34C759` 仍用于圆圈填充等**非文字**处。
   */
  pillDoneText: '#1E7A34',
  onDark: '#FFFFFF',
  /**
   * 进度条填充色（主界面「今日目标」「7 天节奏」「六级进度」都用它）。
   * 一色一义：蓝色 = **数据 / 进度**；黑色只留给主操作（黑底按钮），两者不混。
   * 这个蓝就是标记第 2 档的 `#007AFF`，颜色体系里本来就有的那个。
   */
  progress: '#007AFF',
  /** 危险色：用于**填充 / 边框 / 圆圈**（非文字），白底 3.6:1 */
  danger: '#FF3B30',
  /**
   * 危险色的**文字**版本：`#FF3B30` 当 24rpx 小字用白底只有 3.6:1，不达标。
   * `#D70015`（白底 **5.38:1**）本来就是标记第 6 档的红，复用同一个色，颜色体系不变。
   */
  dangerText: '#D70015'
}

/**
 * 触屏的按下态。微信里 `:hover` 和 `cursor` **完全无效**，
 * 唯一可靠的反馈是内置组件的 `hover-class` —— 所以每个可点元素都摊上这三个属性：
 *
 * ```tsx
 * <View {...PRESS} onClick={...}>…</View>
 * ```
 *
 * `hoverStartTime: 0` 是必须的：默认 50ms 才亮，手指快点点下去根本看不到反馈。
 */
export const PRESS: { hoverClass: string; hoverStartTime: number; hoverStayTime: number } = {
  hoverClass: 'press',
  hoverStartTime: 0,
  hoverStayTime: 80
}

/** 字号：大标题 44rpx 粗体，单词 36rpx 粗体，音标/词性/说明 24rpx，释义 28rpx */
export const FONT = {
  /** 首页/词书页的大标题（用户 2026-09-28 从 36rpx 提到 44rpx） */
  title: '44rpx',
  word: '36rpx',
  /** 翻书页的单词：用户指定 40rpx / 600（比列表页的标题更大更松） */
  wordLg: '40rpx',
  definition: '28rpx',
  meta: '24rpx',
  /** 「我会了」药丸里的字 */
  pill: '22rpx',
  /** 底部 Tab 栏、页码 */
  tab: '26rpx',
  pageNo: '22rpx'
}

/** 内容距离屏幕左右边缘的安全边距，一律用它，别写 0 或更小的值 */
export const PAGE_PAD = '32rpx'

/** 底部按钮距离屏幕底边的安全距离 */
export const BOTTOM_PAD = '48rpx'

/** 各页面公用的样式（页面级样式仍写在各自文件里） */
export const STYLE: Record<string, CSSProperties> = {
  // 页面画布：整屏，浅灰白渐变打底。
  // position relative 是给下面两条悬浮栏当定位基准的（它们是 absolute，见 topBar/bottomBar）。
  container: {
    height: '100vh',
    position: 'relative',
    // 纯色兜底：万一渐变没渲染出来（老引擎），也不会变成透明
    backgroundColor: COLOR.pageBottom,
    backgroundImage: `linear-gradient(180deg, ${COLOR.pageTop} 0%, ${COLOR.pageBottom} 100%)`,
    display: 'flex',
    flexDirection: 'column'
  },
  // 滚动区：撑满整屏，**内容从导航栏和底部按钮底下穿过去**——
  // 玻璃要真糊到东西才叫毛玻璃。代价是内容得自己留出上下内边距，
  // 所以页面里都会包一层 View 写 paddingTop/paddingBottom（高度见 utils/metrics.ts）。
  list: {
    flex: 1,
    height: '100%'
  },

  // ---------- 两条悬浮栏的定位：贴在滚动区上面 ----------
  // zIndex 给大一点，免得被卡片盖住
  topBar: {
    position: 'absolute',
    left: '0rpx',
    right: '0rpx',
    top: '0rpx',
    zIndex: 10
  },
  bottomBar: {
    position: 'absolute',
    left: '0rpx',
    right: '0rpx',
    bottom: '0rpx',
    zIndex: 10
  },

  // ---------- 顶部标题栏（navigationStyle: custom，自绘） ----------
  // 注意：这里**没有 navBar 这一项**了。导航栏自己的壳用 STYLE.topBar 定位，
  // 玻璃底 + 下沿高光由 app.css 的 .glass / .glass-bar-top 给（见 components/nav-bar.tsx）。
  // 左右留白**不在这里写死**：得按微信胶囊的实际位置算，见 utils/metrics.ts 的
  // navTitlePadPx()，由 nav-bar.tsx 作为行内样式贴上去（行内会盖掉这里的值，
  // 所以这里干脆不写，免得两处数字对不上）。
  navBarInner: {
    height: '44px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  navBack: {
    position: 'absolute',
    left: '0rpx',
    top: '0rpx',
    width: '88rpx',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  navBackIcon: {
    fontSize: '48rpx',
    lineHeight: '48rpx',
    color: COLOR.text
  },
  // 苹果导航栏标题：17pt 半粗 = 34rpx / 600。
  //
  // 这里的 -webkit-box + line-clamp 1 是为了**多余的省略号**：Taro 的样式白名单
  // 里没有 textOverflow（只写了会被丢掉、不报错），而 overflow:hidden 配
  // whiteSpace:nowrap 只能硬切、切在半个字上。line-clamp 在白名单里
  // （`combine(WEBKIT, ['LineClamp', ...])`），能给出一行 + "…"。
  // 注意 WebkitLineClamp 写数字、不带单位。
  navTitle: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 1,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: '34rpx',
    fontWeight: '600',
    color: COLOR.text
  },

  // ---------- 大标题（首页「单词君」）----------
  // 苹果设置页那种：左边一大行粗体标题，下面直接接列表。
  // lineHeight 定成 60rpx 是为了让这一栏的高度可算（12 + 60 + 20 = 92rpx），
  // metrics.ts 的 bigNavBarHeightPx() 要拿它给滚动内容留内边距——改这里记得同步那边。
  bigTitleBar: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '12rpx',
    paddingBottom: '20rpx'
  },
  bigTitle: {
    fontSize: FONT.title,
    lineHeight: '60rpx',
    fontWeight: '700',
    color: COLOR.text
  },

  // ---------- 列表行（词书 / 档次 / 上传的书）----------
  // 2026-09-28 起每行是一张**玻璃卡片**（app.css 的 .glass / .glass-card）：
  // 左右各留 32rpx 的边，行与行之间 16rpx 的缝，卡片自己带圆角和极淡投影。
  // 卡片内边距上下各 32rpx —— 和缝加起来正好 80rpx，和上一版「上下各 40rpx 靠留白分行」
  // 的节奏一致，只是把留白换成了缝 + 卡片边框。
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '16rpx',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '32rpx',
    paddingBottom: '32rpx'
  },
  rowText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  rowTitle: {
    fontSize: '32rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  rowMeta: {
    marginTop: '6rpx',
    fontSize: FONT.meta,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  // 行尾的灰色箭头。可点和文字区一样打开这一行，但它是兄弟节点，
  // 所以点右边的「删除」不会顺带把行也点开。
  rowChevron: {
    flexShrink: 0,
    marginLeft: '16rpx',
    paddingTop: '16rpx',
    paddingBottom: '16rpx',
    paddingLeft: '8rpx'
  },
  rowChevronText: {
    fontSize: '36rpx',
    lineHeight: '36rpx',
    color: COLOR.chevron
  },
  // 红色文字链接（删除这类操作），不带背景不带边框
  rowAction: {
    flexShrink: 0,
    marginLeft: '24rpx',
    paddingTop: '8rpx',
    paddingBottom: '8rpx'
  },
  rowActionText: {
    fontSize: FONT.meta,
    // 24rpx 的红字用 danger（#FF3B30，3.6:1）不够读，文字一律用 dangerText（5.38:1）
    color: COLOR.dangerText
  },

  // ---------- 空状态 ----------
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: '48rpx',
    paddingRight: '48rpx'
  },
  emptyText: {
    fontSize: FONT.meta,
    lineHeight: '40rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },

  // ---------- 悬浮底部按钮条（上传页的玻璃条）----------
  // 2026-09-28 起它是一条**玻璃条**：页面同时给它 className="glass glass-bar-bottom"，
  // 内容从底下滚过去（所以要配 STYLE.bottomBar 定位，见页面里的用法）。
  // 里面的按钮保持原来的样子：主按钮黑底直角整行，次要按钮浅灰底。
  // ⚠️ paddingBottom 只是兜底：上传页会用行内样式把它换成 bottomSafePx()
  //    （≥48rpx，全面屏上还要盖住 Home 指示条）——BOTTOM_PAD 单写在全面屏上会压在横条上。
  footerBar: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '16rpx',
    paddingBottom: BOTTOM_PAD
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    backgroundColor: COLOR.black
  },
  // lineHeight 写死 40rpx 是为了让按钮高度可算（32 + 40 + 32 = 104rpx）——
  // 上传页要拿它算底部悬浮条的留白，见 pages/uploads/index.tsx
  primaryBtnText: {
    fontSize: FONT.definition,
    lineHeight: '40rpx',
    color: COLOR.onDark
  },
  /** 次要按钮：浅灰底、黑字，和主按钮等宽同高 */
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    backgroundColor: COLOR.fill
  },
  secondaryBtnText: {
    fontSize: FONT.definition,
    lineHeight: '40rpx',
    color: COLOR.text
  },
  disabledBtn: {
    opacity: 0.35
  }
}
