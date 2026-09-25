import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { STYLE } from '../theme'

/** 状态栏高度只跟设备有关，取一次缓存住（每次渲染都跨桥调用没必要）。 */
let cachedStatusBarHeight: number | null = null
function statusBarHeightPx(): number {
  if (cachedStatusBarHeight === null) {
    try {
      cachedStatusBarHeight = Taro.getWindowInfo().statusBarHeight || 20
    } catch {
      cachedStatusBarHeight = 20
    }
  }
  return cachedStatusBarHeight
}

/** 返回上一层；没有上一层（比如开发时直接编译到这个页面）就回首页。 */
export function goBack(): void {
  Taro.navigateBack({
    fail: () => {
      Taro.reLaunch({ url: '/pages/index/index' })
    }
  })
}

/**
 * 自定义顶部标题栏（页面都设了 navigationStyle: custom，原生栏不显示）。
 * 中间标题，左边可选返回，右边可选一个文字按钮。
 *
 * `big` = 首页那种「苹果设置页」的大标题：36rpx 粗体、左边对齐、没有返回。
 * 注意右上角是微信原生胶囊，所以这一栏**不能**放右侧按钮——会被胶囊盖住，
 * 需要常驻入口请用底部 TabBar（components/tab-bar.tsx）。
 */
export function NavBar({
  title,
  back,
  right,
  big
}: {
  title: string
  back?: boolean
  right?: { label: string; onTap: () => void }
  big?: boolean
}) {
  if (big) {
    return (
      <View style={{ ...STYLE.navBar, paddingTop: `${statusBarHeightPx()}px` }}>
        <View style={STYLE.bigTitleBar}>
          <Text style={STYLE.bigTitle}>{title}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ ...STYLE.navBar, paddingTop: `${statusBarHeightPx()}px` }}>
      <View style={STYLE.navBarInner}>
        {back ? (
          <View style={STYLE.navBack} onClick={goBack}>
            <Text style={STYLE.navBackIcon}>‹</Text>
          </View>
        ) : null}
        <Text style={STYLE.navTitle}>{title}</Text>
        {right ? (
          <View style={STYLE.navRight} onClick={right.onTap}>
            <Text style={STYLE.navRightText}>{right.label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
