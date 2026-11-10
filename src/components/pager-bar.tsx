import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import { BOTTOM_PAD, COLOR, FONT, PRESS, STYLE } from '../theme'
import { rpxToPx, tabBarHeightPx } from '../utils/metrics'

/**
 * 底部那一行「上一页 / 下一页」胶囊，翻书页和「熟练掌握词汇」共用。
 *
 * 2026-09-28 从翻书页里提出来：两页长得必须一模一样，各写一份迟早会漂。
 * 样式（玻璃胶囊、黑底主按钮、禁用态）跟着组件走。
 *
 * 它是**浮在滚动内容上面**的（STYLE.bottomBar），底部压在自绘 Tab 栏上
 * （`bottom` = Tab 栏高度），所以词会从它底下滚过去——玻璃才糊得到东西。
 * 调用方的滚动内容要留出 `pagerBarHeightPx() + tabBarHeightPx()` 的底部内边距。
 *
 * 胶囊本身 88rpx 高 = 44pt，热区已经达标，2026-10 只补了按下态（PRESS）。
 */

/** 这一块的高度：上 16rpx + 胶囊 88rpx + 下 48rpx（和 styles.footer 是一对） */
export function pagerBarHeightPx(): number {
  return rpxToPx(152)
}

export function PagerBar({
  canPrev,
  canNext,
  onPrev,
  onNext
}: {
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <View style={{ ...STYLE.bottomBar, ...styles.footer, bottom: `${tabBarHeightPx()}px` }}>
      <View
        {...PRESS}
        className="glass glass-pill"
        style={{ ...styles.capsule, ...(canPrev ? null : STYLE.disabledBtn) }}
        onClick={onPrev}
      >
        <Text style={styles.capsulePrevText}>上一页</Text>
      </View>
      <View
        {...PRESS}
        style={{
          ...styles.capsule,
          ...styles.capsuleDark,
          marginLeft: '24rpx',
          ...(canNext ? null : STYLE.disabledBtn)
        }}
        onClick={onNext}
      >
        <Text style={styles.capsuleText}>下一页</Text>
      </View>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 定位（absolute / left / right / bottom）来自 STYLE.bottomBar
  footer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '16rpx',
    // 按钮块距屏幕底 48rpx（再往下就是 Tab 栏，所以 bottom 还要加一个 Tab 栏的高度）
    paddingBottom: BOTTOM_PAD
  },
  // 胶囊：高 88rpx、左右各 48rpx、圆角半径取高度一半。
  // **这里不写 backgroundColor**：「上一页」靠 .glass 出半透明白底，
  // 行内的底色会盖掉 class，所以要黑底就单独用 capsuleDark 叠上去。
  capsule: {
    height: '88rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: '48rpx',
    paddingRight: '48rpx',
    borderRadius: '6rpx'
  },
  /** 「下一页」：黑底实心白字（用户 2026-09-28 选的：主操作不玻璃化） */
  capsuleDark: {
    backgroundColor: COLOR.black
  },
  capsuleText: {
    fontSize: FONT.definition,
    color: COLOR.onDark
  },
  // 「上一页」：玻璃底 + 主文字色
  capsulePrevText: {
    fontSize: FONT.definition,
    color: COLOR.text
  }
}
