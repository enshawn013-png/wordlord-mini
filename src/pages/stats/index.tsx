import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { NavBar } from '../../components/nav-bar'
import { ALL_WORDS, BUILTIN_BOOK_ID, LEVELS, LevelKey, wordsOfLevel } from '../../data/words'
import { summarize } from '../../store/books'
import {
  forecastByPace,
  getDailyCounts,
  getDailyGoal,
  getMastered,
  getPlanStatus,
  getProgress,
  getRecentPace,
  getReviewLog,
  getStudyStats,
  shortDate,
  StudyStats
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx } from '../../utils/metrics'

/**
 * 「数据」：**专门看数据的一页**（用户要求把封面上的统计搬出来单独做，并且「不能乱」）。
 *
 * ## 「不能乱」在代码里就是六条硬纪律
 *
 * 1. **一套栅格**：所有行都是「标签列 144rpx + 值列」，值永远从同一个 x 开始；
 *    行内可点的那几行右侧才出现箭头，不可点的绝不出现。
 * 2. **四个分区，每个只有一个职责**：节奏 / 累计 / 词汇 / 生词库。
 * 3. **不要卡片、不要分割线**：分区之间只用 48rpx 空白 + 一行 22rpx 的灰色小标题。
 *    （列表页那套玻璃卡片这里一张都不用 —— 一页四张卡就是「卡片堆」。）
 * 4. **两个字号、两种字色**：值 28rpx 主文字色、标签/单位/备注 22rpx 次要色。
 * 5. **图形只有发丝级**：进度 4rpx 细条、柱子细柱；**全页只有一个彩色**（`COLOR.progress` 蓝，表示进度）。
 * 6. **没有记录就不显示结论**，绝不编数字（比如没速度就不给预测行）。
 *
 * ## 数据从哪来
 *
 * 全部是本地已有的真实数据，**没有一个字是写死的**：
 * 节奏 = `daily` 历史（7 / 30 天可切）+ `getRecentPace()`；累计 = `getStudyStats()`；
 * 词汇 = 内置六级按词频档统计；生词库 = `progress` / `mastered` / `reviews`。
 */

type Range = 7 | 30

const BAR_MAX = 44
/** 千分位：数据页的数字要能一眼读出量级 */
function fmt(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
function barHeight(count: number, max: number): number {
  if (count <= 0) return 6
  return 6 + Math.round((count / Math.max(max, 1)) * (BAR_MAX - 6))
}
function targetHeight(target: number, max: number): number {
  if (target <= 0) return 0
  if (target >= max) return BAR_MAX
  return 6 + Math.round((target / Math.max(max, 1)) * (BAR_MAX - 6))
}

interface StatsData {
  stats: StudyStats
  paceAvg: number
  /** 今天该背多少个（有计划听计划，没计划用每日目标）—— 就是图里那条目标线 */
  target: number
  /** 按实际速度预测（有计划就预测计划，没计划预测六级整本） */
  forecast: { etaDate: string; etaDays: number; lateDays: number }
  forecastIsPlan: boolean
  hasDeadline: boolean
  overall: { total: number; done: number }
  bands: { key: LevelKey; label: string; total: number; done: number }[]
  vocab: number
  mastered: number
  reviewed: number
}

function loadData(): StatsData {
  const masteredMap = getMastered()
  const progress = getProgress()
  const ps = getPlanStatus()
  const planPerDay = ps && !ps.finished && !ps.bookMissing ? ps.perDay : 0

  const overallStat = summarize(ALL_WORDS, masteredMap)
  const overall = { total: overallStat.total, done: overallStat.total - overallStat.remain }
  const vocab = Object.keys(progress).filter((w) => progress[w] > 0 && !masteredMap[w]).length
  const forecastTarget = ps && !ps.bookMissing ? ps.remaining : Math.max(overall.total - overall.done, 0)

  return {
    stats: getStudyStats(),
    paceAvg: getRecentPace().avgPerDay,
    target: planPerDay > 0 ? planPerDay : getDailyGoal(),
    forecast: forecastByPace(forecastTarget, ps ? ps.plan.deadline : ''),
    forecastIsPlan: Boolean(ps && !ps.bookMissing),
    hasDeadline: Boolean(ps && ps.hasDeadline),
    overall,
    // 三个词频档的进度（'all' 不在里面，它是三档之和）；点一行直接进那一档翻书
    bands: LEVELS.filter((l) => l.key !== 'all').map((l) => {
      const sum = summarize(wordsOfLevel(ALL_WORDS, l.key), masteredMap)
      return { key: l.key, label: l.label, total: sum.total, done: sum.total - sum.remain }
    }),
    vocab,
    mastered: Object.keys(masteredMap).length,
    reviewed: Object.keys(getReviewLog()).length
  }
}

export default function StatsScreen() {
  const [data, setData] = useState<StatsData>(loadData)
  const [range, setRange] = useState<Range>(7)

  useDidShow(() => setData(loadData()))

  const openBand = (key: LevelKey) =>
    Taro.navigateTo({ url: `/pages/reader/index?bookId=${BUILTIN_BOOK_ID}&level=${key}` })
  const openVocab = () => Taro.navigateTo({ url: '/pages/vocab/index' })
  const openMastered = () => Taro.navigateTo({ url: '/pages/mastered/index' })
  const openReviewLog = () => Taro.navigateTo({ url: '/pages/review-log/index' })

  // 节奏图：柱子和目标线共用一把尺子
  const days = getDailyCounts(range)
  const rangeTotal = days.reduce((n, d) => n + d.count, 0)
  const chartMax = Math.max(data.target, ...days.map((d) => d.count), 1)
  const targetH = targetHeight(data.target, chartMax)
  const daysHit = data.target > 0 ? days.filter((d) => d.count >= data.target).length : 0
  const isPlanForecast = data.forecastIsPlan && data.forecast.etaDays > 0

  const navH = navBarHeightPx()
  // 左右 32rpx 页边距是这一页唯一的基准线（所有标签 / 值 / 图形都从它对齐）
  const page = {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: `${navH + topGapPx()}px`,
    paddingBottom: `${bottomSafePx() + rpxToPx(24)}px`
  }
  const pct = (v: number, t: number) => (t > 0 ? `${Math.min(Math.round((v / t) * 100), 100)}%` : '0%')

  return (
    <View style={STYLE.container}>
      <ScrollView scrollY style={STYLE.list}>
        <View style={page}>
          {/* ================= ① 节奏 ================= */}
          <Text style={styles.section}>节奏</Text>

          {/* 7 / 30 天切换：两个小胶囊，和计划页的模式切换同一套样子 */}
          <View style={styles.switchRow}>
            {([7, 30] as Range[]).map((r) => {
              const on = range === r
              return (
                <View
                  key={r}
                  {...PRESS}
                  className={on ? undefined : 'glass glass-pill'}
                  style={{ ...styles.switchChip, ...(on ? styles.chipOn : null) }}
                  onClick={() => setRange(r)}
                >
                  <Text style={on ? styles.chipOnText : styles.chipText}>近 {r} 天</Text>
                </View>
              )
            })}
          </View>

          {/* 一行摘要：把图里那两种颜色说清楚（灰=目标、蓝=实际），不在图里塞标注。
              2026-10 第五版之前是在图里画一条贯穿整行的「目标线」+ 一个小标 ——
              全 0 时它被顶到图形区最上面，横贯整行，看起来就像一条分割线（用户：这里 UI 还是乱的），
              而且「目标」小标正好贴在上一行的数字下面。现在改成底下有灰柱、上面压蓝柱。 */}
          <View style={styles.row}>
            <Text style={styles.label} />
            <View style={styles.body}>
              <Text style={styles.summary}>
                {data.target > 0 ? `目标 ${data.target} 个` : '没设目标'}
                {data.paceAvg > 0 ? ` · 每天约 ${data.paceAvg} 个` : ''}
                {data.target > 0
                  ? rangeTotal > 0
                    ? ` · 达标 ${daysHit} 天`
                    : ' · 还没开始'
                  : ` · 共 ${fmt(rangeTotal)} 个词`}
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label} />
            <View style={styles.body}>
              <View style={styles.chartBox}>
                <View style={styles.chart}>
                  {days.map((d) => (
                    <View key={d.date} style={styles.chartCol}>
                      <View style={styles.chartBarBox}>
                        {/* 一个「柱槽」：底柱和实际柱都贴着它的底、铺满它的宽，
                            所以两根柱子共用同一条底线（负边距那套做不到，会浮起来） */}
                        <View style={{ ...styles.barSlot, width: range === 7 ? '36rpx' : '12rpx' }}>
                          {targetH > 0 ? (
                            <View style={{ ...styles.ghostBar, height: `${targetH}rpx` }} />
                          ) : null}
                          {d.count > 0 ? (
                            <View
                              style={{
                                ...styles.chartBar,
                                height: `${barHeight(d.count, chartMax)}rpx`
                              }}
                            />
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
                {/* 星期字必须和上面的柱子**同列**（所以用和 chart 一样的等宽 flex:1 列），
                    用 space-between 排会偏 20rpx，看着就乱。
                    30 天时柱子太密，只在两端标首尾日期 */}
                {range === 7 ? (
                  <View style={styles.footRow}>
                    {days.map((d) => (
                      <View key={d.date} style={styles.footCol}>
                        <Text style={d.isToday ? styles.dayOn : styles.day}>
                          {d.isToday ? '今' : d.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.footEdgeRow}>
                    <Text style={styles.day}>{shortDate(days[0]?.date ?? '')}</Text>
                    <Text style={styles.dayOn}>今天</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* 结论行：照这个速度哪天完、来不来得及。没有实际记录时整行不显示 */}
          {isPlanForecast ? (
            <View style={styles.row}>
              <Text style={styles.label} />
              <View style={styles.body}>
                <Text style={styles.verdict}>
                  按这个速度 {shortDate(data.forecast.etaDate)} 背完
                </Text>
              </View>
              {data.hasDeadline ? (
                <Text style={data.forecast.lateDays > 0 ? styles.bad : styles.good}>
                  {data.forecast.lateDays > 0
                    ? `晚 ${data.forecast.lateDays} 天`
                    : data.forecast.lateDays < 0
                      ? `早 ${-data.forecast.lateDays} 天`
                      : '正好'}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* ================= ② 累计 ================= */}
          <Text style={{ ...styles.section, ...styles.sectionGap }}>累计</Text>

          <View style={styles.row}>
            <Text style={styles.label}>总背过</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {fmt(data.stats.totalWords)}
                <Text style={styles.unit}> 个词</Text>
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>学习天数</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {data.stats.studyDays}
                <Text style={styles.unit}> 天</Text>
              </Text>
            </View>
            <Text style={styles.side}>
              {data.stats.sinceDate ? `从 ${shortDate(data.stats.sinceDate)} 开始` : ''}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>连续</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {data.stats.streak}
                <Text style={styles.unit}> 天 · 最长 {data.stats.bestStreak} 天</Text>
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>今日 / 本周</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {data.stats.todayWords} / {data.stats.weekWords}
                <Text style={styles.unit}> 个词</Text>
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>近 30 天</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {fmt(data.stats.monthWords)}
                <Text style={styles.unit}> 个词</Text>
              </Text>
            </View>
          </View>

          {/* ================= ③ 词汇 ================= */}
          <Text style={{ ...styles.section, ...styles.sectionGap }}>词汇</Text>

          <View style={styles.row}>
            <Text style={styles.label}>六级整体</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {fmt(data.overall.done)}
                <Text style={styles.unit}> / {fmt(data.overall.total)}</Text>
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label} />
            <View style={styles.body}>
              <View style={styles.barTrack}>
                <View
                  style={{ ...styles.barFill, width: pct(data.overall.done, data.overall.total) }}
                />
              </View>
            </View>
          </View>

          {data.bands.map((b) => (
            <View key={b.key}>
              <View {...PRESS} style={{ ...styles.row, ...styles.rowGap }} onClick={() => openBand(b.key)}>
                <Text style={styles.label}>{b.label}</Text>
                <View style={styles.body}>
                  <Text style={styles.value}>
                    {fmt(b.done)}
                    <Text style={styles.unit}> / {fmt(b.total)}</Text>
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label} />
                <View style={styles.body}>
                  <View style={styles.barTrack}>
                    <View style={{ ...styles.barFill, width: pct(b.done, b.total) }} />
                  </View>
                </View>
              </View>
            </View>
          ))}

          {/* ================= ④ 生词库 ================= */}
          <Text style={{ ...styles.section, ...styles.sectionGap }}>生词库</Text>

          <View {...PRESS} style={styles.row} onClick={openVocab}>
            <Text style={styles.label}>待复习</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {data.vocab}
                <Text style={styles.unit}> 个词</Text>
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
          <View {...PRESS} style={styles.row} onClick={openMastered}>
            <Text style={styles.label}>已掌握</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {data.mastered}
                <Text style={styles.unit}> 个词</Text>
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
          <View {...PRESS} style={styles.row} onClick={openReviewLog}>
            <Text style={styles.label}>复习记录</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {data.reviewed}
                <Text style={styles.unit}> 个词</Text>
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </View>
      </ScrollView>

      <NavBar title="数据" back />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // ---------- 分区标题：只是 22rpx 的灰字 + 上方留白，没有卡片也没有分割线 ----------
  section: {
    fontSize: FONT.pageNo,
    color: COLOR.secondary,
    marginBottom: '16rpx'
  },
  sectionGap: {
    marginTop: '48rpx'
  },

  // ---------- 一套栅格：标签列 144rpx + 值列 ----------
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: '8rpx',
    paddingBottom: '8rpx'
  },
  // 组与组之间空一档（比如每个词频档的「数字行 + 图形行」算一组）
  rowGap: {
    marginTop: '16rpx'
  },
  label: {
    flexShrink: 0,
    width: '144rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  value: {
    fontSize: FONT.definition,
    color: COLOR.text
  },
  unit: {
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  side: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  good: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.pillDoneText
  },
  bad: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.dangerText
  },
  chevron: {
    flexShrink: 0,
    marginLeft: '12rpx',
    fontSize: '34rpx',
    lineHeight: '34rpx',
    color: COLOR.chevron
  },
  // 结论行：比读数重要，用正文色
  verdict: {
    fontSize: FONT.meta,
    lineHeight: '34rpx',
    color: COLOR.body
  },

  // ---------- 7 / 30 天切换 ----------
  switchRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: '20rpx'
  },
  switchChip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '16rpx',
    paddingLeft: '24rpx',
    paddingRight: '24rpx',
    paddingTop: '14rpx',
    paddingBottom: '14rpx',
    borderRadius: '26rpx'
  },
  chipOn: {
    backgroundColor: COLOR.black
  },
  chipText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  chipOnText: {
    fontSize: FONT.meta,
    color: COLOR.onDark
  },

  // ---------- 节奏图 ----------
  // chartBox 就是「图形区 44rpx + 星期行 36rpx」，没有绝对定位的东西了
  //（第五版去掉了贯穿整行的「目标线」—— 全 0 时它像一条分割线，这才是「乱」的来源）
  chartBox: {
    flex: 1
  },
  // 一行灰色摘要：目标 / 速度 / 达标 —— 图里不再塞任何标注
  summary: {
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  chart: {
    marginTop: '12rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  chartCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  chartBarBox: {
    height: `${BAR_MAX}rpx`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  // 柱槽：宽度由调用方给（7 天 36rpx / 30 天 12rpx），高度撑满图形区。
  // 两根柱子都绝对定位贴底 —— 这样它们**共用同一条底线**，没做到的部分自然露出来。
  barSlot: {
    height: `${BAR_MAX}rpx`,
    position: 'relative'
  },
  // 目标底柱：用 #C7C7CC（项目里那个「图表灰」）—— `COLOR.fill` 在浅色页面上几乎看不见
  ghostBar: {
    position: 'absolute',
    left: '0rpx',
    right: '0rpx',
    bottom: '0rpx',
    borderRadius: '8rpx',
    backgroundColor: COLOR.chevron
  },
  // 实际柱：蓝色（全页唯一的彩色），压在底柱上面
  chartBar: {
    position: 'absolute',
    left: '0rpx',
    right: '0rpx',
    bottom: '0rpx',
    borderRadius: '8rpx',
    backgroundColor: COLOR.progress
  },
  // 7 天：和柱子同列的等宽 7 格，每格居中一个字（**不能**用 space-between，会错位）
  footRow: {
    marginTop: '8rpx',
    height: '28rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  footCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // 30 天：只在两端标首尾日期（这两个是「边缘标注」，不是每根柱子的标签，所以两端对齐）
  footEdgeRow: {
    marginTop: '8rpx',
    height: '28rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  day: {
    fontSize: '20rpx',
    lineHeight: '28rpx',
    color: COLOR.secondary
  },
  dayOn: {
    fontSize: '20rpx',
    lineHeight: '28rpx',
    fontWeight: '700',
    color: COLOR.text
  },

  // ---------- 进度条：4rpx 发丝级，全页唯一彩色 ----------
  barTrack: {
    flex: 1,
    height: '4rpx',
    borderRadius: '2rpx',
    backgroundColor: COLOR.fill,
    overflow: 'hidden'
  },
  barFill: {
    height: '4rpx',
    borderRadius: '2rpx',
    backgroundColor: COLOR.progress
  }
}
