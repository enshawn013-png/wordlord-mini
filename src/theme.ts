import type { CSSProperties } from 'react'

/**
 * 设计规格里的固定值，集中放这里，避免散落在各处的魔法数字。
 *
 * 基调：纯白底、无卡片、无渐变、无阴影、无分割线，分区全靠留白。
 *
 * 两套语气，别混：
 * - **列表页**（首页 / 档次 / 上传 / 生词本）：紧凑，左右 32rpx，行高 100rpx，按钮直角整行铺满
 * - **翻书页**：像备忘录打开一篇笔记——字大（单词 40rpx 半粗）、留白多，
 *   底部是圆角胶囊按钮（不是整行直角）。用户 2026-09-26 单独给的这套数值；
 *   边距最后定的是左右 32rpx、条目上下各 32rpx。
 */
export const COLOR = {
  /** 主文字：英文单词、标题 */
  text: '#1D1D1F',
  /** 次要文字：音标 / 词性 / 说明 */
  secondary: '#86868B',
  /** 正文色（翻书页的中文释义，比 secondary 深、比 text 软，备忘录正文那种） */
  body: '#3A3A3C',
  /** 次要按钮底色（「上一页」） */
  fill: '#F2F2F7',
  /** 主按钮底色（「下一页」/「上传」） */
  black: '#000000',
  /** 空标记圆圈的边框 */
  circleEmptyBorder: '#D2D2D7',
  /** 列表行右侧的灰色箭头 */
  chevron: '#C7C7CC',
  /** 「我会了」药丸：未点（浅灰底 + 灰字） */
  pill: '#F2F2F7',
  pillText: '#86868B',
  /** 「我会了」药丸：已掌握（浅绿底 + 绿字） */
  pillDone: '#E8F5E9',
  pillDoneText: '#34C759',
  onDark: '#FFFFFF',
  danger: '#FF3B30'
}

/** 字号：大标题 36rpx 粗体，单词 36rpx 粗体，音标/词性/说明 24rpx，释义 28rpx */
export const FONT = {
  /** 首页/词书页的大标题 */
  title: '36rpx',
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
  container: {
    height: '100vh',
    backgroundColor: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column'
  },
  list: {
    flex: 1
  },

  // ---------- 顶部标题栏（navigationStyle: custom，自绘） ----------
  navBar: {
    backgroundColor: '#FFFFFF'
  },
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
  navTitle: {
    fontSize: '32rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  navRight: {
    position: 'absolute',
    right: '0rpx',
    top: '0rpx',
    height: '44px',
    paddingLeft: '24rpx',
    paddingRight: '32rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  navRightText: {
    fontSize: '28rpx',
    color: COLOR.text
  },

  // ---------- 大标题（首页「单词君」）----------
  // 苹果设置页那种：左边一大行粗体标题，下面直接接列表
  bigTitleBar: {
    backgroundColor: '#FFFFFF',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '12rpx',
    paddingBottom: '20rpx'
  },
  bigTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLOR.text
  },

  // ---------- 列表行（词书 / 档次 / 上传的书） ----------
  // 行与行之间不画线，靠上下留白分开
  // 左右一律 32rpx：内容不贴屏幕边
  // 行高约 100rpx（标题 32rpx + 说明 24rpx + 上下 8rpx）
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: '100rpx',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '8rpx',
    paddingBottom: '8rpx'
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
    color: COLOR.danger
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

  // ---------- 底部按钮：直角、无背景块 ----------
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
  primaryBtnText: {
    fontSize: FONT.definition,
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
    color: COLOR.text
  },
  disabledBtn: {
    opacity: 0.35
  }
}
