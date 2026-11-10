import type { CSSProperties } from 'react'
import { View } from '@tarojs/components'
import { COLOR } from '../theme'

/**
 * 警戒斜纹（2026-11）
 *
 * 首页那条黄黑斜纹搬到全站：它不是装饰画，是**版面分隔线**——
 * 放在块与块之间，比一根细线更有存在感，也更像印刷品。
 *
 * `tone`：
 * - `yellow` 深底上用（万寿菊 + 透明）
 * - `red`    浅底上用（朱砂 + 透明）
 * - `ink`    白块上用（墨 + 透明）
 */
export function Stripe({
  tone = 'yellow',
  height = 26,
  style
}: {
  tone?: 'yellow' | 'red' | 'ink'
  height?: number
  style?: CSSProperties
}) {
  const color = tone === 'red' ? COLOR.warm : tone === 'ink' ? COLOR.text : COLOR.marigold

  return (
    <View
      style={{
        ...styles.wrap,
        height: `${height}rpx`,
        backgroundImage: `repeating-linear-gradient(45deg, ${color} 0rpx, ${color} ${height / 2.4}rpx, transparent ${height / 2.4}rpx, transparent ${height / 1.15}rpx)`,
        ...(style || {})
      }}
    />
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    width: '100%',
    backgroundColor: 'transparent'
  }
}
