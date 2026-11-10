import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import { COLOR, FONT, PRESS } from '../theme'

/**
 * 小胶囊（近 7 天 / 近 30 天、复习数量快捷键、计划模式切换…）。
 *
 * ## 为什么要做成组件
 *
 * 2026-10 的 UI 复核发现全站有 **8 处**这种胶囊的热区只有 50~72rpx（25~36pt），
 * 低于 44pt 的底线，而且每个页面都自己抄了一遍样式（字号、圆角、内边距各不相同）。
 * 这个组件把「视觉 56rpx + 热区 88rpx」一次做对：
 *
 * - **背景只画在内层**（`pill`）：视觉上就是一颗 56rpx 的小胶囊，和以前一模一样；
 * - **外层负责接事件**：上下各垫 16rpx 内边距 → 88rpx 高，再用同值负外边距还回布局，
 *   所以**行高不变**（这是 `components/mark-circle.tsx` 那套做法的同一招）。
 *
 * ⚠️ 别用「加大 chip 自己的 padding」来凑热区：胶囊的底色就是它自己的背景，
 * padding 一加，胶囊看起来就变成一个胖块了 —— 热区和视觉必须分开。
 */
const HIT_PAD = 16
const PILL_HEIGHT = 56

export function Chip({
  label,
  on,
  onClick,
  style
}: {
  label: string
  /** 选中态：黑底白字（全站的「选中」就是这个语气） */
  on?: boolean
  onClick?: () => void
  style?: CSSProperties
}) {
  return (
    <View {...PRESS} style={{ ...hit, ...(style || {}) }} onClick={onClick}>
      <View
        className={on ? undefined : 'glass glass-pill'}
        style={{ ...pill, ...(on ? pillOn : null) }}
      >
        <Text style={on ? textOn : text}>{label}</Text>
      </View>
    </View>
  )
}

const hit: CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: `${HIT_PAD}rpx`,
  paddingBottom: `${HIT_PAD}rpx`,
  marginTop: `-${HIT_PAD}rpx`,
  marginBottom: `-${HIT_PAD}rpx`
}

const pill: CSSProperties = {
  height: `${PILL_HEIGHT}rpx`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingLeft: '24rpx',
  paddingRight: '24rpx',
  borderRadius: '6rpx'
}

const pillOn: CSSProperties = {
  backgroundColor: COLOR.black
}

const text: CSSProperties = {
  fontSize: FONT.meta,
  color: COLOR.secondary
}

const textOn: CSSProperties = {
  fontSize: FONT.meta,
  color: COLOR.onDark
}
