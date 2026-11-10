import type { CSSProperties } from 'react'

/**
 * WORDLORD / 孔版手帐
 *
 * 三色制：奶油纸、深墨、朱砂。第三色是一点灰橄榄，只用于「待办/复习」类信息。
 * 表面靠**厚度**分层：纸面 → 浮起的卡 → 卡上的贴纸，而不是靠一根根横线。
 * 英文与数字用衬线，中文用系统无衬线并加字距。
 */
export const COLOR = {
  // 纸
  pageTop: '#12312D',
  pageBottom: '#0C2320',
  paper: '#12312D',
  paperRaised: '#FBFAF3',
  card: '#FBFAF3',
  cardSunk: '#D8E4DE',
  warmGlowA: 'rgba(0,0,0,0)',
  warmGlowB: 'rgba(0,0,0,0)',
  warmGlowC: 'rgba(0,0,0,0)',

  // 墨
  text: '#17150F',
  /** 深松绿：替代纯黑做「深色块」，比黑色有颜色、又不抢朱砂 */
  teal: '#12312D',
  tealMid: '#1C4A43',
  tealSoft: '#CFE1DA',
  /** 万寿菊黄：只在需要「亮」的地方用一次 */
  marigold: '#F0B23F',
  marigoldSoft: '#F8DFA8',
  ink: '#17150F',
  body: '#3B372D',
  secondary: '#5A4534',
  wordDone: '#A49C8A',
  onDark: '#FBF7EC',
  /** 直接压在朱砂底色上的文字（奶油白），页面根部的说明 / 标签都用它 */
  onGround: '#FFF3E4',
  /** 压在底色上的次级文字 */
  onGroundSoft: 'rgba(255, 243, 228, 0.72)',

  // 朱砂
  warm: '#D2411D',
  accent: '#D2411D',
  accentSoft: '#F5DCD0',
  warmSoft: '#F1DED2',
  progress: '#D2411D',
  progressWarmFrom: '#D2411D',
  progressWarmTo: '#E4552C',

  // 灰橄榄（第三色）
  olive: '#57603F',
  oliveSoft: '#E7E6D3',

  // 线：只做极淡的分隔，不用来划分区块
  line: 'rgba(23, 21, 15, 0.10)',
  warmLine: 'rgba(210, 65, 29, 0.18)',
  track: '#E2D8C6',
  fill: '#EAE1D0',
  black: '#17150F',

  circleEmptyBorder: '#BEB5A2',
  chevron: '#A9A08D',
  chartGhost: '#DCD2C0',

  dangerFill: '#F4DBD3',
  danger: '#C1401E',
  dangerText: '#A93A1C',

  pill: '#EDE5D5',
  pillText: '#4C4738',
  pillDone: '#E3E6D2',
  pillDoneText: '#45502F'
}

/** 投影都用暖棕，冷灰投影在奶油纸上会发脏 */
export const SHADOW = {
  card: '0 16rpx 38rpx rgba(78, 60, 34, 0.09), 0 2rpx 6rpx rgba(78, 60, 34, 0.04)',
  cardLift: '0 24rpx 56rpx rgba(78, 60, 34, 0.13), 0 3rpx 8rpx rgba(78, 60, 34, 0.05)',
  float: '0 10rpx 24rpx rgba(78, 60, 34, 0.10)',
  none: 'none'
}

export const RADIUS = {
  // 全站直角：海报不圆角。只有「胶囊」类小控件保留圆角
  card: '0rpx',
  lg: '0rpx',
  md: '0rpx',
  sm: '0rpx',
  pill: '999rpx'
}

export const FONT_STACK = {
  /**
   * 杂志衬线：iOS 上走 Didot / Bodoni（极高对比度，时装杂志那种），
   * 安卓没有就退到 Georgia —— 两端的字形都是衬线，不会突然变黑体。
   */
  serif: '"Didot", "Bodoni 72", "Playfair Display", Georgia, "Times New Roman", serif',
  /** 中文标题：宋体系。iOS 自带 Songti SC，安卓退到 Noto Serif */
  cn: '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", serif',
  sans: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif'
}

export const PRESS: { hoverClass: string; hoverStartTime: number; hoverStayTime: number } = {
  hoverClass: 'press',
  hoverStartTime: 0,
  hoverStayTime: 90
}

export const FONT = {
  display: '92rpx',
  title: '56rpx',
  word: '38rpx',
  wordLg: '46rpx',
  definition: '28rpx',
  meta: '24rpx',
  pill: '22rpx',
  tab: '24rpx',
  pageNo: '22rpx',
  section: '22rpx'
}

export const PAGE_PAD = '36rpx'
export const BOTTOM_PAD = '40rpx'

export const STYLE: Record<string, CSSProperties> = {
  container: {
    height: '100vh',
    position: 'relative',
    backgroundColor: COLOR.paper,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: FONT_STACK.sans
  },
  list: {
    flex: 1,
    height: '100%',
    // 全站统一入场：只做透明度淡入（transform 作用在滚动容器上，
    // 每次进页都会把整棵内容树重新合成一遍，低端机上能感到顿）
    animation: 'inkIn 320ms ease backwards'
  },
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
    fontSize: '42rpx',
    lineHeight: '42rpx',
    fontWeight: '400',
    color: COLOR.onGround
  },
  navTitle: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 1,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: '30rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: COLOR.onGround
  },
  bigTitleBar: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '16rpx',
    paddingBottom: '24rpx'
  },
  bigTitle: {
    fontFamily: FONT_STACK.serif,
    fontSize: FONT.title,
    lineHeight: '68rpx',
    fontWeight: '400',
    letterSpacing: '-1rpx',
    color: COLOR.onGround
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '16rpx',
    paddingLeft: '30rpx',
    paddingRight: '30rpx',
    paddingTop: '30rpx',
    paddingBottom: '30rpx',
    borderRadius: RADIUS.md
  },
  rowText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  rowTitle: {
    fontSize: '31rpx',
    fontWeight: '600',
    color: COLOR.text
  },
  rowMeta: {
    marginTop: '8rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  rowChevron: {
    flexShrink: 0,
    marginLeft: '16rpx',
    paddingTop: '16rpx',
    paddingBottom: '16rpx',
    paddingLeft: '8rpx'
  },
  rowChevronText: {
    fontSize: '32rpx',
    lineHeight: '32rpx',
    color: COLOR.chevron
  },
  rowAction: {
    flexShrink: 0,
    marginLeft: '24rpx',
    paddingTop: '8rpx',
    paddingBottom: '8rpx'
  },
  rowActionText: {
    fontSize: FONT.pageNo,
    color: COLOR.dangerText
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: '56rpx',
    paddingRight: '56rpx'
  },
  emptyText: {
    fontSize: FONT.meta,
    lineHeight: '42rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },
  footerBar: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '20rpx',
    paddingBottom: BOTTOM_PAD
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.black,
    boxShadow: SHADOW.float
  },
  primaryBtnText: {
    fontSize: FONT.definition,
    lineHeight: '40rpx',
    fontWeight: '600',
    letterSpacing: '1rpx',
    color: COLOR.onDark
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    borderRadius: RADIUS.md,
    backgroundColor: COLOR.fill
  },
  secondaryBtnText: {
    fontSize: FONT.definition,
    lineHeight: '40rpx',
    fontWeight: '500',
    color: COLOR.text
  },
  disabledBtn: {
    opacity: 0.32
  }
}
