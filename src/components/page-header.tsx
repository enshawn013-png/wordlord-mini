import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import { Stripe } from './stripe'
import { COLOR, FONT_STACK } from '../theme'

/**
 * 页面主视觉（2026-11）
 *
 * 每个内页进来先看到一块深松绿：「栏目名 + 一句大标题 + 一句说明」，
 * 右上角压一枚半透明的巨大汉字做气氛，左边一道朱砂书脊。
 * 全站共用这一块，页面之间才有同一个「品牌感」。
 *
 * `ghost` 可以换掉那枚背景字（默认取标题第一个字）。
 * 动画交给调用方：默认自带 560ms 的 riseIn，比正文早 40ms。
 */
export function PageHeader({
  kicker,
  title,
  sub,
  ghost,
  delay = 40
}: {
  kicker: string
  title: string
  sub?: string
  ghost?: string
  delay?: number
}) {
  const mark = ghost || title.slice(0, 1)

  return (
    <View
      style={{
        ...styles.wrap,
        animation: 'riseIn 560ms cubic-bezier(.22,1,.36,1) backwards',
        animationDelay: `${delay}ms`
      }}
    >
      <View style={styles.spine} />
      <View style={styles.arc} />
      <Text style={styles.ghost}>{mark}</Text>
      <View style={styles.kickerRow}>
        <View style={styles.kickerDot} />
        <Text style={styles.kicker}>{kicker}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      <View style={styles.stripeClip}>
        <Stripe tone="yellow" height={22} />
      </View>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    marginLeft: '36rpx',
    marginRight: '36rpx',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '30rpx',
    paddingBottom: '40rpx',
    borderRadius: '0rpx',
    backgroundColor: COLOR.teal,
  },
  // 左侧一道朱砂「书脊」：从块的顶边凹进去一点，不顶满
  spine: {
    position: 'absolute',
    left: '0rpx',
    top: '0rpx',
    bottom: '0rpx',
    width: '8rpx',
    backgroundColor: COLOR.warm
  },
  ghost: {
    position: 'absolute',
    right: '-10rpx',
    top: '-40rpx',
    fontFamily: FONT_STACK.serif,
    fontSize: '240rpx',
    lineHeight: '240rpx',
    color: 'rgba(251, 247, 236, 0.055)'
  },
  kickerRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  kickerDot: {
    width: '12rpx',
    height: '12rpx',
    borderRadius: '6rpx',
    backgroundColor: COLOR.marigold,
    marginRight: '12rpx'
  },
  kicker: {
    fontSize: '18rpx',
    letterSpacing: '4rpx',
    color: 'rgba(251, 247, 236, 0.55)'
  },
  title: {
    display: 'block',
    marginTop: '10rpx',
    // 中文标题走宋体：一眼就是「杂志」而不是「App」
    fontFamily: FONT_STACK.cn,
    fontSize: '66rpx',
    lineHeight: '78rpx',
    fontWeight: '700',
    letterSpacing: '2rpx',
    color: COLOR.onDark
  },
  sub: {
    display: 'block',
    marginTop: '10rpx',
    marginBottom: '26rpx',
    fontSize: '21rpx',
    lineHeight: '32rpx',
    color: 'rgba(251, 247, 236, 0.52)'
  },
  // 右侧一枚大弧：只描边，一半在块外
  arc: {
    position: 'absolute',
    right: '-150rpx',
    bottom: '-180rpx',
    width: '360rpx',
    height: '360rpx',
    borderRadius: '180rpx',
    border: '2rpx solid rgba(240, 178, 63, 0.35)',
    animation: 'arcIn 1100ms cubic-bezier(.22,1,.36,1) 320ms backwards'
  },
  // 斜纹从左往右「刷」出来
  stripeClip: {
    position: 'absolute',
    left: '0rpx',
    right: '0rpx',
    bottom: '0rpx',
    overflow: 'hidden',
    animation: 'stripeIn 720ms cubic-bezier(.22,1,.36,1) 240ms backwards'
  }
}
