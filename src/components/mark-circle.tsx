import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import { markColor, markTextColor } from '../store/storage'
import { COLOR } from '../theme'

/**
 * 标记圆圈：直径 44rpx。
 *
 * 注意 borderStyle 必须写——Taro 把样式原样透传给 WXSS，而 CSS 里 border-style
 * 的初始值是 none，只写 borderWidth + borderColor 的话边框一条都不画，
 * 空状态（透明底）就会整个隐形，看起来像是按钮没渲染出来。
 */
const SIZE = 44

const circle: CSSProperties = {
  width: `${SIZE}rpx`,
  height: `${SIZE}rpx`,
  flexShrink: 0,
  borderRadius: `${SIZE / 2}rpx`,
  borderWidth: '2rpx',
  borderStyle: 'solid',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

const circleText: CSSProperties = {
  fontSize: '22rpx',
  fontWeight: '600'
}

/**
 * 标记圆圈：点一次 +1、长按 −1，填色按次数由浅到深（最多 7 次）。
 * 还没标记时是浅灰描边、内里透明。
 */
export function MarkCircle({
  markCount,
  onIncrement,
  onDecrement,
  style
}: {
  markCount: number
  onIncrement: () => void
  onDecrement: () => void
  style?: CSSProperties
}) {
  const filled = markCount > 0
  const fill = filled ? markColor(markCount) : 'transparent'

  return (
    <View
      style={{
        ...circle,
        ...(style || {}),
        backgroundColor: fill,
        borderColor: filled ? fill : COLOR.circleEmptyBorder
      }}
      onClick={onIncrement}
      onLongPress={onDecrement}
    >
      {filled ? (
        <Text style={{ ...circleText, color: markTextColor(markCount) }}>{markCount}</Text>
      ) : null}
    </View>
  )
}

/** 只读版（生词本里显示这个词被标了几次） */
export function MarkBadge({ markCount, style }: { markCount: number; style?: CSSProperties }) {
  const fill = markColor(markCount)
  return (
    <View style={{ ...circle, ...(style || {}), backgroundColor: fill, borderColor: fill }}>
      <Text style={{ ...circleText, color: markTextColor(markCount) }}>{markCount}</Text>
    </View>
  )
}
