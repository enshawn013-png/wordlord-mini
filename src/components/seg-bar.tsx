import type { CSSProperties } from 'react'
import { View } from '@tarojs/components'
import { COLOR } from '../theme'

/**
 * 进度条（2026-11 统一版）。
 *
 * 之前是「十六段小方块」，在窄屏上会碎成一条虚线，看着像加载动画。
 * 现在是一根连续的圆头条：底槽浅、已读部分是朱砂，
 * 走完后末端自然收圆 —— 首页、卡片、复习、计划共用这一个语汇。
 */
export function SegBar({
  value,
  total,
  style
}: {
  value: number
  total: number
  /** 兼容旧签名，已不再使用（不再分段） */
  segments?: number
  style?: CSSProperties
}) {
  const pct = total > 0 ? Math.min(Math.max(value / total, 0), 1) * 100 : 0

  return (
    <View style={{ ...styles.track, ...(style || {}) }}>
      <View style={{ ...styles.fill, width: `${pct}%` }} />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  track: {
    height: '10rpx',
    borderRadius: '5rpx',
    backgroundColor: COLOR.track,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'row'
  },
  fill: {
    height: '10rpx',
    borderRadius: '5rpx',
    backgroundColor: COLOR.warm
  }
}
