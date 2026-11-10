import { Component } from 'react'
import type { CSSProperties, ErrorInfo, ReactNode } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { COLOR, FONT, PAGE_PAD } from '../theme'

/**
 * 列表页的兜底：**出错也不能白屏**。
 *
 * 真机上的报错在开发者工具里看不到（Console 读不到，手机上的 vConsole 也传不出来），
 * 页面一旦整屏白掉就等于零信息。所以两个手段一起上：
 * 1. 读数据时 try/catch（页面自己包），把错误原文记进本地缓存；
 * 2. 渲染阶段用 `<RowBoundary>` 接住，把错误原文**摊在屏幕上**——截个图就等于把控制台发过来了。
 *
 * 2026-10 从生词本页提出来：生词本的列表搬去了「全部生词」子页，两个页面都要这套兜底。
 * 兜底 UI（ErrorBox）只用 View/Text，不碰任何业务组件——它自己绝不能再出错。
 */

/** 上一次出错的位置和原文，存在本地（下载 Storage 就能看到） */
const ERROR_KEY = 'wordlord_last_error_v1'

/** 把错误整理成一段能读的文本 */
export function detailOf(e: unknown): string {
  if (e instanceof Error) return `${e.message}\n${e.stack ?? ''}`
  return String(e)
}

/** 出错时把原文也写一份进缓存，方便事后从磁盘上把它翻出来 */
export function rememberError(where: string, detail: string): void {
  try {
    Taro.setStorageSync(ERROR_KEY, { where, detail, at: Date.now() })
  } catch {
    // 记录失败就算了，绝不能因为它再抛一次
  }
}

/** 渲染阶段出错时的兜底：把错误原文写在屏幕上（红字、能换行、不撑破布局） */
export class RowBoundary extends Component<{ where: string; children: ReactNode }, { error: string }> {
  state = { error: '' }

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: detailOf(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const detail = `${detailOf(error)}\n${info?.componentStack ?? ''}`
    rememberError(this.props.where, detail)
    this.setState({ error: detail })
  }

  render(): ReactNode {
    return this.state.error ? (
      <ErrorBox title={`${this.props.where}失败`} detail={this.state.error} />
    ) : (
      this.props.children
    )
  }
}

export function ErrorBox({ title, detail }: { title: string; detail: string }) {
  // 只用 View/Text，不碰任何业务组件——兜底 UI 自己绝不能再出错
  return (
    <View style={styles.errorBox}>
      <Text className="text-break" style={styles.errorTitle}>
        {title}
      </Text>
      <Text className="text-break" style={styles.errorText}>
        {detail}
      </Text>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 兜底错误块：红字摊开、能换行，宁可难看也要把原文露出来
  errorBox: {
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    borderRadius: '24rpx',
    backgroundColor: COLOR.dangerFill
  },
  errorTitle: {
    fontSize: FONT.definition,
    fontWeight: '700',
    // 危险色的**文字**版本：28rpx 的红字用 #FF3B30 只有 3.6:1，不够读
    color: COLOR.dangerText
  },
  errorText: {
    marginTop: '16rpx',
    fontSize: FONT.meta,
    color: COLOR.body
  }
}
