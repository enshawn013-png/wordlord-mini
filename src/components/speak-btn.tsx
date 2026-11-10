import type { CSSProperties } from 'react'
import { View } from '@tarojs/components'
import { speak } from '../services/tts'
import { PRESS } from '../theme'

/**
 * 发音按钮：**视觉 22rpx 的小喇叭，热区 88rpx**（= 44pt）。
 *
 * 为什么必须有它：这是个背单词的 App，而在这之前**一个词都听不了**
 * （`services/tts.ts` 是个只弹 Toast 的占位）。单词的拼写、音标、读音是同一件事，
 * 少了读音，用户就只能在心里默念 —— 这是这个品类的基础设施，不是加分项。
 *
 * 热区照抄 `mark-circle.tsx` 那套「视觉小、热区大、负外边距还回布局」的做法，
 * 所以它放在单词右边不会把行高撑起来。
 *
 * 点第二次 = 停止播放（见 services/tts.ts 的 speak）。
 */
const HIT = 88
const SIZE = 22
const PAD = (HIT - SIZE) / 2

export function SpeakBtn({ word, style }: { word: string; style?: CSSProperties }) {
  return (
    <View
      {...PRESS}
      // 无障碍：这是一个没有文字的图标按钮，读屏用户只能靠这一行知道它是什么
      aria-role="button"
      aria-label={`朗读 ${word}`}
      style={{ ...hitArea, ...(style || {}) }}
      onClick={(e) => {
        // 发音按钮常常嵌在「整块可点」的容器里（复习卡、翻书页的词条），
        // 不拦住冒泡的话点一次会连带触发外层（比如展开释义）
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
        speak(word)
      }}
    >
      <View style={styles.icon}>
        <View className="speak-body" />
        <View className="speak-horn" />
      </View>
    </View>
  )
}

const hitArea: CSSProperties = {
  width: `${HIT}rpx`,
  height: `${HIT}rpx`,
  marginTop: `-${PAD}rpx`,
  marginBottom: `-${PAD}rpx`,
  marginRight: `-${PAD}rpx`,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

const styles: Record<string, CSSProperties> = {
  // 矩形 + 三角形并排，垂直居中
  icon: {
    width: `${SIZE}rpx`,
    height: `${SIZE}rpx`,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  }
}
