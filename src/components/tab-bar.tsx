import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getLastReader } from '../store/storage'
import { COLOR, FONT_STACK, PAGE_PAD, PRESS, RADIUS, SHADOW, STYLE } from '../theme'
import { bottomSafePx } from '../utils/metrics'

export type TabKey = 'reader' | 'vocab' | 'mastered'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'reader', label: '翻书' },
  { key: 'vocab', label: '生词本' },
  { key: 'mastered', label: '已掌握' }
]

function prevRouteIs(route: string): boolean {
  const pages = Taro.getCurrentPages()
  const prev = pages.length >= 2 ? pages[pages.length - 2] : null
  return Boolean(prev && prev.route === route)
}

function openVocab(): void {
  if (prevRouteIs('pages/vocab/index')) {
    Taro.navigateBack()
    return
  }
  Taro.navigateTo({ url: '/pages/vocab/index' })
}

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
        {TABS.map((tab) => {
          const on = tab.key === active
          return (
            <View
              key={tab.key}
              {...PRESS}
              style={styles.tabItem}
              onClick={() => {
                if (on) return
                if (tab.key === 'vocab') openVocab()
                else if (tab.key === 'mastered') openMastered()
                else openReader()
              }}
            >
              <View style={on ? styles.pillOn : styles.pill}>
                <Text style={on ? styles.tabActive : styles.tabText}>{tab.label}</Text>
              </View>
            </View>
          )
        })}
      </View>
      <View style={{ height: `${bottomSafePx()}px` }} />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  tabs: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '16rpx',
    paddingBottom: '8rpx'
  },
  tabItem: {
    flex: 1,
    height: '80rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pill: {
    paddingLeft: '26rpx',
    paddingRight: '26rpx',
    paddingTop: '14rpx',
    paddingBottom: '14rpx',
    borderRadius: RADIUS.pill,
    backgroundColor: 'transparent'
  },
  pillOn: {
    paddingLeft: '30rpx',
    paddingRight: '30rpx',
    paddingTop: '14rpx',
    paddingBottom: '14rpx',
    borderRadius: '999rpx 999rpx 999rpx 14rpx',
    backgroundColor: COLOR.ink,
    boxShadow: SHADOW.float
  },
  tabText: {
    fontSize: '24rpx',
    lineHeight: '32rpx',
    letterSpacing: '2rpx',
    color: COLOR.secondary
  },
  tabActive: {
    fontSize: '24rpx',
    lineHeight: '32rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: COLOR.onDark
  },
  brand: {
    fontFamily: FONT_STACK.serif
  }
}
