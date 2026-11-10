import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { LevelKey, PAGE_SIZE, Word, wordsOfLevel } from '../../data/words'
import { bookWords, mainBookId, mainBookTitle } from '../../store/books'
import {
  countLearnedWords,
  dailyQuota,
  daysUntil,
  forecastByPace,
  getCurrentPage,
  getExamDate,
  getLastReader,
  getMastered,
  getPlanStatus,
  getProgress,
  getReviewBatch,
  getReviewDue,
  getStreak,
  getTodayWordCount,
  ReviewDue
} from '../../store/storage'
import { PageCurtain } from '../../components/page-curtain'
import { COLOR, FONT_STACK, PRESS } from '../../theme'
import { bottomSafePx, rpxToPx, statusBarHeightPx } from '../../utils/metrics'

function batchSize(due: ReviewDue): number {
  const n = getReviewBatch()
  return Math.min(n > 0 ? n : 20, due.due)
}

interface PlanSummary {
  daysLeft: number
  perDay: number
  hasDeadline: boolean
  finished: boolean
  expired: boolean
  bookMissing: boolean
}

interface HomeData {
  word: Word | null
  hasLast: boolean
  readerUrl: string
  todayWords: number
  todayTarget: number
  targetFromPlan: boolean
  streak: number
  plan: PlanSummary | null
  due: ReviewDue
  reviewNext: { size: number; rest: number }
  overall: { title: string; total: number; done: number; percent: number }
  daysToExam: number
  etaDate: string
}

function loadHomeData(): HomeData {
  const last = getLastReader()
  const bookId = last && last.bookId ? last.bookId : mainBookId()
  const level = ((last && last.level) || 'all') as LevelKey
  const mastered = getMastered()
  const list = wordsOfLevel(bookWords(bookId), level).filter((w) => !mastered[w.word])
  const pageKey = `${bookId}:${level}`
  const totalPages = Math.max(Math.ceil(list.length / PAGE_SIZE), 1)
  const page = Math.min(Math.max(getCurrentPage(pageKey), 0), totalPages - 1)
  const ps = getPlanStatus()
  const planLive = Boolean(ps && !ps.finished && !ps.bookMissing)
  const mainId = mainBookId()
  const mainWords = bookWords(mainId)
  const overallTotal = mainWords.length
  const overallDone = countLearnedWords(mainWords, getProgress(), mastered)
  const forecast = forecastByPace(Math.max(overallTotal - overallDone, 0))
  const due = getReviewDue()

  return {
    word: list[page * PAGE_SIZE] ?? null,
    hasLast: Boolean(last),
    readerUrl: `/pages/reader/index?bookId=${bookId}&level=${level}`,
    todayWords: getTodayWordCount(),
    todayTarget: dailyQuota(),
    targetFromPlan: planLive,
    streak: getStreak(),
    due,
    reviewNext: { size: batchSize(due), rest: Math.max(due.due - batchSize(due), 0) },
    overall: {
      title: mainBookTitle(),
      total: overallTotal,
      done: overallDone,
      percent: overallTotal > 0 ? Math.round((overallDone / overallTotal) * 100) : 0
    },
    daysToExam: daysUntil(getExamDate()),
    etaDate: forecast.etaDate,
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

function todayLabel(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${m}.${day} ／ ${week}`
}

const EASE = 'cubic-bezier(.22,1,.36,1)'
const CREAM = '#FBFAF3'

export default function HomeScreen() {
  const [data, setData] = useState<HomeData>(loadHomeData)
  useDidShow(() => setData(loadHomeData()))

  const openReader = () => Taro.navigateTo({ url: data.readerUrl })
  const openPlan = () => Taro.navigateTo({ url: '/pages/plan/index' })
  const openReview = () =>
    Taro.navigateTo({
      url: data.reviewNext.size > 0 ? `/pages/review/index?size=${data.reviewNext.size}` : '/pages/review/index'
    })

  const meta = data.word ? [data.word.phonetic, data.word.pos].filter(Boolean).join('   ') : ''
  const doneToday = data.todayTarget > 0 && data.todayWords >= data.todayTarget
  const remaining = Math.max(data.todayTarget - data.todayWords, 0)
  const top = statusBarHeightPx()
  const bottom = bottomSafePx() + rpxToPx(28)

  const links = [
    { label: '生词本', hint: '标记过的词', url: '/pages/vocab/index' },
    { label: '查词', hint: '查一个词', url: '/pages/search/index' },
    { label: '熟练掌握', hint: '已经拿下', url: '/pages/mastered/index' },
    { label: '学习数据', hint: '节奏与累计', url: '/pages/stats/index' }
  ]

  return (
    <View style={styles.container}>
      <PageCurtain label="单词君" kicker="WORDLORD · NOVEMBER" />
      <ScrollView scrollY style={styles.list}>
        <View style={{ paddingTop: `${top}px`, paddingBottom: `${bottom}px` }}>
          {/* ── 刊头：一条横线压住，下面就是版面 ── */}
          <View
            style={{
              ...styles.masthead,
              animation: `riseIn 520ms ${EASE} backwards`,
              animationDelay: '20ms'
            }}
          >
            <Text style={styles.brand}>单词君</Text>
            <View style={styles.brandRule} />
            <Text style={styles.date}>{todayLabel()}</Text>
          </View>

          {/* ── 主数字：贴着左边缘，字号大到出血 ── */}
          <View
            style={{
              ...styles.hero,
              animation: `riseIn 620ms ${EASE} backwards`,
              animationDelay: '80ms'
            }}
          >
            <View style={styles.blob} />
            <View style={styles.ring} />
            <View style={styles.heroKickerRow}>
              <Text style={styles.heroLabel}>{doneToday ? '今天已完成' : '今天还剩'}</Text>
              <Text style={styles.heroAside}>REMAINING / {data.todayTarget} PER DAY</Text>
            </View>
            <Text style={styles.heroNum}>{doneToday ? data.todayWords : remaining}</Text>
            {/* 不限量（2026-11）：达标之后不再写「0 个词 / 收工」——那会让用户以为今天不能背了 */}
            <Text style={styles.heroUnit}>{doneToday ? '个 · 可继续' : '个词'}</Text>
          </View>

          {/* ── 进度：一根横贯的线，不是卡片 ── */}
          <View
            style={{
              ...styles.progress,
              animation: `riseIn 560ms ${EASE} backwards`,
              animationDelay: '160ms'
            }}
          >
            <View style={styles.progressTrack}>
              <View
                style={{
                  ...styles.progressFill,
                  width: `${data.overall.total > 0 ? Math.max((data.overall.done / data.overall.total) * 100, 1.5) : 0}%`,
                  transformOrigin: 'left center',
                  animation: `sweepIn 980ms ${EASE} 420ms backwards`
                }}
              />
            </View>
            <View style={styles.progressMeta}>
              <Text style={styles.metaText}>
                {data.overall.done} / {data.overall.total} 已学
              </Text>
              <Text style={styles.metaText}>
                {data.plan && data.plan.perDay > 0 ? `每天 ${data.plan.perDay} 个` : '还没定节奏'}
              </Text>
            </View>
          </View>

          {/* ── 单词：白色硬边块，整块压到屏幕右边，没有圆角没有阴影 ── */}
          <View
            {...PRESS}
            style={{
              ...styles.wordBlock,
              animation: `slideOnBaseline 640ms ${EASE} backwards`,
              animationDelay: '220ms'
            }}
            onClick={openReader}
          >
            <View style={styles.wordHead}>
              <Text style={styles.wordChip}>六级核心</Text>
              <Text style={styles.wordIndex}>{data.hasLast ? '接着上次' : '从这里开始'}</Text>
            </View>

            {data.word ? (
              <Text className="text-break" style={styles.word}>
                {data.word.word}
              </Text>
            ) : (
              <Text style={styles.wordEmpty}>这一档全学完了</Text>
            )}

            {meta ? <Text style={styles.phonetic}>{meta}</Text> : null}

            <View style={styles.wordFoot}>
              <View style={styles.wordRule} />
              <View style={styles.arrowBox}>
                <Text style={styles.arrow}>→</Text>
              </View>
            </View>

          </View>

          {/* ── 两块方色：贴在一起，只留一条缝 ── */}
          <View
            style={{
              ...styles.blocks,
              animation: `riseIn 600ms ${EASE} backwards`,
              animationDelay: '320ms'
            }}
          >
            <View {...PRESS} style={styles.blockYellow} onClick={openPlan}>
              <Text style={styles.blockLabelDark}>今日</Text>
              <Text style={styles.blockNumDark}>
                {data.todayWords}
                <Text style={styles.blockUnitDark}> / {data.todayTarget}</Text>
              </Text>
            </View>
            <View {...PRESS} style={styles.blockRed} onClick={openPlan}>

              <Text style={styles.blockLabelLight}>连续</Text>
              <Text style={styles.blockNumLight}>
                {data.streak}
                <Text style={styles.blockUnitLight}> 天</Text>
              </Text>
            </View>
          </View>

          {/* ── 到期的词：只有真的到期才占这一行 ── */}
          {data.due.due > 0 ? (
            <View
              {...PRESS}
              style={{
                ...styles.reviewRow,
                animation: `riseIn 560ms ${EASE} backwards`,
                animationDelay: '380ms'
              }}
              onClick={openReview}
            >
              <Text style={styles.reviewText}>
                {data.due.due} 个词到期
                {data.reviewNext.rest > 0 ? ` · 先复习 ${data.reviewNext.size} 个` : ''}
              </Text>
              <Text style={styles.reviewArrow}>→</Text>
            </View>
          ) : null}

          {/* ── 斜纹带：版面上的一道印刷肌理 ── */}
          <View style={styles.stripe} />

          {/* ── 入口：横线列表，靠字排版，不靠卡片 ── */}
          <View
            style={{
              ...styles.links,
              animation: `riseIn 560ms ${EASE} backwards`,
              animationDelay: '420ms'
            }}
          >
            {links.map((link) => (
              <View
                key={link.url}
                {...PRESS}
                style={styles.linkRow}
                onClick={() => Taro.navigateTo({ url: link.url })}
              >
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkHint}>{link.hint}</Text>
                <Text style={styles.linkArrow}>↗</Text>
              </View>
            ))}
            <View
              {...PRESS}
              style={styles.linkRow}
              onClick={() => Taro.navigateTo({ url: '/pages/settings/index' })}
            >
              <Text style={styles.linkLabel}>设置</Text>
              <Text style={styles.linkHint}>惯用手 · 字号 · 震动</Text>
              <Text style={styles.linkArrow}>↗</Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{data.overall.title}</Text>
            <Text style={styles.footerText}>
              {data.daysToExam > 0 ? `距考试 ${data.daysToExam} 天` : 'WORDLORD'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  container: {
    height: '100vh',
    backgroundColor: COLOR.teal,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: FONT_STACK.sans
  },
  list: {
    flex: 1,
    height: '100%'
  },

  // ---------- 刊头 ----------
  masthead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: '40rpx',
    paddingRight: '40rpx',
    paddingBottom: '14rpx',
    borderBottom: '2rpx solid rgba(251, 247, 236, 0.28)'
  },
  brand: {
    fontSize: '22rpx',
    lineHeight: '30rpx',
    fontWeight: '600',
    letterSpacing: '6rpx',
    color: CREAM
  },
  brandRule: {
    width: '48rpx',
    height: '1rpx',
    marginLeft: '18rpx',
    marginRight: '18rpx',
    backgroundColor: 'rgba(251, 247, 236, 0.3)'
  },
  date: {
    fontSize: '18rpx',
    letterSpacing: '3rpx',
    color: 'rgba(251, 247, 236, 0.62)'
  },

  // ---------- 主数字 ----------
  // 一枚巨大的描边圆环，一半在屏幕外：只做版面重量，不承载信息
  // 有机形色块：不规则的圆，缓慢呼吸式变形，压在数字后面
  blob: {
    position: 'absolute',
    right: '-80rpx',
    top: '-30rpx',
    width: '380rpx',
    height: '380rpx',
    backgroundColor: 'rgba(240, 178, 63, 0.10)',
    borderRadius: '62% 38% 46% 54% / 48% 56% 44% 52%',
    animation: `blobMorph 14s ease-in-out infinite alternate, ringIn 1400ms ${EASE} 200ms backwards`
  },
  ring: {
    position: 'absolute',
    right: '-160rpx',
    top: '10rpx',
    width: '420rpx',
    height: '420rpx',
    borderRadius: '210rpx',
    border: '2rpx solid rgba(240, 178, 63, 0.28)',
    animation: `ringIn 1200ms ${EASE} 260ms backwards`
  },
  // 封面右缘的竖排刊号：竖排中文 + 大字距，杂志书脊的做法
  spine: {
    position: 'absolute',
    right: '6rpx',
    top: '34rpx',
    writingMode: 'vertical-rl',
    animation: 'inkIn 900ms ease 600ms backwards'
  },
  spineText: {
    fontSize: '16rpx',
    lineHeight: '24rpx',
    letterSpacing: '10rpx',
    color: 'rgba(251, 247, 236, 0.32)'
  },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    paddingLeft: '36rpx',
    paddingRight: '40rpx',
    paddingTop: '24rpx',
    display: 'flex',
    flexDirection: 'column'
  },
  heroKickerRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: '6rpx'
  },
  heroLabel: {
    fontSize: '20rpx',
    letterSpacing: '6rpx',
    color: 'rgba(251, 247, 236, 0.6)'
  },
  heroAside: {
    fontSize: '14rpx',
    letterSpacing: '2rpx',
    color: 'rgba(251, 247, 236, 0.34)'
  },
  heroNum: {
    marginTop: '-14rpx',
    marginLeft: '-14rpx',
    fontSize: '224rpx',
    lineHeight: '210rpx',
    fontWeight: '800',
    letterSpacing: '-14rpx',
    color: COLOR.marigold
  },
  heroUnit: {
    marginTop: '26rpx',
    fontSize: '30rpx',
    lineHeight: '38rpx',
    fontWeight: '600',
    letterSpacing: '10rpx',
    color: CREAM
  },

  // ---------- 进度 ----------
  progress: {
    marginTop: '24rpx',
    paddingLeft: '40rpx',
    paddingRight: '40rpx'
  },
  progressTrack: {
    height: '6rpx',
    backgroundColor: 'rgba(251, 247, 236, 0.18)'
  },
  progressFill: {
    height: '6rpx',
    backgroundColor: COLOR.warm
  },
  progressMeta: {
    marginTop: '12rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  metaText: {
    fontSize: '18rpx',
    letterSpacing: '2rpx',
    color: 'rgba(251, 247, 236, 0.55)'
  },

  // ---------- 单词块 ----------
  wordBlock: {
    marginTop: '30rpx',
    borderBottomRightRadius: '104rpx',
    paddingLeft: '40rpx',
    paddingRight: '40rpx',
    paddingTop: '26rpx',
    paddingBottom: '22rpx',
    backgroundColor: CREAM,
    display: 'flex',
    flexDirection: 'column'
  },
  wordHead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  wordChip: {
    fontSize: '18rpx',
    letterSpacing: '4rpx',
    color: COLOR.warm
  },
  wordIndex: {
    fontSize: '18rpx',
    letterSpacing: '3rpx',
    color: COLOR.secondary
  },
  word: {
    marginTop: '26rpx',
    fontFamily: FONT_STACK.serif,
    fontSize: '152rpx',
    lineHeight: '156rpx',
    fontWeight: '400',
    letterSpacing: '-5rpx',
    color: COLOR.text,
    // 长词宁可被块的右边裁掉，也不缩小 —— 「字体即图像」的那条规矩
    whiteSpace: 'nowrap',
    overflow: 'hidden'
  },
  wordEmpty: {
    marginTop: '30rpx',
    fontSize: '34rpx',
    lineHeight: '48rpx',
    color: COLOR.secondary
  },
  phonetic: {
    marginTop: '14rpx',
    fontSize: '22rpx',
    lineHeight: '32rpx',
    letterSpacing: '1rpx',
    color: COLOR.secondary
  },
  wordFoot: {
    marginTop: '24rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  wordRule: {
    flex: 1,
    height: '2rpx',
    backgroundColor: 'rgba(23, 21, 15, 0.16)'
  },
  // 斜切的平行四边形：一行印刷箭头，不是圆角按钮
  arrowBox: {
    marginLeft: '24rpx',
    marginRight: '28rpx',
    width: '104rpx',
    height: '64rpx',
    backgroundColor: COLOR.warm,
    transform: 'skewX(-14deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  arrow: {
    transform: 'skewX(14deg)',
    fontSize: '34rpx',
    lineHeight: '36rpx',
    color: '#FFFFFF'
  },


  // ---------- 两块方色 ----------
  blocks: {
    marginTop: '6rpx',
    display: 'flex',
    flexDirection: 'row'
  },
  blockYellow: {
    flex: 1,
    height: '168rpx',
    marginRight: '4rpx',
    paddingLeft: '26rpx',
    paddingTop: '20rpx',
    backgroundColor: COLOR.marigold,
    display: 'flex',
    flexDirection: 'column'
  },
  blockRed: {
    position: 'relative',
    flex: 1,
    height: '168rpx',
    paddingLeft: '26rpx',
    paddingTop: '20rpx',
    backgroundColor: COLOR.warm,
    display: 'flex',
    flexDirection: 'column'
  },
  blockLabelDark: {
    fontSize: '18rpx',
    letterSpacing: '5rpx',
    color: 'rgba(23, 21, 15, 0.6)'
  },
  blockNumDark: {
    marginTop: '10rpx',
    fontSize: '84rpx',
    lineHeight: '86rpx',
    fontWeight: '800',
    letterSpacing: '-4rpx',
    color: COLOR.text
  },
  blockUnitDark: {
    fontSize: '20rpx',
    color: 'rgba(23, 21, 15, 0.6)'
  },

  blockLabelLight: {
    fontSize: '18rpx',
    letterSpacing: '5rpx',
    color: 'rgba(255, 249, 240, 0.68)'
  },
  blockNumLight: {
    marginTop: '10rpx',
    fontSize: '84rpx',
    lineHeight: '86rpx',
    fontWeight: '800',
    letterSpacing: '-4rpx',
    color: '#FFF9F0'
  },
  blockUnitLight: {
    fontSize: '20rpx',
    color: 'rgba(255, 249, 240, 0.68)'
  },

  // ---------- 复习条 ----------
  reviewRow: {
    marginTop: '4rpx',
    height: '84rpx',
    paddingLeft: '26rpx',
    paddingRight: '26rpx',
    borderBottom: '2rpx solid rgba(251, 247, 236, 0.22)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  reviewText: {
    fontSize: '24rpx',
    letterSpacing: '1rpx',
    color: CREAM
  },
  reviewArrow: {
    fontSize: '30rpx',
    color: COLOR.marigold
  },

  // ---------- 斜纹 ----------
  stripe: {
    marginTop: '18rpx',
    height: '26rpx',
    backgroundImage: `repeating-linear-gradient(45deg, ${COLOR.marigold} 0rpx, ${COLOR.marigold} 10rpx, transparent 10rpx, transparent 22rpx)`
  },

  // ---------- 入口列表 ----------
  links: {
    marginTop: '10rpx',
    paddingLeft: '40rpx',
    paddingRight: '40rpx'
  },
  linkRow: {
    height: '110rpx',
    borderBottom: '1rpx solid rgba(251, 247, 236, 0.16)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  linkLabel: {
    flex: 1,
    fontSize: '32rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: CREAM
  },
  linkHint: {
    marginRight: '20rpx',
    fontSize: '19rpx',
    letterSpacing: '1rpx',
    color: 'rgba(251, 247, 236, 0.45)'
  },
  linkArrow: {
    fontSize: '26rpx',
    color: COLOR.marigold
  },

  footer: {
    marginTop: '24rpx',
    paddingLeft: '40rpx',
    paddingRight: '40rpx',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  footerText: {
    fontSize: '17rpx',
    letterSpacing: '2rpx',
    color: 'rgba(251, 247, 236, 0.34)'
  }
}
