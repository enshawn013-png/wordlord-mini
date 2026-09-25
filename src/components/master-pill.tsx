import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import { COLOR, FONT } from '../theme'

/**
 * 「我会了」药丸按钮，和标记圆圈并排。
 *
 * 未掌握：浅灰底 #F2F2F7 + 灰字 #86868B，点一下 = 掌握
 * 已掌握：浅绿底 #E8F5E9 + 绿字 #34C759，长按 = 撤回（词回到翻书列表）
 *
 * 撤回只能长按——所以第一次点「我会了」时页面会弹一句提示告诉用户怎么撤销。
 */
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
      style={mastered ? styles.pillDone : styles.pill}
      onClick={mastered ? undefined : onMaster}
      onLongPress={mastered ? onUnmaster : undefined}
    >
      <Text style={mastered ? styles.pillDoneText : styles.pillText}>
        {mastered ? '已掌握' : '我会了'}
      </Text>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  pill: {
    flexShrink: 0,
    marginLeft: '16rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '8rpx',
    paddingBottom: '8rpx',
    paddingLeft: '20rpx',
    paddingRight: '20rpx',
    borderRadius: '24rpx',
    backgroundColor: COLOR.pill
  },
  pillDone: {
    flexShrink: 0,
    marginLeft: '16rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '8rpx',
    paddingBottom: '8rpx',
    paddingLeft: '20rpx',
    paddingRight: '20rpx',
    borderRadius: '24rpx',
    backgroundColor: COLOR.pillDone
  },
  // line-height 28 + 上下 8rpx = 44rpx，和标记圆圈一样高，两个按钮并排才齐
  pillText: {
    fontSize: FONT.pill,
    lineHeight: '28rpx',
    color: COLOR.pillText
  },
  pillDoneText: {
    fontSize: FONT.pill,
    lineHeight: '28rpx',
    color: COLOR.pillDoneText
  }
}
