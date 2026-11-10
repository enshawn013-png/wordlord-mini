import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import { COLOR, FONT_STACK, PRESS } from '../theme'
import { getUiPrefs } from '../store/storage'

/**
 * 大动作条（2026-11）
 *
 * 内页的「主操作」不再是一条居中的通栏按钮 —— 那样太像表单。
 * 现在：整行占满宽度，按钮**靠惯用手那一侧**（默认右下），
 * 左边留一小段说明文字，形状是斜切的硬边块，和首页那个平行四边形箭头同一套。
 *
 * 这样右手单手握持时，拇指正好落在按钮上；左手用户在设置里切一下，整块镜像。
 */
export function BigAction({
  label,
  meta,
  onTap,
  tone = 'ink'
}: {
  label: string
  /** 按钮左侧那句小字（比如「6 个词」） */
  meta?: string
  onTap: () => void
  tone?: 'ink' | 'red'
}) {
  const hand = getUiPrefs().hand

  return (
    <View
      style={{
        ...styles.row,
        flexDirection: hand === 'left' ? 'row-reverse' : 'row'
      }}
    >
      <View style={styles.copy}>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <View
        {...PRESS}
        style={{
          ...styles.btn,
          alignSelf: hand === 'left' ? 'flex-start' : 'flex-end',
          backgroundColor: tone === 'red' ? COLOR.warm : COLOR.ink,
          // 叶形：两个对角圆、两个对角尖；跟手镜像，尖角永远朝拇指那一侧
          borderRadius:
            hand === 'left' ? '0rpx 72rpx 0rpx 72rpx' : '72rpx 0rpx 72rpx 0rpx'
        }}
        onClick={onTap}
      >
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.arrow}>→</Text>
      </View>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  row: {
    marginTop: '22rpx',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between'
  },
  copy: {
    flex: 1,
    minWidth: '0rpx',
    paddingRight: '18rpx',
    paddingBottom: '14rpx',
    display: 'flex',
    flexDirection: 'column'
  },
  meta: {
    fontSize: '18rpx',
    lineHeight: '28rpx',
    letterSpacing: '2rpx',
    color: COLOR.secondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden'
  },
  // 斜切的大块：宽度到屏幕边，高度 132rpx
  btn: {
    width: '68%',
    height: '132rpx',
    paddingLeft: '34rpx',
    paddingRight: '34rpx',
    borderRadius: '72rpx 0rpx 72rpx 0rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  label: {
    fontFamily: FONT_STACK.cn,
    fontSize: '40rpx',
    fontWeight: '700',
    letterSpacing: '2rpx',
    color: '#FFF9F0'
  },
  arrow: {
    fontSize: '34rpx',
    color: COLOR.marigold
  }
}
