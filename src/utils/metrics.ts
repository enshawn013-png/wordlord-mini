import Taro from '@tarojs/taro'

/**
 * 屏幕尺寸相关的换算 + **安全区适配**，集中在这里。
 *
 * 两件事：
 * 1. 2026-09-28 的玻璃改造：导航栏、底部胶囊、Tab 栏从「排在内容上下」改成
 *    **浮在滚动内容上面**（不然玻璃没有东西可以糊），于是每个页面都得知道这几块
 *    悬浮元素有多高，好给滚动内容留出对应的内边距——不然第一个词会被压在导航栏底下。
 * 2. 同一天的安全区要求：左右至少 32rpx、离屏幕底至少 48rpx（并避开 Home 指示条）、
 *    顶部内容距导航栏至少 24rpx、标题不能钻到微信胶囊底下、任何东西不能被屏幕边裁掉。
 *
 * 所有函数都返回 **px 数字**，因为要拿去做 padding 计算；用的时候自己拼成
 * `${x}px`。rpx 转 px 靠屏幕宽度算（750rpx 恒等于屏幕宽度）。
 *
 * 每个值只跨桥取一次就缓存住（这些值在一次运行里不会变）。
 *
 * 关于取尺寸的 API：用的是 `Taro.getWindowInfo()`，也就是 `wx.getWindowInfo()` ——
 * 它和 `wx.getSystemInfoSync()` 给的是同一批字段（windowWidth / statusBarHeight /
 * safeArea），但 **getSystemInfoSync 从 2021 年起就被官方标为废弃了**（基础库 2.20.1
 * 起推荐按需取），所以这里用新接口，字段一样、还少一次同步跨桥。
 */

let cachedWindowInfo: { width: number; height: number; statusBarHeight: number; inset: number } | null =
  null

function windowInfo() {
  if (cachedWindowInfo === null) {
    let width = 375
    let height = 667
    let statusBarHeight = 20
    let inset = 0
    try {
      const info = Taro.getWindowInfo()
      width = info.windowWidth || 375
      height = info.windowHeight || 667
      statusBarHeight = info.statusBarHeight || 20
      /**
       * ⚠️ 2026-11 修：H5 / PWA 里 `getWindowInfo()` 可能返回 `safeArea.bottom = 0`（或干脆没有
       * safeArea），于是 inset 被算成整个屏高（844px）—— 底部 Tab 栏的占位 spacer 撑到满屏，
       * 那条玻璃栏的 backdrop-filter 把整页内容糊成一片。
       * 两道保险：① bottom 为 0 时退回 screenHeight；② inset 夹在 0~60px（Home 条最多 34px）。
       */
      const rawBottom = info.safeArea && info.safeArea.bottom
      const bottom = rawBottom && rawBottom > 0 ? rawBottom : info.screenHeight
      inset = Math.min(Math.max(info.screenHeight - bottom, 0), 60)
    } catch {
      // 取不到就按 iPhone 的常见值兜底，别让整个页面因为换算失败白屏
    }
    /**
     * H5 / iOS 壳（iPhone 16 灵动岛、全面屏 Home 条）：
     * Taro 在 H5 里给不到 statusBarHeight / safeArea，统一按 0 处理 →
     * 导航栏会钻到灵动岛底下。这里直接读 CSS 的 env(safe-area-inset-*)。
     * 需要 index.html 的 viewport 带 `viewport-fit=cover`，否则 env() 恒为 0。
     */
    if (process.env.TARO_ENV === 'h5' && typeof document !== 'undefined' && document.body) {
      try {
        const probe = document.createElement('div')
        probe.style.cssText =
          'position:fixed;left:-9999px;top:0;width:0;height:0;' +
          'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);'
        document.body.appendChild(probe)
        const cs = getComputedStyle(probe)
        const safeTop = parseFloat(cs.paddingTop) || 0
        const safeBottom = parseFloat(cs.paddingBottom) || 0
        probe.remove()
        if (safeTop > 0) statusBarHeight = safeTop
        if (safeBottom > 0) inset = safeBottom
      } catch {
        // 老浏览器没有 env()：保持 0，退化成普通 H5
      }
    }
    cachedWindowInfo = { width, height, statusBarHeight, inset }
  }
  return cachedWindowInfo
}

/** rpx → px */
export function rpxToPx(rpx: number): number {
  return (rpx * windowInfo().width) / 750
}

/**
 * 底部安全高度：**至少 48rpx，同时要盖住全面屏的 Home 指示条**（取两者较大的）。
 *
 * 只用 48rpx 是不够的：iPhone X 及以后的 Home 指示条区域是 34px（≈68rpx），
 * 48rpx 的按钮会压在横条上。反过来，非全面屏（iPhone SE 这类）inset 是 0，
 * 那就得靠 48rpx 兜底。所有贴屏幕底的东西都用这个值，别直接写 BOTTOM_PAD。
 */
export function bottomSafePx(): number {
  /**
   * ⚠️ 2026-11 修（PWA / H5 里 Tab 栏把整页糊住的那个 bug）：
   * H5 里平台给的 safeArea 不可靠，`bottomInsetPx()` 可能返回整屏高度（844px），
   * 于是 Tab 栏底部的占位 spacer 撑满一屏、玻璃栏的 backdrop-filter 把内容糊成一片。
   * 这里硬夹一个上限 80px（Home 指示条最多 34px，80 已经非常宽松）——
   * 不管平台报什么，都不会再把布局撑炸。
   */
  return Math.min(Math.max(rpxToPx(48), bottomInsetPx()), 80)
}

/** 顶部内容距导航栏的最小间距（用户 2026-09-28 定的 24rpx） */
export function topGapPx(): number {
  return rpxToPx(24)
}

/**
 * 导航栏标题的左右留白（px，左右对称，保证标题在屏幕正中）。
 *
 * 右边必须让开**微信原生胶囊**（「…」和「⊙」那两颗），它是系统画在最上层的，
 * 标题长了会钻到它下面被盖住。胶囊的位置只能问 `getMenuButtonBoundingClientRect()`，
 * 各家机型、各家微信版本都不一样，不能写死。
 *
 * 左边同一个值：反正比返回箭头的 88rpx 宽，箭头不会跟标题打架。
 */
export function navTitlePadPx(): number {
  const minPad = rpxToPx(104)
  try {
    const rect = Taro.getMenuButtonBoundingClientRect()
    // 胶囊占掉的右边距 + 8px 的呼吸缝
    const reserve = windowInfo().width - rect.left + 8
    return Math.max(minPad, reserve)
  } catch {
    // 取不到（老版本 / 某些模拟器返回 0）就退回保守值
    return minPad
  }
}

/** 状态栏高度（px） */
export function statusBarHeightPx(): number {
  return windowInfo().statusBarHeight
}

/**
 * 可视窗口高度（px）—— **不含**状态栏和导航栏（getWindowInfo 的 windowHeight）。
 *
 * 目前只有卡片式复习页用它：一屏一个词，得知道「导航栏和底部按钮之间还剩多高」，
 * 才能把那张卡片真正摆在中间。别拿它当整屏高度用（整屏要用 screenHeight）。
 */
export function windowHeightPx(): number {
  return windowInfo().height
}

/** 底部安全区（全面屏的 Home 指示条）高度（px）；非全面屏是 0 */
export function bottomInsetPx(): number {
  return windowInfo().inset
}

/** 普通导航栏高度：状态栏 + 44px 标题栏 */
export function navBarHeightPx(): number {
  return statusBarHeightPx() + 44
}

/**
 * 「苹果设置页」那种大标题栏的高度：状态栏 + (12 + 60 + 20)rpx，
 * 带返回箭头时还要加一条 88rpx 的紧凑栏（箭头在上面那行，大标题在下面）。
 * 60rpx 是 bigTitle 的 lineHeight（在 theme.ts 里写死的），改那边记得同步。
 */
export function bigNavBarHeightPx(withBack = false): number {
  return statusBarHeightPx() + rpxToPx(withBack ? 92 + 88 : 92)
}

/**
 * 底部自绘 Tab 栏高度：上 16rpx + 标签区 88rpx + 底部安全高度（见 bottomSafePx）。
 *
 * ⚠️ 2026-10：标签区从 36rpx 提到 **88rpx**（= 44pt 热区）。原来整栏只有 52rpx 高，
 * 26rpx 的字挤在 16rpx 的上内边距里 —— 既是全站最矮的可点区域，也和微信原生
 * TabBar（约 50pt 高）差得远。88rpx 是**热区下限**，改这里要同步
 * components/tab-bar.tsx 里 styles.tabs / styles.tabItem 的数字。
 */
export function tabBarHeightPx(): number {
  return rpxToPx(104) + bottomSafePx()
}
