import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow, useRouter, useUnload } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { CardDeck } from '../../components/card-deck'
import { MarkCircle } from '../../components/mark-circle'
import { MasterPill } from '../../components/master-pill'
import { NavBar } from '../../components/nav-bar'
import { PagerBar, pagerBarHeightPx } from '../../components/pager-bar'
import { SpeakBtn } from '../../components/speak-btn'
import { TabBar } from '../../components/tab-bar'
import { exampleOf, exampleSourceLabel, LevelKey, levelLabel, PAGE_SIZE, Word, wordsOfLevel } from '../../data/words'
import { bookTitle, bookWords } from '../../store/books'
import { stopSpeak } from '../../services/tts'
import {
  decrementMark,
  dailyQuota,
  getMastered,
  getReaderMode,
  getTodayWords,
  getProgress,
  incrementMark,
  incrementTodayMarkCount,
  incrementTodayPageCount,
  loadTodayCounts,
  masterWord,
  reviewKnown,
  setCurrentPage,
  setLastReader,
  setReaderMode,
  unmasterWord,
  untouchTodayWord
} from '../../store/storage'
import { COLOR, FONT, FONT_STACK, PAGE_PAD, STYLE } from '../../theme'
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
 *   The environmental cost of the project…  ← 24rpx / #3A3A3C（例句，R9）
 *   这个项目的环境代价……   AI 生成例句，仅供参考  ← 22rpx / #6E6E73
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
/**
 * 今天这一批词（进入背单词界面时只取这一批，不再把整档 1824 个词一次性拉出来）。
 *
 * 取词口径见下面 loadBatch 的注释：**只要从没背过的新词**。
 */
/**
 * 今天这一批词：**只挑还没背过的新词**（用户 2026-10-22 定的口径）。
 *
 * 「背过」= 三种都算：已掌握 / 今天碰过 / 被标记过（progress > 0）。
 * 所以「计划 40 个」= 从没学过的词里按词表顺序取 40 个，不会掺进前几天标记过的旧词。
 * 标记过但还没掌握的旧词走「生词本 / 复习」，两条线不抢额度。
 *
 * 剩下第一个词就是该背的位置 —— 不读上次存的页码，池子自己会往前走。
 */
function loadBatch(bookId: string, level: LevelKey, limit: number): Word[] {
  if (limit <= 0) return []
  const mastered = getMastered()
  const today = getTodayWords()
  const progress = getProgress()
  const all = wordsOfLevel(bookWords(bookId), level).filter(
    (w) => !mastered[w.word] && !today[w.word] && !((progress[w.word] ?? 0) > 0)
  )
  return all.slice(0, limit)
}

export default function ReaderScreen() {
  const { params } = useRouter()
  const bookId = params.bookId || ''
  const level = (params.level || 'all') as LevelKey
  const pageKey = `${bookId}:${level}`

  /**
   * 今天要背的量（计划优先）。只算一次：这一页活着的时候就按这个量走，
   * 中途改了计划要重进页面才生效 —— 免得背到一半列表突然变长变短。
   */
  const [quota] = useState<number>(() => dailyQuota())
  /**
   * 进页面一次给多少 —— **不限量**（2026-11 用户要求「每天可以背无限个」）。
   *
   * 原来是「配额 − 今日已背」：配额用完后再进页面就是 0 个词，翻书页直接变成死路。
   * 现在一律给满一批，今天能背多少只看词库里还剩多少没碰过的词。
   */
  const [remainingAtMount] = useState<number>(() => quota)
  /** 今天这一批词：每次给满一批（不限量） */
  const [list, setList] = useState<Word[]>(() => loadBatch(bookId, level, remainingAtMount))
  /** 这一档的词已经全部掌握（「再背一批」也取不到词了） */
  const [allDone, setAllDone] = useState(false)
  /**
   * 第几批（0 = 今天进来时那一批）。只做一件事：当 key 传给 <CardDeck>，
   * 换批时强制重新挂载 —— 卡片组件内部的「第几张 / 有没有作答」必须跟着清零，
   * 否则「再背 34 个」之后会停在上一批的位置上。
   */
  const [batch, setBatch] = useState(0)
  /** 词库里还有没有没背过的词（完成面板里决定要不要显示「再背 N 个」） */
  const [hasMore, setHasMore] = useState<boolean>(() => loadBatch(bookId, level, 1).length > 0)
  const totalPages = Math.ceil(list.length / PAGE_SIZE)

  /**
   * 页码从 0 开始，不再读上次存的页码：
   * 一批词就是「今天还没碰过的前 N 个」，第 0 页天然就是上次停下的地方（见 loadBatch 的注释）。
   */
  const [page, setPage] = useState<number>(0)

  /**
   * 翻书页的「抖一下」（2026-10-22）：点圆圈（不认识）/ 我会了（认识）时，
   * 这一条词轻轻抖一下再展开释义 —— 和卡片版同一套 keyframes（app.css 第 6 节）。
   */
  const [nudge, setNudge] = useState<{ w: string; k: 'yes' | 'no' } | null>(null)
  const nudgeWord = (w: string, k: 'yes' | 'no') => {
    setNudge({ w, k })
    setTimeout(() => setNudge((cur) => (cur && cur.w === w ? null : cur)), 340)
  }

  /**
   * 是不是已经用过「再背 N 个」了（用户 2026-10-22 定的口径）：
   * 计划背完之后**只给一次加背的机会**，那一批背完就是「今天超额完成」，
   * 不再无限往后加 —— 不然永远看不到「背完了」这个头。
   */
  const [bonus, setBonus] = useState<boolean>(() => loadTodayCounts().wordCount > dailyQuota())

  /**
   * 「重刷本档」：档位背完之后唯一不能有的结局就是死路。
   * 这一档的词**全部**重新过一遍（不管标没标过、掌没掌握）——
   * 复习不占任何额度，纯粹是再来一遍；按钮永远在，随时能按。
   */
  const startReplay = () => {
    const all = wordsOfLevel(bookWords(bookId), level)
    if (!all.length) return
    setAllDone(false)
    setBonus(true)
    setList(all.slice(0, quota))
    setPage(0)
    setBatch((b) => b + 1)
    setHasMore(all.length > quota)
  }

  /** 今天的份额背完后，再要一批（还是先排除今天碰过的词） */
  const loadMore = () => {
    setBonus(true)
    const next = loadBatch(bookId, level, quota)
    // 「再背 N 个」也可能一个都取不到（这一档背完了）——那是另一句话，不是空白屏
    setHasMore(loadBatch(bookId, level, 1).length > 0)
    if (next.length === 0) {
      setAllDone(true)
      return
    }
    setAllDone(false)
    setList(next)
    setPage(0)
    setBatch((b) => b + 1)
  }

  /**
   * 完成面板里的「今天到这，明天见」：退回上一页（从档次页进来就回档次页）。
   * navigateBack 在没有上一页时会失败（比如从分享卡片直接进来），
   * 那就退到主界面 —— 不能让按钮点了没动静。
   */
  const leaveReader = () => {
    Taro.navigateBack({ delta: 1 }).catch(() => {
      Taro.redirectTo({ url: '/pages/home/index' })
    })
  }
  const [progress, setProgress] = useState<Record<string, number>>(() => getProgress())
  const [mastered, setMastered] = useState<Record<string, number>>(() => getMastered())

  // 今天背了多少个词 = 今天**动过手**的词数（点过七级标记或点过「我会了」，去重）。
  // 计数写在 storage 里（incrementMark / masterWord），这一页只是把它显示出来。
  const [todayCount, setTodayCount] = useState<number>(() => loadTodayCounts().wordCount)
  /** 每日目标（卡片版式顶部「今日 50 / 34」用；和首页同一个口径 getDailyGoal()） */
  const todayTarget = quota

  // 本次进来刚点开释义的词。只活在这一次页面里：标记/掌握状态本身是持久化的，
  // 这里只兜住「点开了又减回 0 / 撤回掌握」的情况，免得释义当着用户的面缩回去。
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  /**
   * 标记已经满 7 次的词（本次会话内）。
   *
   * 2026-10 之前这里弹的是 Toast「这个词已经标到 7 次了」并**直接 return**——
   * 于是用户连点几下没反应、释义也不展开，看起来像卡死（评审里被点名的就是这处）。
   * 现在改成**就地提示**：释义照常展开，词条下面多一行小字说清发生了什么、还能怎么减。
   */
  const [capped, setCapped] = useState<Record<string, boolean>>({})

  /**
   * 版式：'page' = 老的一页 10 个词（默认，老用户打开还是原来那样），
   * 'card' = 一屏一张卡（2026-11 用户新增）。
   *
   * 切换用「先淡出 170ms → 换内容 → 淡回」的节奏，没有整屏跳变：
   * 用户按的是顶栏那颗胶囊，视线停在原地，内容像换了口气。
   */
  const [mode, setMode] = useState<'page' | 'card'>(() => getReaderMode())
  const [fading, setFading] = useState(false)

  /** 切版式：淡出 → 换 → 存偏好 → 淡入（170ms 是「感觉得到但不拖沓」的值） */
  const switchMode = () => {
    if (fading) return
    setFading(true)
    setTimeout(() => {
      const next = mode === 'card' ? 'page' : 'card'
      setMode(next)
      setReaderMode(next)
      setFading(false)
    }, 170)
  }

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

  // 离开这一页就停掉发音：不然切到别的页面，上一个词还在念
  useUnload(() => stopSpeak())

  const turnPage = (next: number) => {
    if (next < 0 || next >= totalPages) return
    setPage(next)
    setCurrentPage(pageKey, next)
    incrementTodayPageCount()
  }

  const handleIncrement = (word: Word) => {
    nudgeWord(word.word, 'no')
    // 释义**先展开**再判断能不能加：标到 7 次加不上去，但用户显然是想看这个词，
    // 不能因为计数到顶就把它按回「先考你」的状态
    reveal(word.word)
    if (!incrementMark(word.word)) {
      setCapped((prev) => (prev[word.word] ? prev : { ...prev, [word.word]: true }))
      return
    }
    incrementTodayMarkCount()
    setProgress(getProgress())
    // 刚才那一下已经把词记进「今天背过的词」了（storage 里做的），把数字读回来
    setTodayCount(loadTodayCounts().wordCount)
  }

  /**
   * 档位 −1。撤到「没有标记、也没掌握」时，这个词今天其实没背过：
   * 把今日计数和历史一起退回去（`untouchTodayWord`），否则撤销之后
   * 首页的「今日 X / N」还多一个，用户会觉得数不对。
   */
  const handleDecrement = (word: Word) => {
    decrementMark(word.word)
    const p = getProgress()
    setProgress(p)
    if (!p[word.word] && !getMastered()[word.word]) {
      untouchTodayWord(word.word)
      setTodayCount(loadTodayCounts().wordCount)
    }
  }

  const handleMaster = (word: Word) => {
    nudgeWord(word.word, 'yes')
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

  /**
   * **卡片版式的「认识」= 等级 −1**（2026-11 七级刻度，和复习页同一套）。
   *
   * 和翻书页那颗「我会了」药丸故意不一样：药丸是一次性动作（长按可撤回），
   * 表达「这个词我确实会了」；卡片版式是复习口径，答对只是把等级往下磨一级，
   * 磨到 0 级才算掌握、才移出生词本。
   */
  const handleKnownInDeck = (word: Word) => {
    nudgeWord(word.word, 'yes')
    reviewKnown(word.word)
    setMastered(getMastered())
    setProgress(getProgress())
    setTodayCount(loadTodayCounts().wordCount)
    reveal(word.word)
  }

  /**
   * 卡片版的撤销用：只撤回掌握，不弹 toast —— 卡片里自己有一行「已撤销 · 重新选」，
   * 再来一个系统 toast 就是两套反馈打架。
   */
  const handleUnmasterQuiet = (word: Word) => {
    unmasterWord(word.word)
    setMastered(getMastered())
    if (!getProgress()[word.word]) {
      untouchTodayWord(word.word)
      setTodayCount(loadTodayCounts().wordCount)
    }
  }

  const handleUnmaster = (word: Word) => {
    unmasterWord(word.word)
    setMastered(getMastered())
    // 短提示：这个词还留在屏幕上、药丸自己变回「我会了」，所以不需要解释一句长的
    Taro.showToast({ title: '已撤回', icon: 'none', duration: 1500 })
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
    // H5 / iOS 壳：卡片用 -36rpx 负外边距做「满屏出血」，微信里页面会自动裁掉
    // 溢出的那 36rpx，H5 不裁 —— 于是右边缘会多出一点点、把「认识」按钮切掉 4px。
    // 这里在 H5 下显式裁一次，表现和微信一致。
    <View
      style={
        process.env.TARO_ENV === 'h5' ? { ...STYLE.container, overflow: 'hidden' } : STYLE.container
      }
    >
      <PageCurtain label="背单词" kicker="STUDY SESSION" />
      {totalPages === 0 ? (
        /*
          空状态（2026-11 重做）：原来文字和按钮是**并排**的（STYLE.empty 是 row），
          一句话加一颗胶囊直接顶出屏幕 —— 用户截图里那个歪掉的就是它。
          现在改成**竖排居中的三行**：大 emoji（会慢慢浮）→ 标题 → 副标题 → 胶囊按钮，
          每一行都有明确的上下间距，永远不会再挤成一坨。
        */
        <View
          style={{
            ...STYLE.empty,
            flexDirection: 'column',
            paddingBottom: `${footerH + tabH}px`
          }}
        >
          <Text style={styles.emptyEmoji}>{allDone ? '§' : bonus ? '✓' : '·'}</Text>
          <Text style={styles.emptyTitle}>
            {allDone
              ? '这一档全背完了'
              : bonus
                ? '恭喜你今天超额完成！'
                : `今天的 ${quota} 个背完了`}
          </Text>
          <Text style={styles.emptySub}>
            {allDone
              ? '换一档继续，或者去生词本复习标记过的词'
              : bonus
                ? '不限量 —— 想接着背就再要一批'
                : '今天的目标达成了 · 想继续就再要一批'}
          </Text>
          {/* 不限量（2026-11 用户要求「每天可以背无限个」）：只要这一档还有没碰过的词，
              超额之后按钮照样在，不再收走 */}
          {allDone ? null : (
            <View hoverClass="press" style={styles.moreBtn} onClick={loadMore}>
              <Text style={styles.moreBtnText}>
                {bonus ? `继续背 ${quota} 个` : `再背 ${quota} 个`}
              </Text>
            </View>
          )}
        </View>
      ) : mode === 'card' ? (
        /* 卡片版式：一屏一张卡（2026-11）。顶部让出导航栏 + 胶囊按钮那一行 */
        <View
          style={{
            ...styles.cardWrap,
            paddingTop: `${navH + rpxToPx(4)}px`,
            paddingBottom: `${tabH + rpxToPx(24)}px`,
            opacity: fading ? 0 : 1,
            transition: 'opacity 170ms ease'
          }}
        >
          <CardDeck
            /* 换批（再背 N 个）时重新挂载：内部「第几张 / 作没作答」必须清零 */
            key={`${pageKey}-${batch}`}
            words={list}
            startIndex={page * PAGE_SIZE}
            mastered={mastered}
            todayCount={todayCount}
            todayTarget={todayTarget}
            onMaster={handleKnownInDeck}
            /* 不认识 = 翻书页那个圆圈 +1（进生词本复习），不新造数据口径 */
            onMark={handleIncrement}
            /* 档位显示 + 长按减一，读写的还是同一份 progress */
            progress={progress}
            onUnmark={handleDecrement}
            /* 撤销「认识」：把掌握撤回（点错一题的退路） */
            onUnmaster={handleUnmasterQuiet}
            /* 卡片版式走独立的位置：换算成「第几页」写进去，翻书版式下次打开就落在同一处 */
            onIndexChange={(i) => setCurrentPage(pageKey, Math.floor(i / PAGE_SIZE))}
            /* 这一批背完之后的完成面板（2026-11 用户要求：别再「点了没反应」） */
            /* 加背只给一次：用过之后 canMore 传 false，面板直接进「超额完成」 */
            canMore={hasMore}
            bonus={bonus}
            onReplay={startReplay}
            onSwitch={() => Taro.navigateTo({ url: `/pages/levels/index?bookId=${bookId}` })}
            moreCount={quota}
            onMore={loadMore}
            onExit={leaveReader}
          />
        </View>
      ) : (
        <ScrollView
          scrollY
          style={{ ...STYLE.list, opacity: fading ? 0 : 1, transition: 'opacity 170ms ease' }}
        >
          <View style={{ paddingTop: `${bodyTop}px`, paddingBottom: `${bodyBottom}px` }}>
            {visible.map((item) => {
              const markCount = progress[item.word] ?? 0
              const isMastered = Boolean(mastered[item.word])
              const meta = [item.phonetic, item.pos].filter(Boolean).join('  ')
              // 标过 / 会了 / 这次点开过 —— 满足一个就把释义露出来，否则留着考自己
              const showDefinition =
                markCount > 0 || isMastered || Boolean(revealed[item.word])
              // 例句查表（R9）：全局按单词查，查不到就是 null（上传的词表多半没有例句）
              const example = exampleOf(item.word)

              return (
                // 不画线、不做卡片，两个词之间只有 72rpx 的白。
                // （翻书页的条目**故意没做成玻璃卡片**：「备忘录打开一篇笔记」那种大片留白
                //  才是这一页的规格，卡片会把留白切碎。玻璃只在这页的悬浮件上——
                //  导航栏、上一页胶囊、我会了药丸、Tab 栏。）
                <View
                  key={item.word}
                  style={{
                    ...styles.entry,
                    animation:
                      nudge && nudge.w === item.word
                        ? nudge.k === 'yes'
                          ? 'cardNudgeYes 280ms cubic-bezier(.22,.61,.36,1)'
                          : 'cardNudgeNo 300ms cubic-bezier(.22,.61,.36,1)'
                        : undefined
                  }}
                >
                  {/* 词头一行：单词 + 发音按钮。
                      点这一行**只展开释义，不算标记**（用户想看一眼意思，不等于「这个我不会」）——
                      原来的释义只在「点过圆圈 / 点过我会了」之后才出现，等于逼用户先动手才能看词义。
                      发音按钮在右边固定位置（词再长也不会把它顶跑）。 */}
                  <View style={styles.headRow} onClick={() => reveal(item.word)}>
                    <Text style={{ ...styles.word, ...(isMastered ? styles.wordDone : null) }}>
                      {item.word}
                    </Text>
                    <SpeakBtn word={item.word} />
                  </View>
                  {meta ? <Text style={styles.phonetic}>{meta}</Text> : null}
                  {/* text-break：自传词表的释义可能是没有空格的长串，不许顶出屏幕（见 app.css） */}
                  {showDefinition ? (
                    <Text className="text-break" style={styles.definition}>
                      {item.definition}
                    </Text>
                  ) : null}

                  {/* 例句（R9）：跟在释义下面，**和释义同生共死**（也藏起来）——
                      释义都还没露出来就先看到例句，等于把答案提前给了。
                      字号比释义小一号（24rpx vs 28rpx），一行英文 + 一行中文 + 来源标注。
                      ⚠️ 来源必须标出来：AI 生成的一律写「AI 生成例句，仅供参考」（用户硬要求），
                      真题原句写「六级真题 · 出处」。没有例句的词（上传的词表）**不占位**。 */}
                  {showDefinition && example ? (
                    <View style={styles.example}>
                      <Text className="text-break" style={styles.exampleEn}>
                        {example.en}
                      </Text>
                      <View style={styles.exampleFoot}>
                        <Text className="text-break" style={styles.exampleZh}>
                          {example.zh}
                        </Text>
                        <Text style={styles.exampleFrom}>{exampleSourceLabel(example)}</Text>
                      </View>
                    </View>
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

                  {/* 标到顶了就当场说清楚（而不是弹一个 Toast 然后把点击吞掉） */}
                  {capped[item.word] ? (
                    <Text style={styles.capHint}>已标满 7 次 · 长按圆圈可以减一</Text>
                  ) : null}
                </View>
              )
            })}

            {/* 翻书版式的「本批背完了」出口（2026-11 不限量）：
                最后一页「下一页」会变灰，原来这里就是死路 —— 用户只能退出去再进来。
                现在最后一页底下直接给「再背 N 个」，超额之后按钮也一直在。 */}
            {!canNext ? (
              loadBatch(bookId, level, 1).length === 0 ? (
                <View style={{ alignItems: 'flex-start', paddingTop: '48rpx' }}>
                  <Text style={styles.emptySub}>这一档背完了 · 换一档，或者去生词本复习</Text>
                </View>
              ) : (
                <View
                  hoverClass="press"
                  style={{ ...styles.moreBtn, marginTop: '48rpx', alignSelf: 'flex-start' }}
                  onClick={loadMore}
                >
                  <Text style={styles.moreBtnText}>
                    {bonus ? `继续背 ${quota} 个` : `本批背完了 · 再背 ${quota} 个`}
                  </Text>
                </View>
              )
            ) : null}
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
      {mode === 'card' ? null : (
      <View
        className="glass glass-pill"
        style={{ ...styles.todayPill, top: `${navH + rpxToPx(12)}px` }}
      >
        <Text style={styles.todayLabel}>今日已背</Text>
        <Text style={styles.todayNumber}>{todayCount}</Text>
        <Text style={styles.todayLabel}>个词</Text>
      </View>
      )}

      {/*
        长按是「隐藏操作」：触屏上没有 hover，用户不会自己摸出「长按圆圈能减一」。
        所以这里给一句**静态提示**，和「今日已背」胶囊排在同一行（左边），
        不额外占高度 —— 这是评审里点名要补的一处（全站只有翻书页的长按没有提示）。
      */}
      {/* 顶栏左侧：版式胶囊（卡片 / 翻书）+ 只在翻书版式出现的长按提示 */}
      <View style={{ ...styles.topLeft, top: `${navH + rpxToPx(12)}px` }}>
        <View
          hoverClass="press"
          className="glass glass-pill"
          style={styles.modeBtn}
          onClick={switchMode}
        >
          <Text style={styles.modeBtnText}>{mode === 'card' ? '翻书' : '卡片'}</Text>
        </View>
        {mode === 'page' ? <Text style={styles.gestureHint}>点圆圈 +1 · 长按 −1</Text> : null}
      </View>

      {/* 底部悬浮：玻璃「上一页」+ 黑底「下一页」两个胶囊（组件在 components/pager-bar.tsx，
          翻书页和「熟练掌握词汇」用的是同一个）。压在 Tab 栏上面，词从它们底下滚过去 */}
      {totalPages === 0 || mode === 'card' ? null : (
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
    borderRadius: '6rpx'
  },
  todayLabel: {
    fontSize: '22rpx',
    lineHeight: '36rpx',
    color: COLOR.secondary
  },
  // 顶栏左侧那一组：版式胶囊 + 长按提示（同一行，垂直居中）
  topLeft: {
    position: 'absolute',
    left: PAGE_PAD,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  // 版式胶囊：和「今日已背」同一套玻璃、同样 56rpx 高，看起来是一对
  modeBtn: {
    height: '56rpx',
    paddingLeft: '24rpx',
    paddingRight: '24rpx',
    borderRadius: '6rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modeBtnText: {
    fontSize: FONT.pageNo,
    fontWeight: '600',
    color: COLOR.text
  },
  // ---------- 空状态（竖排三行 + 一颗胶囊）----------
  emptyEmoji: {
    width: '136rpx',
    height: '136rpx',
    borderRadius: '68rpx',
    backgroundColor: COLOR.accentSoft,
    fontFamily: FONT_STACK.serif,
    fontSize: '56rpx',
    lineHeight: '136rpx',
    textAlign: 'center',
    color: COLOR.warm,
    animation: 'floatY 3.2s ease-in-out infinite'
  },
  emptyTitle: {
    marginTop: '30rpx',
    fontSize: '40rpx',
    lineHeight: '54rpx',
    fontWeight: '700',
    letterSpacing: '2rpx',
    color: COLOR.text,
    textAlign: 'center'
  },
  emptySub: {
    marginTop: '12rpx',
    fontSize: FONT.pageNo,
    lineHeight: '36rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },
  // 空状态里的「再背 N 个」：描边胶囊，和主按钮区分开（它是个补充动作，不是主路径）
  // 死路保险：档位背完永远有两条路可走
  exitRow: {
    marginTop: '34rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  replayBtn: {
    height: '96rpx',
    paddingLeft: '40rpx',
    paddingRight: '40rpx',
    borderRadius: '0rpx 48rpx 0rpx 48rpx',
    backgroundColor: COLOR.onGround,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  replayBtnText: {
    fontSize: '28rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: COLOR.teal
  },
  switchBtn: {
    marginLeft: '18rpx',
    height: '96rpx',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    display: 'flex',
    alignItems: 'center'
  },
  switchBtnText: {
    fontSize: '26rpx',
    letterSpacing: '1rpx',
    color: COLOR.onGround,
    textDecorationLine: 'underline'
  },
  moreBtn: {
    marginTop: '44rpx',
    height: '100rpx',
    paddingLeft: '52rpx',
    paddingRight: '52rpx',
    borderRadius: '50rpx',
    backgroundColor: COLOR.ink,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 12rpx 28rpx rgba(60, 44, 24, 0.18)'
  },
  moreBtnText: {
    fontSize: '28rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: COLOR.onDark
  },
  // 卡片版式的容器：撑满导航栏与 Tab 栏之间，内容自己排
  cardWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start'
  },
  // 长按提示：和「今日已背」胶囊同一行的左边（高度 56rpx = 胶囊高度，垂直居中）
  gestureHint: {
    marginLeft: '16rpx',
    height: '56rpx',
    display: 'flex',
    alignItems: 'center',
    fontSize: FONT.pageNo,
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
    paddingBottom: '40rpx',
    borderBottom: `1rpx solid ${COLOR.line}`
  },
  word: {
    flex: 1,
    fontFamily: FONT_STACK.serif,
    fontSize: '56rpx',
    lineHeight: '68rpx',
    fontWeight: '400',
    letterSpacing: '-1rpx',
    color: COLOR.text
  },
  // 单词 + 发音按钮一行：单词占满剩余宽度，发音按钮固定在右边
  headRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  // 标满 7 次的就地提示（不是 Toast：这句话要说清「发生了什么 + 还能怎么操作」）
  capHint: {
    marginTop: '12rpx',
    fontSize: FONT.pageNo,
    lineHeight: '30rpx',
    color: COLOR.secondary
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
    fontSize: '30rpx',
    lineHeight: '42rpx',
    fontWeight: '500',
    color: COLOR.text,
    textAlign: 'left'
  },

  // ---------- 例句 ----------
  example: {
    marginTop: '20rpx',
    paddingLeft: '20rpx',
    borderLeft: `4rpx solid ${COLOR.warm}`,
    display: 'flex',
    flexDirection: 'column'
  },
  // 英文例句：24rpx（释义 28rpx 的「小一号」），行高给足，长句折行也不挤
  exampleEn: {
    fontSize: FONT.meta,
    lineHeight: '38rpx',
    color: COLOR.body
  },
  // 中文翻译 + 来源标注同一行：翻译占满，来源靠右（放不下就让它自己折行，不硬挤）
  exampleFoot: {
    marginTop: '6rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap'
  },
  exampleZh: {
    flex: 1,
    minWidth: '60%',
    fontSize: FONT.pageNo,
    lineHeight: '34rpx',
    color: COLOR.secondary
  },
  // 来源标注：22rpx 次要色（白底 5.07:1，达标）。AI 生成的那句必须原样出现
  exampleFrom: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    lineHeight: '34rpx',
    color: COLOR.secondary
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
