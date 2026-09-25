import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getLastReader } from '../store/storage'
import { COLOR, FONT, PAGE_PAD } from '../theme'

/**
 * 页面内的底部 Tab 栏：翻书 / 生词本。
 *
 * 为什么不用微信原生 tabBar：原生 tabBar 是 app.config.ts 里编译期写死的，
 * 而翻书页必须带 `?bookId=&level=` 参数才能知道翻哪本书，原生 tab 给不了参数；
 * 而且 switchTab 会把页面栈清空，翻书页左上角的「返回」就没了。
 * 所以自绘一个：它只是页面里最后一行普通 View，跟着 flex 布局待在底部。
 *
 * 顺带解决了原来的问题——生词本入口放在右上角会被微信原生胶囊（… 和 ○）盖住，
 * 挪到底部就躲开了。
 */

export type TabKey = 'reader' | 'vocab'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'reader', label: '翻书' },
  { key: 'vocab', label: '生词本' }
]

/** 底部安全区（全面屏的 Home 指示条）高度，单位 px；非全面屏是 0。取一次缓存住。 */
let cachedInset: number | null = null
function bottomInsetPx(): number {
  if (cachedInset === null) {
    try {
      const info = Taro.getWindowInfo()
      const bottom = info.safeArea ? info.safeArea.bottom : info.screenHeight
      cachedInset = Math.max(info.screenHeight - bottom, 0)
    } catch {
      cachedInset = 0
    }
  }
  return cachedInset
}

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
 * 优先退回页面栈里的翻书页（保留原样），栈里没有就按记住的 bookId/level 跳过去，
 * 连一次都没翻过（比如开发时直接编译到生词本）才回首页。
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

export function TabBar({ active }: { active: TabKey }) {
  const inset = bottomInsetPx()

  return (
    <View style={styles.bar}>
      <View style={styles.tabs}>
        {TABS.map((tab) => (
          <View
            key={tab.key}
            style={styles.tabItem}
            onClick={() => {
              if (tab.key === active) return
              if (tab.key === 'vocab') openVocab()
              else openReader()
            }}
          >
            <Text style={tab.key === active ? styles.tabActive : styles.tabText}>{tab.label}</Text>
          </View>
        ))}
      </View>
      {/* 全面屏底下垫出 Home 指示条的高度，别让文字压在它上面 */}
      {inset > 0 ? <View style={{ height: `${inset}px` }} /> : null}
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  bar: {
    flexShrink: 0,
    backgroundColor: '#FFFFFF'
  },
  tabs: {
    display: 'flex',
    flexDirection: 'row',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '16rpx',
    paddingBottom: '16rpx'
  },
  tabItem: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
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
