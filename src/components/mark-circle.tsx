import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import { markColor, markTextColor } from '../store/storage'
import { COLOR, PRESS } from '../theme'

/**
 * 标记圆圈：**视觉直径 56rpx（28pt），热区 88rpx（44pt）**。
 *
 * 2026-10 的 UI 复核改了三处，都是「看着还行、真机上不行」的那种：
 *
 * 1. **热区 44rpx → 88rpx**。44rpx 只有 22pt，连 iOS 的最小视觉尺寸（28pt）都不到，
 *    更别说 44pt 的热区 —— 它是全站最该修的一处。做法：外面套一层 88rpx 的盒子，
 *    再用 **-16rpx 的负外边距**把多出来的部分还给布局。热区撑大了，
 *    圆圈本身只从 44rpx 长到 56rpx，整行只高 12rpx（翻书页「一屏 4 个词」基本没动）。
 * 2. **视觉 44rpx → 56rpx**：两位数（「7」）在 44rpx 里挤；填充色也需要一点面积才看得清。
 * 3. **一档填充色**：原来是最浅的灰 `#E5E5EA`（对白底 1.2:1），和「没标记」（透明底 + 灰描边）
 *    几乎分不出来 —— 用户标了一次却看不出来是最伤士气的。现在一档是**淡蓝 `#CFE3FF`**
 *    （和深色文字的对比度 12.7:1），既是明确的「动过手」信号，也顺着二档的蓝往下走，
 *    颜色阶梯从浅蓝 → 蓝 → 黄 → 橙 → 红 → 深红，一路是「越来越熟」。
 *
 * 事件挂在**热区**上、圆圈只负责画：所以点击区域是 88rpx，视觉还是一个小圆。
 * 按下态用 `hover-class`（触屏上唯一的可靠反馈，见 theme.ts 的 PRESS）。
 *
 * 注意 borderStyle 必须写——Taro 把样式原样透传给 WXSS，而 CSS 里 border-style
 * 的初始值是 none，只写 borderWidth + borderColor 的话边框一条都不画，
 * 空状态（透明底）就会整个隐形，看起来像是按钮没渲染出来。
 */
const SIZE = 56
const HIT = 88
/** 视觉圆之外要补出来的量，负外边距用同一个值还回布局 */
const PAD = (HIT - SIZE) / 2

const hitArea: CSSProperties = {
  width: `${HIT}rpx`,
  height: `${HIT}rpx`,
  marginTop: `-${PAD}rpx`,
  marginBottom: `-${PAD}rpx`,
  marginLeft: `-${PAD}rpx`,
  marginRight: `-${PAD}rpx`,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

const circle: CSSProperties = {
  width: `${SIZE}rpx`,
  height: `${SIZE}rpx`,
  borderRadius: `${SIZE / 2}rpx`,
  borderWidth: '2rpx',
  borderStyle: 'solid',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

const circleText: CSSProperties = {
  fontSize: '26rpx',
  fontWeight: '600'
}

/**
 * 标记圆圈：点一次 +1、长按 −1，填色按次数由浅到深（最多 7 次）。
 * 还没标记时是灰描边、内里透明。
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
      {...PRESS}
      style={{ ...hitArea, ...(style || {}) }}
      onClick={onIncrement}
      onLongPress={onDecrement}
    >
      <View
        style={{
          ...circle,
          backgroundColor: fill,
          borderColor: filled ? fill : COLOR.circleEmptyBorder
        }}
      >
        {filled ? (
          <Text style={{ ...circleText, color: markTextColor(markCount) }}>{markCount}</Text>
        ) : null}
      </View>
    </View>
  )
}

/** 只读版（复习记录的分档页、分组标题里显示这一档的标记圆圈） */
export function MarkBadge({ markCount, style }: { markCount: number; style?: CSSProperties }) {
  const fill = markColor(markCount)
  return (
    <View style={{ ...circle, ...(style || {}), backgroundColor: fill, borderColor: fill }}>
      <Text style={{ ...circleText, color: markTextColor(markCount) }}>{markCount}</Text>
    </View>
  )
}
