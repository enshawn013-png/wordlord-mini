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
import { bigNavBarHeightPx, bottomSafePx, topGapPx } from '../../utils/metrics'

/**
 * 第二层：词书列表。「大学六级」「我的上传」两项。高频 / 中频 / 低频在下一层（pages/levels）。
 *
 * ⚠️ 2026-10：这一页**不再是启动页**了 —— 主界面（pages/home）成了封面/入口，
 * 这里是「点了背单词之后」进来的地方，所以：
 * - 导航栏改成 **big + back**（大标题「选择词书」+ 上方紧凑栏里的返回箭头）；
 *   品牌名「单词君」跟着主界面走了，这里只说这一页是干什么的；
 * - 顶部内边距用 `bigNavBarHeightPx(true)`（多了那条 88rpx 的返回栏）。
 *
 * 「我的」那一行 2026-10 跟着「我的」页一起删了，本页不再关心登录状态。
 *
 * 排版照苹果「设置」页来：纯白底、顶部一个大标题、下面一行行文字，
 * 每行右边一个灰色箭头——没有卡片、没有渐变、没有阴影、没有分割线、没有图标。
 */
export default function ShelfScreen() {
  const [revision, setRevision] = useState(0)

  // 从翻书页 / 上传页返回时重新读一次本地缓存
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
      {/* 滚动内容从大标题底下穿过去（玻璃才糊得到东西），所以上面留出导航栏的高度 */}
      <ScrollView scrollY style={STYLE.list}>
        <View
          style={{
            // 大标题栏高度（含返回栏）+ 24rpx：顶部内容不许贴着导航栏
            paddingTop: `${bigNavBarHeightPx(true) + topGapPx()}px`,
            // 没有 Tab 栏，直接按底部安全高度收（≥48rpx 且避开 Home 指示条）
            paddingBottom: `${bottomSafePx()}px`
          }}
        >
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

          {/* 今日统计跟着内容滚（以前钉在屏幕底部，会占掉一屏的留白） */}
          <View style={styles.todayBar}>
            {/*
              2026-10 改口径：把「背了多少词」放在最前面，和翻书页那颗
              「今日已背 N 个词」是同一个数字（storage 的 todayWords，**点过标记或「我会了」**的词，
              去重）—— 同一个词在两个页面上必须是同一个意思。
              后面两项是另两个口径，写清量词免得混：标记是**次数**（同一个词点三下算三下），
              翻页数说的是翻书页翻了几页。
            */}
            <Text style={styles.todayText}>
              今日：背了 {today.wordCount} 个词 · 标记 {today.markCount} 次 · 翻 {today.pageCount} 页
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* 大标题 + 返回（2026-10 起这一页是第二层：主界面 → 这里）。
          自定义导航栏没有系统返回按钮，所以返回箭头必须自己画，见 nav-bar.tsx */}
      <NavBar title="选择词书" big back />
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
