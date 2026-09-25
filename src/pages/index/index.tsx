import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ListRow } from '../../components/list-row'
import { NavBar } from '../../components/nav-bar'
import { ALL_WORDS, BUILTIN_BOOK, BUILTIN_BOOK_ID, UPLOAD_GROUP_TITLE } from '../../data/words'
import { summarize, uploadSummary } from '../../store/books'
import { loadTodayCounts } from '../../store/storage'
import { COLOR, PAGE_PAD, STYLE } from '../../theme'

/**
 * 第一层：词书列表。只有「大学六级」和「我的上传」两项。
 * 高频 / 中频 / 低频在下一层（pages/levels）。
 *
 * 排版照苹果「设置」页来：纯白底、顶部一个大标题、下面一行行文字，
 * 每行右边一个灰色箭头——没有卡片、没有渐变、没有阴影、没有分割线、没有图标。
 */
export default function ShelfScreen() {
  const [revision, setRevision] = useState(0)

  // 从翻书页或上传页返回时重新读一次本地缓存
  useDidShow(() => setRevision((r) => r + 1))

  const today = loadTodayCounts()
  const builtin = useMemo(() => {
    void revision
    return summarize(ALL_WORDS)
  }, [revision])
  const upload = useMemo(() => {
    void revision
    return uploadSummary()
  }, [revision])

  return (
    <View style={STYLE.container}>
      {/* 大标题（36rpx 粗体、左边对齐），没有返回——这是第一层 */}
      <NavBar title="单词君" big />

      <ScrollView scrollY style={STYLE.list}>
        <ListRow
          title={BUILTIN_BOOK.title}
          meta={`共 ${builtin.total} 词 · 还剩 ${builtin.remain} 词`}
          onOpen={() => Taro.navigateTo({ url: `/pages/levels/index?bookId=${BUILTIN_BOOK_ID}` })}
        />
        <ListRow
          title={UPLOAD_GROUP_TITLE}
          meta={upload.count === 0 ? '暂无上传' : `共 ${upload.total} 词 · 还剩 ${upload.remain} 词`}
          onOpen={() => Taro.navigateTo({ url: '/pages/uploads/index' })}
        />
      </ScrollView>

      <View style={styles.todayBar}>
        <Text style={styles.todayText}>
          今日：翻了 {today.pageCount} 页 · 标记了 {today.markCount} 个词
        </Text>
      </View>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  todayBar: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '24rpx',
    paddingBottom: '32rpx'
  },
  todayText: {
    fontSize: '24rpx',
    color: COLOR.secondary
  }
}
