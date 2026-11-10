import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'

/**
 * 页面开幕 · 丝滑拉门 + 艺术字页名（2026-11 定稿）
 *
 * 丝滑的关键：**没有停顿帧**。两块板从头到尾只跑一条
 * `cubic-bezier(.66,0,.18,1)` 的缓动——起步极缓（门完整可见），
 * 中段加速，收尾缓缓落定，全程速度连续。
 *
 * 门缝之间显示**这一页的名字**：英文小字 kicker + 宋体特粗大字，
 * 随开门浮现、随开门结束淡出。每页的名字由调用方传入。
 *
 * 总长 880ms；只动 transform / opacity；pointerEvents: none 从不挡操作。
 */

export function PageCurtain({ label, kicker }: { label: string; kicker: string }) {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setGone(true), 880)
    return () => clearTimeout(t)
  }, [])

  if (gone) return null

  return (
    <View style={styles.wrap} aria-hidden>
      {/* 上门：万寿菊 / 下门：朱砂 */}
      <View style={styles.top} />
      <View style={styles.bottom} />

      {/* 页名：kicker + 宋体大字 + 上下两道细线，随开门浮现再淡出 */}
      <View style={styles.titleWrap}>
        <Text style={styles.kicker}>{kicker}</Text>
        <View style={styles.rule} />
        <Text style={styles.label}>{label}</Text>
        <View style={styles.rule} />
      </View>

      {/* 合缝细线 */}
      <View style={styles.seam} />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    overflow: 'hidden',
    pointerEvents: 'none'
  },
  top: {
    position: 'absolute',
    top: '-2%',
    left: '-2%',
    right: '-2%',
    height: '54%',
    backgroundColor: '#F0B23F',
    animation: 'curtainOpenUp 880ms cubic-bezier(.66,0,.18,1) both'
  },
  bottom: {
    position: 'absolute',
    bottom: '-2%',
    left: '-2%',
    right: '-2%',
    height: '54%',
    backgroundColor: '#D2411D',
    animation: 'curtainOpenDown 880ms cubic-bezier(.66,0,.18,1) both'
  },
  titleWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '560rpx',
    marginLeft: '-280rpx',
    marginTop: '-150rpx',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    transform: 'rotate(-3deg)',
    animation: 'curtainTitle 880ms cubic-bezier(.66,0,.18,1) both'
  },
  kicker: {
    fontSize: '18rpx',
    lineHeight: '26rpx',
    letterSpacing: '8rpx',
    color: 'rgba(18, 49, 45, 0.72)',
    fontFamily: '"Helvetica Neue", sans-serif',
    fontWeight: '600'
  },
  rule: {
    width: '56rpx',
    height: '3rpx',
    marginTop: '14rpx',
    marginBottom: '14rpx',
    backgroundColor: '#FBF7EC'
  },
  label: {
    fontFamily: '"Songti SC", "STSong", "Noto Serif SC", serif',
    fontSize: '88rpx',
    lineHeight: '116rpx',
    fontWeight: '900',
    letterSpacing: '12rpx',
    color: '#FBF7EC',
    textShadow: '0 4rpx 18rpx rgba(0,0,0,0.18)'
  },
  seam: {
    position: 'absolute',
    top: '50%',
    left: '-2%',
    right: '-2%',
    height: '3rpx',
    marginTop: '-1rpx',
    backgroundColor: 'rgba(251, 247, 236, 0.85)',
    animation: 'curtainSeam 880ms ease both'
  }
}
