import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import { COLOR, FONT, PRESS } from '../theme'

/**
 * 「我会了」药丸按钮，和标记圆圈并排。
 *
 * 未掌握：**玻璃药丸**（app.css 的 `.glass .glass-pill`）+ 次要文字色，点一下 = 掌握
 * 已掌握：浅绿底 `#E8F5E9` + 深绿字，长按 = 撤回（词回到翻书列表）。
 *         **这个绿底故意没玻璃化**——它是状态色（绿 = 会了），不是表面，
 *         换成半透明绿会跟旁边那些玻璃糊在一起，一眼分不出点没点过。
 *
 * 2026-10 复核改了两处：
 * - **热区 44rpx → 88rpx**：药丸视觉高度还是 44rpx，但外面套了一层 88rpx 的盒子，
 *   靠 **-22rpx 的负外边距**把多出来的部分还给布局（行高不变）。药丸宽度本来就
 *   超过 88rpx，所以只补高度。
 * - **字色**：已掌握的字从 `#34C759` 换成 `#1E7A34` —— 前者在浅绿底上只有 **1.97:1**，
 *   22rpx 的小字要 ≥4.5:1，等于没写；现在 **4.80:1**，还是那个绿，只是读得出来了。
 *
 * 事件挂在热区上、药丸本身只负责画；按下态用 hover-class（触屏没有 hover）。
 *
 * 撤回只能长按，且**点「我会了」已经不弹提示了**（用户 2026-10 要求取消那句弹窗），
 * 撤回的说明改成静态文字放在「熟练掌握词汇」页顶部 —— 所以这个隐藏操作有等价可见入口。
 */
const PILL_H = 44
const HIT = 88
const V_PAD = (HIT - PILL_H) / 2

const hitArea: CSSProperties = {
  flexShrink: 0,
  marginLeft: '16rpx',
  height: `${HIT}rpx`,
  marginTop: `-${V_PAD}rpx`,
  marginBottom: `-${V_PAD}rpx`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

/** 药丸本身的尺寸（底色在 .glass 里，或者由 pillDone 给） */
const pillBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: '8rpx',
  paddingBottom: '8rpx',
  paddingLeft: '20rpx',
  paddingRight: '20rpx',
  borderRadius: '24rpx'
}

export function MasterPill({
  mastered,
  onMaster,
  onUnmaster
}: {
  mastered: boolean
  onMaster: () => void
  onUnmaster: () => void
}) {
  return (
    <View
      {...PRESS}
      style={hitArea}
      onClick={mastered ? undefined : onMaster}
      onLongPress={mastered ? onUnmaster : undefined}
    >
      <View
        className={mastered ? undefined : 'glass glass-pill'}
        style={mastered ? { ...pillBase, backgroundColor: COLOR.pillDone } : pillBase}
      >
        <Text
          style={{
            fontSize: FONT.pill,
            lineHeight: '28rpx',
            color: mastered ? COLOR.pillDoneText : COLOR.pillText
          }}
        >
          {mastered ? '已掌握' : '我会了'}
        </Text>
      </View>
    </View>
  )
}
