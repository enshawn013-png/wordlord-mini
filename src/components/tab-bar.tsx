import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getLastReader } from '../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../theme'
import { bottomSafePx } from '../utils/metrics'

/**
 * 页面内的底部 Tab 栏：翻书 / 生词本 / 熟练掌握词汇。
 *
 * 为什么不用微信原生 tabBar：原生 tabBar 是 app.config.ts 里编译期写死的，
 * 而翻书页必须带 `?bookId=&level=` 参数才能知道翻哪本书，原生 tab 给不了参数；
 * 而且 switchTab 会把页面栈清空，翻书页左上角的「返回」就没了。
 * 所以自绘一个——顺便解决了原来的问题：生词本入口放右上角会被微信原生胶囊盖住。
 *
 * 2026-09-28 起它**浮在滚动内容上面**（`STYLE.bottomBar` + app.css 的
 * `.glass .glass-bar-bottom`）：半透明白 + 背景模糊，词从底下滚过去。
 * 所以页面要给滚动内容留出 `tabBarHeightPx()` 的底部内边距，不然最后一行永远被压住。
 *
 * 2026-10：「我的」按用户要求删掉，第三个 Tab 换成「熟练掌握词汇」（点过「我会了」
 * 的词）。「熟练掌握词汇」和生词本同级、同一个跳法（navigateTo，栈里上一页就是它
 * 就 navigateBack）。「复习」和「复习记录」是生词本的子页，**不在** Tab 栏里，
 * 从生词本进去。
 *
 * 注意：首页（词书列表）**没有**这个 Tab 栏，所以生词本 / 熟练掌握词汇是从翻书页
 * 底部的 Tab 进去的。
 */

export type TabKey = 'reader' | 'vocab' | 'mastered'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'reader', label: '翻书' },
  { key: 'vocab', label: '生词本' },
  { key: 'mastered', label: '熟练掌握词汇' }
]

/** 当前页面栈里，本页的上一页是不是某个路由（用来决定「返回」还是「跳过去」） */
function prevRouteIs(route: string): boolean {
  const pages = Taro.getCurrentPages()
  const prev = pages.length >= 2 ? pages[pages.length - 2] : null
  return Boolean(prev && prev.route === route)
}

/** 点「生词本」：已经在生词本里就不动；上一页就是生词本（说明是返回来的）就退回去 */
function openVocab(): void {
  if (prevRouteIs('pages/vocab/index')) {
    Taro.navigateBack()
    return
  }
  Taro.navigateTo({ url: '/pages/vocab/index' })
}

/**
 * 点「翻书」：回到刚才那本书那一档。
 * 优先退回页面栈里的翻书页（保留原样），栈里没有就按记住的 bookId/level 跳过去；
 * 连一次都没翻过（比如开发时直接编译到这个页面）才回词书列表 —— 那种情况用户要的是
 * 「先挑一本书」，而不是主界面那张封面。到了词书列表再点返回会落回主界面
 * （栈里没有上一页，nav-bar 的 goBack 兜底就是 reLaunch 到 pages/home）。
 */
function openReader(): void {
  if (prevRouteIs('pages/reader/index')) {
    Taro.navigateBack()
    return
  }
  const last = getLastReader()
  if (last && last.bookId) {
    Taro.redirectTo({ url: `/pages/reader/index?bookId=${last.bookId}&level=${last.level}` })
    return
  }
  Taro.reLaunch({ url: '/pages/index/index' })
}

/** 点「熟练掌握词汇」：已经在里面就不动；上一页就是它（说明是返回来的）就退回去 */
function openMastered(): void {
  if (prevRouteIs('pages/mastered/index')) {
    Taro.navigateBack()
    return
  }
  Taro.navigateTo({ url: '/pages/mastered/index' })
}

export function TabBar({ active }: { active: TabKey }) {
  return (
    <View className="glass glass-bar-bottom" style={STYLE.bottomBar}>
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <View
            key={tab.key}
            {...PRESS}
            style={styles.tabItem}
            onClick={() => {
              if (tab.key === active) return
              if (tab.key === 'vocab') openVocab()
              else if (tab.key === 'mastered') openMastered()
              else openReader()
            }}
          >
            <Text style={tab.key === active ? styles.tabActive : styles.tabText}>{tab.label}</Text>
          </View>
        ))}
      </View>
      {/*
        底部安全区：垫出 max(48rpx, Home 指示条高度)。
        光垫 inset 不够——非全面屏（iPhone SE 那类）inset 是 0，标签会贴着屏幕底边；
        光垫 48rpx 也不够——全面屏的横条区域是 34px（≈68rpx），48rpx 会压在横条上。
        这两个数字和 tabBarHeightPx() 是一对，改一起改。
      */}
      <View style={{ height: `${bottomSafePx()}px` }} />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 底部内边距不在这里写：安全区由下面那个 spacer 负责
  tabs: {
    display: 'flex',
    flexDirection: 'row',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '16rpx'
  },
  // ⚠️ 2026-10：标签区从「文字 36rpx」提到 **88rpx（44pt 热区）**。
  // 原来整栏只有 52rpx 高，是全站最矮的可点区域；现在和微信原生 TabBar 的高度节奏接近，
  // 26rpx 的字也不再贴着顶。改这里必须同步 utils/metrics.ts 的 tabBarHeightPx()（16 + 88）。
  tabItem: {
    flex: 1,
    height: '88rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '24rpx'
  },
  tabText: {
    fontSize: FONT.tab,
    lineHeight: '36rpx',
    color: COLOR.secondary
  },
  tabActive: {
    fontSize: FONT.tab,
    lineHeight: '36rpx',
    fontWeight: '700',
    color: COLOR.text
  }
}
