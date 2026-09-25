import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { MarkBadge } from '../../components/mark-circle'
import { NavBar } from '../../components/nav-bar'
import { TabBar } from '../../components/tab-bar'
import { getVocabWords, removeVocabWord, VocabWord } from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, STYLE } from '../../theme'

/**
 * 生词本：翻书页标记过的词，按标记次数从多到少排。
 * 和翻书页一样不画分割线，靠留白分行。
 * 底部 Tab 栏和翻书页共用一个组件，切「翻书」会回到刚翻的那本书那一档。
 */
export default function VocabScreen() {
  const [words, setWords] = useState<VocabWord[]>(() => getVocabWords())

  // 翻书页上刚标完就切过来，要重新读一次
  useDidShow(() => {
    setWords(getVocabWords())
  })

  const handleRemove = (word: string) => {
    removeVocabWord(word)
    setWords(getVocabWords())
  }

  const total = words.length

  return (
    <View style={STYLE.container}>
      <NavBar title="生词本" back />

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>{total > 0 ? `你有 ${total} 个生词` : '你还没有生词'}</Text>
      </View>

      {total === 0 ? (
        <View style={STYLE.empty}>
          <Text style={STYLE.emptyText}>
            在翻书页看到不会的词，点右边圆圈标记它，它会出现在这里。
          </Text>
        </View>
      ) : (
        <ScrollView scrollY style={STYLE.list}>
          {words.map((item) => {
            const meta = [item.phonetic, item.pos].filter(Boolean).join('  ')
            return (
              <View key={item.word} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.word}>{item.word}</Text>
                  {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                  <Text style={styles.definition}>{item.definition}</Text>
                </View>

                <View style={styles.rowRight}>
                  <MarkBadge markCount={item.markCount} />
                  <View style={styles.removeLink} onClick={() => handleRemove(item.word)}>
                    <Text style={styles.removeLinkText}>移除</Text>
                  </View>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}

      <TabBar active="vocab" />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  statsBar: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '16rpx',
    paddingBottom: '8rpx'
  },
  statsText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  // 无分割线，靠上下留白分行
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '32rpx',
    paddingBottom: '32rpx'
  },
  rowText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  word: {
    fontSize: FONT.word,
    fontWeight: '700',
    color: COLOR.text
  },
  meta: {
    marginTop: '10rpx',
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  definition: {
    marginTop: '10rpx',
    fontSize: FONT.definition,
    color: COLOR.secondary
  },
  rowRight: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: '16rpx'
  },
  // 红色文字链接，不带背景不带边框
  removeLink: {
    marginLeft: '24rpx',
    paddingTop: '8rpx',
    paddingBottom: '8rpx'
  },
  removeLinkText: {
    fontSize: FONT.meta,
    color: COLOR.danger
  }
}
