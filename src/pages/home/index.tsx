import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { BUILTIN_BOOK_ID, LevelKey, PAGE_SIZE, Word, wordsOfLevel } from '../../data/words'
import { bookWords } from '../../store/books'
import {
  getCurrentPage,
  getDailyGoal,
  getLastReader,
  getMastered,
  getPlanStatus,
  getStreak,
  loadTodayCounts,
  setDailyGoal
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, rpxToPx, statusBarHeightPx } from '../../utils/metrics'

/**
 * 主界面（启动页）。
 *
 * ## 这一页只留「要动手的事」
 *
 * 演进到 2026-10 第五版，用户的四次反馈把这一页磨成了现在这样：
 * 「好看大气」→「功能区」→「有点乱、极简」→「不够高级」→ **「数据单独弄成一个界面」**。
 * 所以统计类的东西（整体进度、7 天节奏、速度预测、累计）**全部搬去 `pages/stats`**，
 * 这一页只留四件事：
 *
 * | 留什么 | 为什么 |
 * | --- | --- |
 * | 单词君 | 封面唯一的身份，72rpx 是全页最大的字（下面那句标语用户要求删了，别再往这里加） |
 * | 下一个词（唯一的卡） | 主视觉：上次翻到的那一页的第一个词。释义故意不给（翻书页先考你） |
 * | 今日一行 | 今天背了多少 / 该背多少。**目标只有一个来源**：有计划听计划，没计划用每日目标 |
 * | 计划一行 | 计划的要求（剩几天 · 每天几个）；没定过就是一行入口 |
 * | 背单词 | 全页唯一重色块 |
 * | 三个入口 | 生词本 / 熟练掌握词汇 / **数据**（统计都进那一页看） |
 *
 * 排版纪律（和 `pages/stats` 同一套）：一屏不滚动 → 不需要导航栏、也不会出现重复标题；
 * 信息行共用「标签列 144rpx + 值列」；只有一条左对齐基准线；可点提示只用一个灰箭头。
 */

interface PlanSummary {
  daysLeft: number
  perDay: number
  /** 定过目标日期没有；按「每天数量」模式的计划是 false */
  hasDeadline: boolean
  finished: boolean
  expired: boolean
  bookMissing: boolean
}

interface HomeData {
  /** 上次翻到的那一页的第一个词；都翻完了是 null */
  word: Word | null
  hasLast: boolean
  readerUrl: string
  todayWords: number
  /**
   * 今天该背多少个。**只有一个真相，按优先级取**（用户 2026-10 指出「今日和计划冲突了」）：
   * 有计划 → 用计划算出来的每天量；没有计划 → 才用独立的每日目标（`dailyGoal`）。
   * 两者不会同时生效，也就不可能给出两个互相矛盾的数字。
   */
  todayTarget: number
  /** true = 这个目标来自计划（点「今日」那行应该去计划页改，而不是弹每日目标的 ActionSheet） */
  targetFromPlan: boolean
  streak: number
  plan: PlanSummary | null
}

function loadHomeData(): HomeData {
  const last = getLastReader()
  const bookId = last && last.bookId ? last.bookId : BUILTIN_BOOK_ID
  const level = ((last && last.level) || 'all') as LevelKey
  const mastered = getMastered()

  // 「下一个词」：本档未掌握的第 (当前页 × 10 + 1) 个词 —— 和翻书页进去看到的第一个词一致
  const list = wordsOfLevel(bookWords(bookId), level).filter((w) => !mastered[w.word])
  const pageKey = `${bookId}:${level}`
  const totalPages = Math.max(Math.ceil(list.length / PAGE_SIZE), 1)
  const page = Math.min(Math.max(getCurrentPage(pageKey), 0), totalPages - 1)

  const ps = getPlanStatus()
  // 「今天该背多少」只有一个来源：有计划听计划，没计划才用独立的每日目标
  const planPerDay = ps && !ps.finished && !ps.bookMissing ? ps.perDay : 0

  return {
    word: list[page * PAGE_SIZE] ?? null,
    hasLast: Boolean(last),
    readerUrl: `/pages/reader/index?bookId=${bookId}&level=${level}`,
    todayWords: loadTodayCounts().wordCount,
    todayTarget: planPerDay > 0 ? planPerDay : getDailyGoal(),
    targetFromPlan: planPerDay > 0,
    streak: getStreak(),
    plan: ps
      ? {
          daysLeft: ps.daysLeft,
          perDay: ps.perDay,
          hasDeadline: ps.hasDeadline,
          finished: ps.finished,
          expired: ps.expired,
          bookMissing: ps.bookMissing
        }
      : null
  }
}

/** 计划那一行的值（一句话，不铺开）。两种模式说法不一样，别都写「剩 N 天」 */
function planLine(p: PlanSummary): string {
  if (p.bookMissing) return '词书不在了'
  if (p.finished) return '已完成'
  if (p.expired) return '已过期'
  // 按「每天数量」模式的计划没有目标日期，说天数只会变成「剩 0 天」
  if (!p.hasDeadline) return `每天 ${p.perDay} 个`
  return `剩 ${p.daysLeft} 天 · 每天 ${p.perDay} 个`
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData>(loadHomeData)

  // 从别的页面回来就重算（都是真数据，回来就该是新的）
  useDidShow(() => setData(loadHomeData()))

  /** 主按钮：用户指定的去向 —— 进「最开始那个界面」（词书列表） */
  const openShelf = () => Taro.navigateTo({ url: '/pages/index/index' })
  /** 词卡：接着上次的位置直接开翻 */
  const openReader = () => Taro.navigateTo({ url: data.readerUrl })
  const openPlan = () => Taro.navigateTo({ url: '/pages/plan/index' })
  const openVocab = () => Taro.navigateTo({ url: '/pages/vocab/index' })
  const openMastered = () => Taro.navigateTo({ url: '/pages/mastered/index' })
  const openStats = () => Taro.navigateTo({ url: '/pages/stats/index' })

  /**
   * 改每日目标：系统 ActionSheet，界面里不占位置（行尾的 › 就是它的提示）。
   * ⚠️ 只有「没有计划」时才走这里 —— 有计划时每天的量由计划决定，
   * 改它要进计划页（否则又变成两个地方都能改「每天背多少」）。
   */
  const changeGoal = () => {
    const values = [10, 20, 30, 50]
    Taro.showActionSheet({ itemList: values.map((n) => `${n} 个词 / 天`) })
      .then((res) => {
        if (typeof res.tapIndex !== 'number') return
        setDailyGoal(values[res.tapIndex])
        setData(loadHomeData())
      })
      .catch(() => undefined) // 取消
  }

  const meta = data.word ? [data.word.phonetic, data.word.pos].filter(Boolean).join('  ') : ''
  const top = statusBarHeightPx() + rpxToPx(64)
  const bottom = bottomSafePx() + rpxToPx(24)

  return (
    <View style={STYLE.container}>
      <View style={{ ...styles.page, paddingTop: `${top}px`, paddingBottom: `${bottom}px` }}>
        {/* ---------- ① 身份：只有一个名字 ---------- */}
        <Text style={styles.brand}>单词君</Text>

        {/* ---------- ② 主视觉：下一个词（唯一的卡，纯排版） ---------- */}
        <View {...PRESS} className="glass glass-card" style={styles.wordCard} onClick={openReader}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>{data.hasLast ? '上次翻到这儿' : '开始第一个词'}</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
          {data.word ? (
            <>
              {/* text-break：自传词表里可能有很长的词，不许顶出卡片 */}
              <Text className="text-break" style={styles.word}>
                {data.word.word}
              </Text>
              {meta ? <Text style={styles.phonetic}>{meta}</Text> : null}
            </>
          ) : (
            <Text style={styles.wordEmpty}>这一档都翻完了</Text>
          )}
        </View>

        {/* ---------- ③ 今天要动手的两件事 + 主操作 + 三个入口 ---------- */}
        <View>
          {/* 今日：点它的行为跟着目标来源变 —— 有计划的去计划页改，没计划的弹目标选择 */}
          <View {...PRESS} style={styles.rowTap} onClick={data.targetFromPlan ? openPlan : changeGoal}>
            <Text style={styles.rowLabel}>今日</Text>
            <View style={styles.rowBody}>
              <Text style={styles.rowValue}>
                {data.todayWords}
                <Text style={styles.rowUnit}>
                  {data.todayTarget > 0 ? ` / ${data.todayTarget} 个词` : ' 个词'}
                </Text>
              </Text>
            </View>
            <Text style={styles.rowSide}>
              {data.streak > 0 ? `连续 ${data.streak} 天` : '今天开始'}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>

          {/* 计划：没定过就是一个入口 */}
          <View {...PRESS} style={styles.rowTap} onClick={openPlan}>
            <Text style={styles.rowLabel}>计划</Text>
            <View style={styles.rowBody}>
              <Text className="text-break" style={styles.rowValue}>
                {data.plan ? planLine(data.plan) : '定一个'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>

          <View {...PRESS} style={styles.cta} onClick={openShelf}>
            <Text style={styles.ctaText}>背单词</Text>
          </View>

          {/* 三个入口一行：统计类的东西都在「数据」里，这一页不放图表 */}
          <View style={styles.links}>
            <View {...PRESS} style={styles.link} onClick={openVocab}>
              <Text style={styles.linkText}>生词本</Text>
            </View>
            <View {...PRESS} style={styles.link} onClick={openMastered}>
              <Text style={styles.linkText}>熟练掌握词汇</Text>
            </View>
            <View {...PRESS} style={styles.link} onClick={openStats}>
              <Text style={styles.linkText}>数据</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 一屏铺满、不滚动：三组内容 space-between 撑开，留白由布局自动分配
  page: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD
  },

  // ---------- ① 身份 ----------
  brand: {
    fontSize: '72rpx',
    lineHeight: '92rpx',
    fontWeight: '700',
    letterSpacing: '6rpx',
    color: COLOR.text
  },

  // ---------- ② 词卡（唯一的卡，纯排版） ----------
  wordCard: {
    paddingLeft: '44rpx',
    paddingRight: '44rpx',
    paddingTop: '40rpx',
    paddingBottom: '40rpx',
    display: 'flex',
    flexDirection: 'column'
  },
  cardHead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardLabel: {
    flex: 1,
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  word: {
    marginTop: '16rpx',
    fontSize: '56rpx',
    lineHeight: '72rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  wordEmpty: {
    marginTop: '16rpx',
    fontSize: FONT.definition,
    lineHeight: '44rpx',
    color: COLOR.secondary
  },
  phonetic: {
    marginTop: '8rpx',
    fontSize: FONT.meta,
    lineHeight: '34rpx',
    color: COLOR.secondary
  },
  chevron: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: '34rpx',
    lineHeight: '34rpx',
    color: COLOR.chevron
  },

  // ---------- ③ 两行信息（共用标签列 144rpx，值从同一列开始） ----------
  // 整行 ≥88rpx 热区（多出来的用负外边距还回去，行距不变）
  rowTap: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: '33rpx',
    paddingBottom: '33rpx',
    marginTop: '-8rpx',
    marginBottom: '-8rpx'
  },
  rowLabel: {
    flexShrink: 0,
    width: '144rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  rowBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  rowValue: {
    fontSize: FONT.definition,
    color: COLOR.text
  },
  rowUnit: {
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  rowSide: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },

  // ---------- 主操作 ----------
  cta: {
    marginTop: '32rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '96rpx',
    borderRadius: '48rpx',
    backgroundColor: COLOR.black
  },
  ctaText: {
    fontSize: '32rpx',
    fontWeight: '600',
    color: COLOR.onDark
  },

  // ---------- 三个入口：一行，两端对齐 ----------
  links: {
    marginTop: '24rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // 热区 ≥88rpx（负外边距还回布局）
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    marginTop: '-20rpx',
    marginBottom: '-20rpx'
  },
  linkText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  }
}
