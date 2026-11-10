import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { ListRow } from '../../components/list-row'
import { PageHeader } from '../../components/page-header'
import { NavBar } from '../../components/nav-bar'
import { LEVELS, LevelKey, wordsOfLevel } from '../../data/words'
import { bookTitle, bookWords, summarize } from '../../store/books'
import { getMastered } from '../../store/storage'
import { COLOR, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, topGapPx } from '../../utils/metrics'

/**
 * 第二层：一本词书的四个档次。
 * 档次由 data/words.ts 的 bandOf 按词频切出来（阈值是构建期 k-means 算的，
 * 不写死），所以内置词书和上传的词书走的是同一把尺子。
 */
const styles: Record<string, CSSProperties> = {
  blocks: {
    marginTop: '20rpx',
    marginLeft: '36rpx',
    marginRight: '36rpx',
    marginBottom: '8rpx',
    display: 'flex',
    flexDirection: 'row'
  },
  blockYellow: {
    flex: 1,
    height: '172rpx',
    marginRight: '4rpx',
    paddingLeft: '24rpx',
    paddingTop: '18rpx',
    backgroundColor: COLOR.marigold,
    display: 'flex',
    flexDirection: 'column'
  },
  blockRed: {
    flex: 1,
    height: '172rpx',
    paddingLeft: '24rpx',
    paddingTop: '18rpx',
    backgroundColor: COLOR.warm,
    display: 'flex',
    flexDirection: 'column'
  },
  blockLabelDark: {
    fontSize: '18rpx',
    letterSpacing: '4rpx',
    color: 'rgba(23, 21, 15, 0.6)'
  },
  blockNumDark: {
    marginTop: '14rpx',
    fontSize: '80rpx',
    lineHeight: '84rpx',
    fontWeight: '800',
    letterSpacing: '-4rpx',
    color: COLOR.text
  },
  blockLabelLight: {
    fontSize: '18rpx',
    letterSpacing: '4rpx',
    color: 'rgba(255, 249, 240, 0.68)'
  },
  blockNumLight: {
    marginTop: '14rpx',
    fontSize: '80rpx',
    lineHeight: '84rpx',
    fontWeight: '800',
    letterSpacing: '-4rpx',
    color: '#FFF9F0'
  }
}

export default function LevelsScreen() {
  const { params } = useRouter()
  const bookId = params.bookId || ''

  const title = useMemo(() => bookTitle(bookId), [bookId])

  const rows = useMemo(() => {
    const words = bookWords(bookId)
    const mastered = getMastered()
    return LEVELS.map((lv) => {
      const band = wordsOfLevel(words, lv.key)
      const { total, remain } = summarize(band, mastered)
      return { key: lv.key as LevelKey, label: lv.label, total, remain }
    })
  }, [bookId])

  // 空词书（上传失败或刚被删掉）不该停在这一层。
  // 空状态不进 ScrollView：它靠 STYLE.empty 的 flex:1 在整屏里居中，进了滚动区就居中不了。
  if (!rows.some((r) => r.total > 0)) {
    return (
      <View style={STYLE.container}>
      <PageCurtain label="词汇档次" kicker="LEVELS" />
        <View style={STYLE.empty}>
          <Text style={STYLE.emptyText}>这本词表里没有词。</Text>
        </View>
        <NavBar title={title} back />
      </View>
    )
  }

  return (
    <View style={STYLE.container}>
      {/* 内容从导航栏底下穿过去（玻璃才糊得到东西），所以留出导航栏的高度 */}
      <ScrollView scrollY style={STYLE.list}>
        <View
          style={{
            // 导航栏高度 + 24rpx：顶部内容不许贴着导航栏；底部按安全高度收（这页没有 Tab 栏）
            paddingTop: `${navBarHeightPx() + topGapPx()}px`,
            paddingBottom: `${bottomSafePx()}px`
          }}
        >
          <PageHeader kicker="LEVELS" title="词汇档次" sub="三档分开背，也可以整本一起走" />

          {/* ---------- 整本概览：两块纯色填满版面 ---------- */}
          <View style={styles.blocks}>
            <View style={styles.blockYellow}>
              <Text style={styles.blockLabelDark}>整本</Text>
              <Text style={styles.blockNumDark}>{rows.reduce((n, r) => n + r.total, 0)}</Text>
            </View>
            <View style={styles.blockRed}>
              <Text style={styles.blockLabelLight}>还剩</Text>
              <Text style={styles.blockNumLight}>{rows.reduce((n, r) => n + r.remain, 0)}</Text>
            </View>
          </View>

{rows.map((row) => (
            <ListRow
              key={row.key}
              title={row.label}
              meta={
                row.total === 0 ? '这本词表里没有这一档的词' : `共 ${row.total} 词 · 还剩 ${row.remain} 词`
              }
              onOpen={() => {
                if (row.total === 0) return
                Taro.navigateTo({ url: `/pages/reader/index?bookId=${bookId}&level=${row.key}` })
              }}
            />
          ))}
        </View>
      </ScrollView>

      <NavBar title={title} back />
    </View>
  )
}
