import { useMemo } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { ListRow } from '../../components/list-row'
import { NavBar } from '../../components/nav-bar'
import { LEVELS, LevelKey, wordsOfLevel } from '../../data/words'
import { bookTitle, bookWords, summarize } from '../../store/books'
import { getMastered } from '../../store/storage'
import { STYLE } from '../../theme'

/**
 * 第二层：一本词书的四个档次。
 * 档次由 data/words.ts 的 bandOf 按词频切出来（阈值是构建期 k-means 算的，
 * 不写死），所以内置词书和上传的词书走的是同一把尺子。
 */
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

  // 空词书（上传失败或刚被删掉）不该停在这一层
  if (!rows.some((r) => r.total > 0)) {
    return (
      <View style={STYLE.container}>
        <NavBar title={title} back />
        <View style={STYLE.empty}>
          <Text style={STYLE.emptyText}>这本词表里没有词。</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={STYLE.container}>
      <NavBar title={title} back />

      <ScrollView scrollY style={STYLE.list}>
        {rows.map((row) => (
          <ListRow
            key={row.key}
            title={row.label}
            meta={row.total === 0 ? '这本词表里没有这一档的词' : `共 ${row.total} 词 · 还剩 ${row.remain} 词`}
            onOpen={() => {
              if (row.total === 0) return
              Taro.navigateTo({ url: `/pages/reader/index?bookId=${bookId}&level=${row.key}` })
            }}
          />
        ))}
      </ScrollView>
    </View>
  )
}
