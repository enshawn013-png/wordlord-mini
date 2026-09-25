import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { MarkCircle } from '../../components/mark-circle'
import { MasterPill } from '../../components/master-pill'
import { NavBar } from '../../components/nav-bar'
import { TabBar } from '../../components/tab-bar'
import { LevelKey, levelLabel, PAGE_SIZE, Word, wordsOfLevel } from '../../data/words'
import { bookTitle, bookWords } from '../../store/books'
import {
  decrementMark,
  getCurrentPage,
  getMastered,
  getProgress,
  incrementMark,
  incrementTodayMarkCount,
  incrementTodayPageCount,
  masterWord,
  setCurrentPage,
  setLastReader,
  unmasterWord
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, STYLE } from '../../theme'

/**
 * 第三层：翻书页。
 *
 * 按用户 2026-09-26 给的规格做「备忘录打开一篇笔记」那种感觉：字大、留白多、不挤。
 * 每条词从上到下四行，一条就是一块：
 *
 *   environmental                          ← 40rpx / 600 / #1D1D1F
 *   /inˌvaiərənˈmentəl/  adj.              ← 24rpx / #86868B，margin-top 8rpx
 *                        周围的；环境的      ← 28rpx / #3A3A3C，margin-top 16rpx，右对齐
 *   (③) [我会了]                            ← margin-top 24rpx，靠左
 *
 * 条目左右 32rpx、上下各 32rpx —— 所以两个词之间是 64rpx 的白。
 * **不画分割线、不画边框**，全靠留白区分。
 *
 * 一条约 278rpx，一屏看得见 4 个词左右：这是刻意的，
 * 内容包在 ScrollView 里上下滑，「上一页 / 下一页」胶囊按钮固定在底部翻另外 10 个词。
 * 定义/单词都不再封行数——释义独占一行、宽度有 670rpx（约 24 字），
 * 九成释义一行就放得下，放不下自然地折第二行。
 */

/** 进页面时取这一档还没掌握的词；掌握过的下次进来就不再出现 */
function loadList(bookId: string, level: LevelKey): Word[] {
  const mastered = getMastered()
  return wordsOfLevel(bookWords(bookId), level).filter((w) => !mastered[w.word])
}

export default function ReaderScreen() {
  const { params } = useRouter()
  const bookId = params.bookId || ''
  const level = (params.level || 'all') as LevelKey
  const pageKey = `${bookId}:${level}`

  const [list] = useState<Word[]>(() => loadList(bookId, level))
  const totalPages = Math.ceil(list.length / PAGE_SIZE)

  const [page, setPage] = useState<number>(() => {
    const saved = getCurrentPage(pageKey)
    const last = Math.max(totalPages - 1, 0)
    return Math.min(Math.max(saved, 0), last)
  })
  const [progress, setProgress] = useState<Record<string, number>>(() => getProgress())
  const [mastered, setMastered] = useState<Record<string, number>>(() => getMastered())

  // 记下「最后翻的是哪本书哪一档」，从生词本切回「翻书」时要用
  useEffect(() => {
    setLastReader(bookId, level)
  }, [bookId, level])

  // 从生词本返回时，可能刚移除过标记，重新读一次
  useDidShow(() => {
    setProgress(getProgress())
    setMastered(getMastered())
  })

  const turnPage = (next: number) => {
    if (next < 0 || next >= totalPages) return
    setPage(next)
    setCurrentPage(pageKey, next)
    incrementTodayPageCount()
  }

  const handleIncrement = (word: Word) => {
    if (!incrementMark(word.word)) {
      Taro.showToast({ title: '这个词已经标到 7 次了', icon: 'none' })
      return
    }
    incrementTodayMarkCount()
    setProgress(getProgress())
  }

  const handleDecrement = (word: Word) => {
    decrementMark(word.word)
    setProgress(getProgress())
  }

  const handleMaster = (word: Word) => {
    masterWord(word.word)
    setMastered(getMastered())
    Taro.showToast({ title: '已掌握，长按绿色按钮可以撤回', icon: 'none', duration: 2000 })
  }

  const handleUnmaster = (word: Word) => {
    unmasterWord(word.word)
    setMastered(getMastered())
    Taro.showToast({ title: '已撤回，这个词回到翻书列表', icon: 'none', duration: 2000 })
  }

  const navTitle = `${bookTitle(bookId)} · ${levelLabel(level)}`
  const canPrev = page > 0
  const canNext = page < totalPages - 1

  return (
    <View style={STYLE.container}>
      {/* 自绘的导航栏就是一块白底 View，本来就没有阴影 */}
      <NavBar title={navTitle} back />

      {totalPages === 0 ? (
        <View style={STYLE.empty}>
          <Text style={STYLE.emptyText}>
            这一档的词都点过「我会了」，换一档继续；也可以去生词本复习标记过的词。
          </Text>
        </View>
      ) : (
        <ScrollView scrollY style={STYLE.list}>
          {list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((item) => {
            const markCount = progress[item.word] ?? 0
            const isMastered = Boolean(mastered[item.word])
            const meta = [item.phonetic, item.pos].filter(Boolean).join('  ')

            return (
              // 不画线、不做卡片，两个词之间只有 96rpx 的白
              <View key={item.word} style={styles.entry}>
                <Text style={{ ...styles.word, ...(isMastered ? styles.wordDone : null) }}>
                  {item.word}
                </Text>
                {meta ? <Text style={styles.phonetic}>{meta}</Text> : null}
                <Text style={styles.definition}>{item.definition}</Text>

                {/* 圆圈 +「我会了」，靠左 */}
                <View style={styles.controls}>
                  <MarkCircle
                    markCount={markCount}
                    onIncrement={() => handleIncrement(item)}
                    onDecrement={() => handleDecrement(item)}
                  />
                  <MasterPill
                    mastered={isMastered}
                    onMaster={() => handleMaster(item)}
                    onUnmaster={() => handleUnmaster(item)}
                  />
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}

      {/* 底部固定：两个黑底白字胶囊按钮。不跟着内容滚 */}
      {totalPages === 0 ? null : (
        <View style={styles.footer}>
          <View
            style={{ ...styles.capsule, ...(canPrev ? null : STYLE.disabledBtn) }}
            onClick={() => turnPage(page - 1)}
          >
            <Text style={styles.capsuleText}>上一页</Text>
          </View>
          <View
            style={{
              ...styles.capsule,
              marginLeft: '24rpx',
              ...(canNext ? null : STYLE.disabledBtn)
            }}
            onClick={() => turnPage(page + 1)}
          >
            <Text style={styles.capsuleText}>下一页</Text>
          </View>
        </View>
      )}

      <TabBar active="reader" />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 上下各 32rpx：两条词之间就是 64rpx 的白
  //
  // display/flexDirection 这两个不能省：微信的 <text> 默认是 display:inline，
  // 不把 entry 变成 flex 容器的话，单词/音标/释义三个 Text 会挤在同一行，
  // 而且 margin-top 对 inline 盒子完全无效。（flex 子项一律 blockify，这是最省事的解法。）
  entry: {
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '32rpx',
    paddingBottom: '32rpx'
  },
  word: {
    fontSize: FONT.wordLg,
    lineHeight: '52rpx',
    fontWeight: '600',
    color: COLOR.text
  },
  // 已掌握的词压暗，一眼能看出哪些点过
  wordDone: {
    color: COLOR.secondary
  },
  phonetic: {
    marginTop: '8rpx',
    fontSize: FONT.meta,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  definition: {
    marginTop: '16rpx',
    fontSize: FONT.definition,
    lineHeight: '40rpx',
    color: COLOR.body,
    textAlign: 'right'
  },

  // 圆圈 +「我会了」，并排靠左
  controls: {
    marginTop: '24rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },

  footer: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '16rpx',
    paddingBottom: '16rpx'
  },
  // 胶囊：高 88rpx、左右各 48rpx、圆角半径取高度一半
  capsule: {
    height: '88rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: '48rpx',
    paddingRight: '48rpx',
    borderRadius: '44rpx',
    backgroundColor: COLOR.black
  },
  capsuleText: {
    fontSize: FONT.definition,
    color: COLOR.onDark
  }
}
