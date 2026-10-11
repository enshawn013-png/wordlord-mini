import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { MarkCircle } from '../../components/mark-circle'
import { MasterPill } from '../../components/master-pill'
import { NavBar } from '../../components/nav-bar'
import { PagerBar, pagerBarHeightPx } from '../../components/pager-bar'
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
  loadTodayCounts,
  masterWord,
  setCurrentPage,
  setLastReader,
  unmasterWord
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, STYLE } from '../../theme'
import { navBarHeightPx, rpxToPx, tabBarHeightPx } from '../../utils/metrics'

/**
 * 第三层：翻书页。
 *
 * 按用户 2026-09-26 给的规格做「备忘录打开一篇笔记」那种感觉：字大、留白多、不挤。
 * 每条词从上到下四行，一条就是一块：
 *
 *   environmental                          ← 40rpx / 600 / #1D1D1F
 *   /inˌvaiərənˈmentəl/  adj.              ← 24rpx / #86868B，margin-top 8rpx
 *                        周围的；环境的      ← 28rpx / #3A3A3C，margin-top 12rpx，右对齐
 *   (③) [我会了]                            ← margin-top 24rpx，靠左
 *
 * 条目左右 32rpx、上下各 36rpx —— 所以两个词之间是 72rpx 的白。
 * **不画分割线、不画边框**，全靠留白区分。
 *
 * 2026-09-28：翻书改成「先考你」——释义默认藏着，点圆圈 +1 或点「我会了」才露出来。
 * 露出条件 = 这个词标记过（markCount > 0）或已掌握或本次进来刚点开过，三者取或。
 * 前两个来自持久化的 progress/mastered，所以「之前标过 / 之前学过」的词翻到就直接显示，
 * 不需要额外存什么。第三个是本次会话的补丁，管两种情况：标记被长按减回 0、掌握被撤回。
 *
 * 2026-10：点「我会了」不再弹提示，而且**词在生词本里时会顺便把七级标记清零**
 * （masterWord 里做的，和生词本页一致）。清零后圆圈当场归 0，释义仍然留着——
 * 这一屏的列表是进页面时算好的，本来就不打算让行在眼前消失（下次进来它就不在列表里了）。
 *
 * 一条约 286rpx，一屏看得见 4 个词左右：这是刻意的，
 * 内容包在 ScrollView 里上下滑，「上一页 / 下一页」胶囊按钮固定在底部翻另外 10 个词。
 *
 * ⚠️ **2026-09-28 起「固定」是字面意义的浮在上面**：导航栏、「上一页 / 下一页」、
 * Tab 栏都是玻璃（app.css 的 .glass*），用 STYLE.topBar / bottomBar 绝对定位压在
 * 滚动区上，词从它们底下滚过去才有毛玻璃。所以正文外面包了一层 View，
 * 上下留出 bodyTop / bodyBottom 的内边距（高度见 utils/metrics.ts）——
 * 改这里的高度记得同步，不然会出现「第一个词被标题压住」或「最后一句永远露不出来」。
 * 条目本身**没有**做成玻璃卡片：这页要的是备忘录那种大片留白，卡片会把留白切碎。
 * 定义/单词都不再封行数——释义独占一行、宽度有 670rpx（约 24 字），
 * 九成释义一行就放得下，放不下自然地折第二行。
 *
 * 2026-10 又加了一件悬浮件：导航栏正下方那颗「今日已背 N 个词」胶囊（用户要的
 * 「醒目但不能张扬」；口径是**今天点过标记或点过我会了的词，去重**）。它多占了 80rpx，
 * 所以内容的上内边距从 navH 变成 bodyTop。
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

  // 今天背了多少个词 = 今天**动过手**的词数（点过七级标记或点过「我会了」，去重）。
  // 计数写在 storage 里（incrementMark / masterWord），这一页只是把它显示出来。
  const [todayCount, setTodayCount] = useState<number>(() => loadTodayCounts().wordCount)

  // 本次进来刚点开释义的词。只活在这一次页面里：标记/掌握状态本身是持久化的，
  // 这里只兜住「点开了又减回 0 / 撤回掌握」的情况，免得释义当着用户的面缩回去。
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  // 当前这一页的 10 个词
  const visible = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  /** 点开过释义的词记一笔（只活在一次页面里，见上面的说明） */
  const reveal = (word: string) => {
    setRevealed((prev) => (prev[word] ? prev : { ...prev, [word]: true }))
  }

  // 记下「最后翻的是哪本书哪一档」，从生词本切回「翻书」时要用
  useEffect(() => {
    setLastReader(bookId, level)
  }, [bookId, level])

  // 从生词本返回时，可能刚移除过标记，重新读一次
  useDidShow(() => {
    setProgress(getProgress())
    setMastered(getMastered())
    // 在别的页面（全部生词 / 复习页 / 档位抽查）动手也会算进今天；
    // 后台放了一夜再回来（跨过零点）这里还会读到清零后的数字
    setTodayCount(loadTodayCounts().wordCount)
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
    // 刚才那一下已经把词记进「今天背过的词」了（storage 里做的），把数字读回来
    setTodayCount(loadTodayCounts().wordCount)
    reveal(word.word)
  }

  const handleDecrement = (word: Word) => {
    decrementMark(word.word)
    setProgress(getProgress())
  }

  const handleMaster = (word: Word) => {
    // 2026-10 用户要求：点「我会了」**不再弹**屏幕中间那行「已掌握，长按绿色按钮可以撤回」。
    // 撤回入口还是长按绿色药丸（提示语挪到「熟练掌握词汇」页的说明文字里，静态的，不弹）。
    //
    // masterWord() 顺手干两件事：把这个词的七级标记清零（词在生词本里的话），
    // 以及把它记进「今天背过的词」—— 所以这里要读回 progress 和今日数字。
    masterWord(word.word)
    setMastered(getMastered())
    setProgress(getProgress())
    setTodayCount(loadTodayCounts().wordCount)
    reveal(word.word)
  }

  const handleUnmaster = (word: Word) => {
    unmasterWord(word.word)
    setMastered(getMastered())
    Taro.showToast({ title: '已撤回，这个词回到翻书列表', icon: 'none', duration: 2000 })
  }

  const navTitle = `${bookTitle(bookId)} · ${levelLabel(level)}`
  const canPrev = page > 0
  const canNext = page < totalPages - 1

  // 悬浮元素的高度：导航栏、「今日已背」胶囊、底部胶囊块、Tab 栏。内容上下各留出这么多，
  // 词才会从它们底下滚过去——玻璃要糊到东西才叫毛玻璃。
  //
  // 安全区：第一个词到「今日已背」胶囊的距离 = 12rpx（胶囊下方的缝）+ 36rpx（条目自己的
  // paddingTop）= 48rpx，比用户要求的 24rpx 宽；底部胶囊下方有 48rpx，再往下还有一整个
  // Tab 栏，而 Tab 栏自己垫了 max(48rpx, Home 指示条) 的安全区，所以按钮离屏幕底远大于 48rpx。
  const navH = navBarHeightPx()
  const tabH = tabBarHeightPx()
  const footerH = pagerBarHeightPx()
  const bodyBottom = footerH + tabH

  // 「今日已背」那颗胶囊：钉在导航栏正下方、靠右。高度 = 10 + 36 + 10 = 56rpx，
  // 上下各留 12rpx 的呼吸缝 —— 滚动内容要垫出这 80rpx，否则第一个词会被它压住。
  const todayPillH = 56
  const bodyTop = navH + rpxToPx(todayPillH + 24)

  return (
    <View style={STYLE.container}>
      {totalPages === 0 ? (
        // 空状态不进滚动区：靠 STYLE.empty 的 flex:1 在整屏里居中
        <View style={{ ...STYLE.empty, paddingBottom: `${footerH + tabH}px` }}>
          <Text style={STYLE.emptyText}>
            这一档的词都点过「我会了」，换一档继续；也可以去生词本复习标记过的词。
          </Text>
        </View>
      ) : (
        <ScrollView scrollY style={STYLE.list}>
          <View style={{ paddingTop: `${bodyTop}px`, paddingBottom: `${bodyBottom}px` }}>
            {visible.map((item) => {
              const markCount = progress[item.word] ?? 0
              const isMastered = Boolean(mastered[item.word])
              const meta = [item.phonetic, item.pos].filter(Boolean).join('  ')
              // 标过 / 会了 / 这次点开过 —— 满足一个就把释义露出来，否则留着考自己
              const showDefinition =
                markCount > 0 || isMastered || Boolean(revealed[item.word])

              return (
                // 不画线、不做卡片，两个词之间只有 72rpx 的白。
                // （翻书页的条目**故意没做成玻璃卡片**：「备忘录打开一篇笔记」那种大片留白
                //  才是这一页的规格，卡片会把留白切碎。玻璃只在这页的悬浮件上——
                //  导航栏、上一页胶囊、我会了药丸、Tab 栏。）
                <View key={item.word} style={styles.entry}>
                  <Text style={{ ...styles.word, ...(isMastered ? styles.wordDone : null) }}>
                    {item.word}
                  </Text>
                  {meta ? <Text style={styles.phonetic}>{meta}</Text> : null}
                  {/* text-break：自传词表的释义可能是没有空格的长串，不许顶出屏幕（见 app.css） */}
                  {showDefinition ? (
                    <Text className="text-break" style={styles.definition}>
                      {item.definition}
                    </Text>
                  ) : null}

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
          </View>
        </ScrollView>
      )}

      {/*
        「今日已背 N 个词」：钉在导航栏正下方靠右，玻璃胶囊。
        用户要的是「醒目但不能张扬」——所以它是悬浮的一小颗（永远看得见），
        但只有一个数字是加粗的黑色，其余是灰字，没有颜色、没有图标、不能点。

        口径（用户 2026-10 明确）：**今天点过七级标记、或者点过「我会了」的词**，
        去重后有多少个。不是「翻到过多少词」——翻页不计数。
        计数由 storage 的 incrementMark / masterWord 写，跨过本地零点自己清零。
      */}
      <View
        className="glass glass-pill"
        style={{ ...styles.todayPill, top: `${navH + rpxToPx(12)}px` }}
      >
        <Text style={styles.todayLabel}>今日已背</Text>
        <Text style={styles.todayNumber}>{todayCount}</Text>
        <Text style={styles.todayLabel}>个词</Text>
      </View>

      {/* 底部悬浮：玻璃「上一页」+ 黑底「下一页」两个胶囊（组件在 components/pager-bar.tsx，
          翻书页和「熟练掌握词汇」用的是同一个）。压在 Tab 栏上面，词从它们底下滚过去 */}
      {totalPages === 0 ? null : (
        <PagerBar
          canPrev={canPrev}
          canNext={canNext}
          onPrev={() => turnPage(page - 1)}
          onNext={() => turnPage(page + 1)}
        />
      )}

      {/* 导航栏和 Tab 栏都是玻璃，浮在内容上面 */}
      <NavBar title={navTitle} back />
      <TabBar active="reader" />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 「今日已背」胶囊：定位是 absolute（浮在滚动内容上），top 由行内算好（导航栏高度 + 12rpx）
  todayPill: {
    position: 'absolute',
    right: PAGE_PAD,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: '24rpx',
    paddingRight: '24rpx',
    paddingTop: '10rpx',
    paddingBottom: '10rpx',
    borderRadius: '28rpx'
  },
  todayLabel: {
    fontSize: '22rpx',
    lineHeight: '36rpx',
    color: COLOR.secondary
  },
  // 只有这个数字是「醒目」的部分：30rpx / 700 / 主文字色
  todayNumber: {
    marginLeft: '8rpx',
    marginRight: '4rpx',
    fontSize: '30rpx',
    lineHeight: '36rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  // 上下各 36rpx：两条词之间就是 72rpx 的白
  //
  // display/flexDirection 这两个不能省：微信的 <text> 默认是 display:inline，
  // 不把 entry 变成 flex 容器的话，单词/音标/释义三个 Text 会挤在同一行，
  // 而且 margin-top 对 inline 盒子完全无效。（flex 子项一律 blockify，这是最省事的解法。）
  entry: {
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '36rpx',
    paddingBottom: '36rpx'
  },
  word: {
    fontSize: FONT.wordLg,
    lineHeight: '52rpx',
    fontWeight: '600',
    color: COLOR.text
  },
  // 已掌握的词压暗，一眼能看出哪些点过。
  // 单词是 40rpx 大字（大字只需 ≥3:1），所以这里用比 secondary 更浅的 wordDone（3.26:1）——
  // 既保住「压暗」的语义，也不至于浅到读不出来。
  wordDone: {
    color: COLOR.wordDone
  },
  phonetic: {
    marginTop: '8rpx',
    fontSize: FONT.meta,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  definition: {
    marginTop: '12rpx',
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

  // 底部「上一页 / 下一页」那两个胶囊的样式搬去了 components/pager-bar.tsx
  // （生词本要长一模一样，留着两份迟早漂）
}
