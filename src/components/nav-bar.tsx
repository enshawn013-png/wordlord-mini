import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { CSSProperties } from 'react'
import { PRESS, STYLE } from '../theme'
import { navTitlePadPx, statusBarHeightPx } from '../utils/metrics'

/** 返回上一层；没有上一层（比如开发时直接编译到这个页面）就回首页。 */
export function goBack(): void {
  Taro.navigateBack({
    fail: () => {
      Taro.reLaunch({ url: '/pages/home/index' })
    }
  })
}

/**
 * 自定义顶部标题栏（页面都设了 navigationStyle: custom，原生栏不显示）。
 *
 * 2026-09-28 起它是**浮在滚动内容上面的一条玻璃**（`STYLE.topBar` + app.css 的
 * `.glass .glass-bar-top`）：底色半透明白、背景模糊，下面的单词滚过去时糊成一片。
 * 所以页面必须给滚动内容留出顶部内边距 —— 用 `navBarHeightPx()` 或
 * `bigNavBarHeightPx()`（utils/metrics.ts），否则第一个词会被压在标题底下。
 *
 * 标题 34rpx 半粗居中，左边只放一个返回箭头，**右边什么都不放**
 * （右上角是微信原生胶囊，放什么都会被盖住；需要常驻入口请用底部 TabBar）。
 *
 * `big` = 首页 / 「选择词书」那种「苹果设置页」的大标题：44rpx 粗体、左边对齐。
 *
 * ⚠️ 2026-10：`big` 也能带返回箭头了，而且按 iOS 的**真实结构**做 ——
 * 返回箭头在上方那条紧凑栏里（88rpx），大标题在它下面单独一行。
 * 起因：加了「主界面 → 词书列表」这一层之后，词书列表需要返回，
 * 而自定义导航栏**没有系统返回按钮**，原来 big 分支根本没有箭头，会走不回去。
 * 带箭头的 big 栏更高，所以 `bigNavBarHeightPx(withBack)` 要把那 88rpx 算进去。
 */
export function NavBar({ title, back, big }: { title: string; back?: boolean; big?: boolean }) {
  return (
    <View
      className="glass glass-bar-top"
      style={{ ...STYLE.topBar, paddingTop: `${statusBarHeightPx()}px` }}
    >
      {big ? (
        <>
          {/* 紧凑栏：只放返回箭头，和大标题分开两行（iOS 大标题页就是这个结构） */}
          {back ? (
            <View style={styles.bigBackRow}>
              <View
                {...PRESS}
                aria-role="button"
                aria-label="返回"
                style={STYLE.navBack}
                onClick={goBack}
              >
                <Text style={STYLE.navBackIcon}>‹</Text>
              </View>
            </View>
          ) : null}
          <View style={STYLE.bigTitleBar}>
            <Text style={STYLE.bigTitle}>{title}</Text>
          </View>
        </>
      ) : (
        // 左右留白按微信胶囊的实际位置算（见 navTitlePadPx）：**不能写死**，
        // 各家机型 / 各家微信版本的胶囊宽度和位置都不一样，写窄了标题会钻到胶囊底下被盖住。
        // 左右取同一个值，标题才在屏幕正中；这个值也一定比返回箭头的 88rpx 宽，两者不打架。
        <View
          style={{
            ...STYLE.navBarInner,
            paddingLeft: `${navTitlePadPx()}px`,
            paddingRight: `${navTitlePadPx()}px`
          }}
        >
          {back ? (
            // 箭头本身是一个「‹」字符，读屏用户看不出它是什么，所以补一句 aria-label
            <View
              {...PRESS}
              aria-role="button"
              aria-label="返回"
              style={STYLE.navBack}
              onClick={goBack}
            >
              <Text style={STYLE.navBackIcon}>‹</Text>
            </View>
          ) : null}
          <Text style={STYLE.navTitle}>{title}</Text>
        </View>
      )}
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 大标题上方的紧凑栏：88rpx 高，返回箭头绝对定位在里面（STYLE.navBack 是 44px = 88rpx）
  bigBackRow: {
    height: '88rpx',
    position: 'relative'
  }
}
