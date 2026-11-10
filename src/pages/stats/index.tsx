import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { NavBar } from '../../components/nav-bar'
import { PageHeader } from '../../components/page-header'
import { Chip } from '../../components/chip'
import { LEVELS, LevelKey, wordsOfLevel } from '../../data/words'
import { mainBookId, mainBookTitle, mainBookWords } from '../../store/books'
import { describeBackupResult, exportBackupFile } from '../../utils/backup-file'
import {
  ActivityDay,
  clearWriteError,
  comparePeriods,
  countLearnedWords,
  exportBackup,
  forecastByPace,
  getActivityDays,
  getDailyCounts,
  getDailyGoal,
  getMastered,
  getPlanStatus,
  getProgress,
  getRecentPace,
  getReviewBatch,
  getReviewDue,
  getReviewLog,
  getStudyStats,
  getWriteError,
  importBackup,
  inspectBackup,
  PeriodCompare,
  ReviewDue,
  shortDate,
  storageUsage,
  StudyStats
} from '../../store/storage'
import { COLOR, FONT, FONT_STACK, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx } from '../../utils/metrics'
import { pickMainBook } from '../../utils/main-book'

/**
 * 「数据」：**专门看数据的一页**（用户要求把封面上的统计搬出来单独做，并且「不能乱」）。
 *
 * ## 「不能乱」在代码里就是六条硬纪律（改这一页前先读一遍）
 *
 * 1. **一套栅格**：所有行都是「标签列 144rpx + 值列」，值永远从同一个 x 开始；
 *    行内可点的那几行右侧才出现箭头，不可点的绝不出现。
 * 2. **五个分区，每个只有一个职责**：节奏 / 累计 / 词汇 / 生词库 / 本地数据
 *    （第十轮 R10 又加了第六个「设置」，就为放主词书一行 —— 见下）。
 * 3. **不要卡片、不要分割线**：分区之间只用 48rpx 空白 + 一行 24rpx 的灰色小标题。
 *    （列表页那套玻璃卡片这里一张都不用 —— 一页四张卡就是「卡片堆」。）
 * 4. **两个字号、两种字色**：值 28rpx 主文字色、标签/单位/备注 22rpx 次要色。
 * 5. **图形只有发丝级**：进度 4rpx 细条。**全页只有一个彩色**（`COLOR.progress` 蓝，表示进度）。
 * 6. **没有记录就不显示结论**，绝不编数字（比如没速度就不给预测行）。
 *
 * ## 2026-10 第七轮：三个阶段的问题一次说清
 *
 * **第五轮**（用户：「这里 UI 还是乱的」）改掉了贯穿整行的「目标线」——全 0 时它像一条分割线；
 * 改成「灰色目标底柱 + 蓝色实际柱」。**第六轮**（另一个 Agent）补了环比、活跃度带、图表空状态。
 *
 * **第七轮（这一轮）**动的是三处**结构性问题**，不是换皮：
 *
 * 1. **图从 44rpx 长到 96rpx**。原来「柱状图」最高 44rpx（= 22pt，一根小指头高），
 *    7 根柱子挤在 100rpx 里 —— 它**读不出趋势**，只是「有图表这件事」的装饰。
 *    这一页唯一该被记住的东西就是这张趋势图，所以把纵向空间还给它（96rpx = 48pt），
 *    顺手把柱顶数字从「统一顶在图形上方的表头」改成**跟着柱子走**（原来数字离柱子很远，
 *    96rpx 之后这个错位会变得很明显）。发丝级纪律管的是**进度条和柱子宽度**，
 *    不是图表高度 —— 高度不够的图表是没有信息量的。
 * 2. **修掉一屏之内自相矛盾的数字**。原来是「总背过 0 个词」和「六级整体 4 / 1,824」
 *    同时出现（用户截图里就是这样）：前者来自 `daily`（只留 62 天），后者来自 `mastered`。
 *    现在累计区换成 `touchedWords`（标记过 ∪ 已掌握，去重），和词汇区同一个来源，
 *    数字再也不会互相打脸。学习天数 / 连续仍然来自 `daily`，但标签写清了。
 * 3. **这一页终于能「动手」**。数据页原来只报数：看完 45 个待复习，还要退出去、
 *    进生词本、填数量、才能开始复习。现在「今天该复习 N 个词（逾期 M 个）」由
 *    间隔重复（`getReviewDue()`）算出来，点这一行**或**页尾那颗黑胶囊就直接开考。
 *
 * 另外补了两件「数据资产的底线」：**存储占用**（微信缓存只有 10MB）和**备份 / 恢复**
 * （云同步默认没开通，清缓存 = 几个月的进度全没，必须给用户一个能带走数据的出口）。
 *
 * ## 数据从哪来
 *
 * 全部是本地已有的真实数据，**没有一个字是写死的**：
 * 节奏 = `daily` 历史（7 / 30 天可切）+ `getRecentPace()`；累计 = `getStudyStats()` + `comparePeriods()`；
 * 活跃度带 = `getActivityDays()`；复习到期 = `getReviewDue()`（间隔重复，见 storage.ts）；
 * 词汇 = **主词书**按词频档统计；生词库 = `progress` / `mastered` / `reviews`。
 *
 * ## 2026-11（R10）：词汇区只按「主词书」一本算
 *
 * 以前这里的分母写死是内置六级（`ALL_WORDS`），而「我的上传」里那些词表的
 * 高频/中频/低频是**另一套定义** —— 两本一起看就是对不上账的数字。
 * 现在分母统一来自 `store/books.ts` 的 `mainBookWords()`（默认还是大学六级 1824 词），
 * 分区标题会写明「按哪一本算」；非主词书进「归档词书」，标签不参与任何统计。
 * ⚠️ 这一页从此**不许再直接 import ALL_WORDS** —— 那等于绕过主词书设置。
 */

type Range = 7 | 30

/**
 * 图形区高度：96rpx（= 48pt）。
 * 44rpx 是第五到第六版的值 —— 在真机上 7 根柱子只有 22pt 高，看不出趋势，
 * 所以这一轮把它抬到 96rpx：仍然远小于「一屏一半」的仪表盘，但已经够读出起伏。
 * 柱子**宽度**不变（7 天 40rpx / 30 天 14rpx），发丝感靠宽度维持。
 */
const BAR_MAX = 96
/** 柱顶数字的净空：数字画在柱子上方，图形区要给它们留出这么高，否则会顶到上一行 */
const BAR_LABEL_ROOM = 28

/** 千分位：数据页的数字要能一眼读出量级 */
function fmt(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
function barHeight(count: number, max: number): number {
  if (count <= 0) return 0
  return Math.max(6, Math.round((count / Math.max(max, 1)) * (BAR_MAX - 6)) + 6)
}
function targetHeight(target: number, max: number): number {
  if (target <= 0) return 0
  if (target >= max) return BAR_MAX
  return 6 + Math.round((target / Math.max(max, 1)) * (BAR_MAX - 6))
}
/** 环比描述：返回文案 + 色调（增 = 绿、平 / 减 = 灰，**不用红** —— 少背几天不是错误） */
function deltaText(c: PeriodCompare): { text: string; tone: 'up' | 'flat' | 'down' } {
  if (c.percent === null) return { text: `新增 ${fmt(c.current)}`, tone: 'flat' }
  if (c.delta === 0) return { text: '与上期持平', tone: 'flat' }
  const sign = c.delta > 0 ? '↑' : '↓'
  return {
    text: `${sign} ${Math.abs(c.percent)}%`,
    tone: c.delta > 0 ? 'up' : 'down'
  }
}

interface StatsData {
  stats: StudyStats
  paceAvg: number
  /**
   * **全 app 唯一的「每日新词目标」**（`getDailyGoal()` = 34）—— 就是图里那条灰色目标底柱。
   * ⚠️ 2026-11 起它不再被计划算出来的 `perDay` 覆盖：那种「有计划听计划」的取法会让
   * 首页写 22/57、这一页写「目标 57 个」、计划页算出来又是第三个数字（用户截图里就是各说各话）。
   */
  target: number
  /** 按实际速度预测（有计划就预测计划，没计划预测六级整本） */
  forecast: { etaDate: string; etaDays: number; lateDays: number }
  forecastIsPlan: boolean
  hasDeadline: boolean
  /**
   * 当前主词书的名字（R10）。词汇区标题要说清「按哪一本算」——
   * 用户在设置里换过主词书之后，这一页的数字含义跟着换，界面上必须看得见。
   */
  mainTitle: string
  /** 主词书整体：`done` 是**标记 ∪ 已掌握（去重）**的真实已背数，不是只数「已掌握」 */
  overall: { total: number; done: number }
  bands: { key: LevelKey; label: string; total: number; done: number }[]
  vocab: number
  mastered: number
  reviewed: number
  /** 间隔重复算出来的复习到期情况 */
  due: ReviewDue
  /**
   * 今天这一批领几个（R7）：**到期词里优先 Top N**（越逾期越靠前，排序在 storage.pickReviewBatch）。
   * 这一页原来把 `due.due` 直接推给复习页（到期 62 就一次开 62），数字越积越吓人；
   * 现在这一页和首页报的是同一个数：`min(每次复习几个, 到期数)`。
   */
  reviewBatch: number
  /** 今天还没排进这一批的到期数（只在背面说一句，不做成欠账） */
  reviewRest: number
  /** 本地缓存占用（KB） */
  usedKB: number
  limitKB: number
}

function loadData(): StatsData {
  const masteredMap = getMastered()
  const progress = getProgress()
  const ps = getPlanStatus()
  /**
   * ⚠️ R10：这一页的分母只有一个来源 —— **主词书**（`mainBookWords()`，默认大学六级）。
   * 「我的上传」里那些词书的词频标签是另一套定义，一律不进这一页的计算。
   */
  const book = mainBookWords()

  /**
   * ⚠️ 2026-11 修的是 R3 那个「低估真实进度」的口径 bug：
   * 原来这里只数 `mastered`（已掌握），而用户的习惯是在翻书页点标记圆圈，
   * 于是一屏上「已掌握 221 个词」和「六级整体 80 / 1824」互相打脸。
   * 现在分子 = `countLearnedWords()`（标记过 ∪ 已掌握，去重），和「背过的词」同一个来源。
   */
  const overall = { total: book.length, done: countLearnedWords(book, progress, masteredMap) }
  const vocab = Object.keys(progress).filter((w) => progress[w] > 0 && !masteredMap[w]).length
  const forecastTarget = ps && !ps.bookMissing ? ps.remaining : Math.max(overall.total - overall.done, 0)
  const usage = storageUsage()
  // R7：这一批领几个（算法和首页一模一样：默认 20，用户改过就按他的，再收敛到到期数）
  const due = getReviewDue()
  const reviewBatch = Math.min(getReviewBatch() > 0 ? getReviewBatch() : 20, due.due)

  return {
    stats: getStudyStats(),
    paceAvg: getRecentPace().avgPerDay,
    target: getDailyGoal(),
    forecast: forecastByPace(forecastTarget, ps ? ps.plan.deadline : ''),
    forecastIsPlan: Boolean(ps && !ps.bookMissing),
    hasDeadline: Boolean(ps && ps.hasDeadline),
    mainTitle: mainBookTitle(),
    overall,
    // 三个词频档的进度（'all' 不在里面，它是三档之和）；分子同样是「标记 ∪ 已掌握」
    bands: LEVELS.filter((l) => l.key !== 'all').map((l) => {
      const words = wordsOfLevel(book, l.key)
      return { key: l.key, label: l.label, total: words.length, done: countLearnedWords(words, progress, masteredMap) }
    }),
    vocab,
    mastered: Object.keys(masteredMap).length,
    reviewed: Object.keys(getReviewLog()).length,
    due,
    reviewBatch,
    reviewRest: Math.max(due.due - reviewBatch, 0),
    usedKB: usage.usedKB,
    limitKB: usage.limitKB
  }
}

export default function StatsScreen() {
  const [data, setData] = useState<StatsData>(loadData)
  const [range, setRange] = useState<Range>(7)
  /**
   * 界面内的反馈条（备份结果、写盘失败……）。
   * 为什么不弹 Toast：微信 Toast 超过 7 个汉字就被挤成两行甚至看不全，
   * 而这几种结果的文案天生说不短（「备份里有 45 个生词、36 个已掌握」）。
   * 反馈长在界面里，用户想什么时候看就什么时候看。
   */
  const [notice, setNotice] = useState('')

  useDidShow(() => {
    setData(loadData())
    // 上一次动手没存进缓存（空间满 / 被系统拒绝）—— 必须让用户知道，而不是假装成功
    if (getWriteError()) setNotice('本地存储写入失败，刚才的改动可能没保存。建议先做一次备份。')
  })

  const openBand = (key: LevelKey) =>
    Taro.navigateTo({ url: `/pages/reader/index?bookId=${mainBookId()}&level=${key}` })
  /** 换主词书（R10）：选完立刻重算这一页 —— 数字的含义跟着书换，不能等下次进来才更新 */
  const changeMainBook = () => {
    pickMainBook().then((id) => {
      if (!id) return
      setData(loadData())
      setNotice(`主词书已改成《${mainBookTitle()}》，这一页的词汇进度从现在就按它算。`)
    })
  }
  const openVocab = () => Taro.navigateTo({ url: '/pages/vocab/index' })
  const openMastered = () => Taro.navigateTo({ url: '/pages/mastered/index' })
  const openReviewLog = () => Taro.navigateTo({ url: '/pages/review-log/index' })
  /** 直接把「今天这一批」交给复习页（R7：一批 20，不再把全部到期数一次推出去） */
  const startReview = () => {
    if (data.reviewBatch <= 0) return openVocab()
    Taro.navigateTo({ url: `/pages/review/index?size=${data.reviewBatch}` })
  }

  /**
   * 备份 / 恢复。
   *
   * 导出走剪贴板（用户粘到微信收藏 / 备忘录即可），恢复走 `showModal` 的
   * `editable` 输入框（基础库 2.17.1+，不用为了一个粘贴框新开一个页面）。
   * 恢复是**覆盖式**的，所以第二步要一个明确的确认 + 红字按钮。
   */
  const openBackup = () => {
    Taro.showActionSheet({ itemList: ['导出为文件（JSON）', '导出备份（复制到剪贴板）', '从备份恢复'] })
      .then((res) => {
        if (res.tapIndex === 0) {
          // 文件导出（2026-11 用户要求）：手机上发到聊天，PC 上直接另存为
          setNotice('正在打包…')
          exportBackupFile()
            .then((r) => setNotice(describeBackupResult(r)))
            .catch(() => setNotice('导出失败，退出重进再试一次。'))
        } else if (res.tapIndex === 1) {
          const json = exportBackup()
          Taro.setClipboardData({ data: json })
            .then(() => setNotice('备份已复制到剪贴板，粘到微信收藏或备忘录里存好（换手机 / 清缓存后能靠它恢复）。'))
            .catch(() => setNotice('复制失败，可以退出重进再试一次。'))
        } else if (res.tapIndex === 2) {
          restore()
        }
      })
      .catch(() => undefined)
  }

  const restore = () => {
    // ⚠️ `editable` 是微信基础库 2.17.1+ 的能力（带输入框的 Modal），
    // 但 **Taro 4.2.1 的 showModal 类型里还没有这个字段** —— 运行时是原样透传的，
    // 所以这里断言一下绕开类型，别为了迁就类型去新开一个只有粘贴框的页面。
    const ask: Parameters<typeof Taro.showModal>[0] = {
      title: '粘贴备份内容',
      confirmText: '下一步',
      success: (res) => {
        if (!res.confirm) return
        const text = ((res as unknown as { content?: string }).content || '').trim()
        const info = inspectBackup(text)
        if (!info.ok) {
          setNotice(`恢复失败：${info.message}`)
          return
        }
        Taro.showModal({
          title: '确认恢复',
          content: `${info.message}。恢复会覆盖当前的学习数据，确定吗？`,
          confirmText: '覆盖恢复',
          confirmColor: COLOR.dangerText,
          success: (r2) => {
            if (!r2.confirm) return
            const out = importBackup(text)
            if (out.ok) {
              setData(loadData())
              setNotice(`${out.message}。回到各页面就是恢复后的进度。`)
            } else {
              setNotice(`恢复失败：${out.message}`)
            }
          }
        })
      }
    }
    ;(ask as Record<string, unknown>).editable = true
    ;(ask as Record<string, unknown>).placeholderText = '把之前导出的那段内容粘进来'
    Taro.showModal(ask)
  }

  const dismissNotice = () => {
    clearWriteError()
    setNotice('')
  }

  // 节奏图：柱子和目标底柱共用一把尺子
  const days = getDailyCounts(range)
  const rangeTotal = days.reduce((n, d) => n + d.count, 0)
  const chartMax = Math.max(data.target, ...days.map((d) => d.count), 1)
  const targetH = targetHeight(data.target, chartMax)
  const daysHit = data.target > 0 ? days.filter((d) => d.count >= data.target).length : 0
  const isPlanForecast = data.forecastIsPlan && data.forecast.etaDays > 0
  /** 这一屏有没有任何记录：没有就整图换成引导文案，而不是画一排空柱子 */
  const chartEmpty = rangeTotal === 0

  // 环比与活跃度带：和 range 联动（看 7 天就给周环比，看 30 天就给月环比）
  const compare = comparePeriods(range)
  const delta = deltaText(compare)
  const activity: ActivityDay[] = getActivityDays(30)
  const activeDays = activity.filter((a) => a.active).length
  /**
   * 活跃区那句「近 30 天活跃 N 天 · 合计 M 个词」的 M：**和「今日」「达标」同一个数据源**
   * （`getDailyCounts()` → `dailyLoggedCount()`），不是另算一遍 `activity` 的加总 ——
   * 用户截图里的 bug 正是「今日 22/20」和「合计 1 个词」同屏，两处读的两份历史对不上。
   */
  const monthWords = data.stats.monthWords

  const navH = navBarHeightPx()
  // 左右 32rpx 页边距是这一页唯一的基准线（所有标签 / 值 / 图形都从它对齐）
  const page = {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: `${navH + topGapPx()}px`,
    paddingBottom: `${bottomSafePx() + rpxToPx(24)}px`
  }
  const pct = (v: number, t: number) => (t > 0 ? `${Math.min(Math.round((v / t) * 100), 100)}%` : '0%')
  /** 切换胶囊上的日期区间：首尾两天；跨月时两端都带月，同月时只写一次 */
  const rangeEdge = `${shortDate(days[0]?.date ?? '')} → ${shortDate(days[days.length - 1]?.date ?? '')}`
  /** 复习卡片 / 到期文案里用的「下次是哪天」 */
  const nextDueText = data.due.nextDate
    ? `下次 ${shortDate(data.due.nextDate)}（${data.due.nextCount} 个）`
    : ''

  return (
    <View style={STYLE.container}>
      <PageCurtain label="学习数据" kicker="STATISTICS" />
      <ScrollView scrollY style={STYLE.list}>
        <View style={page}>
<PageHeader kicker="STUDY LOG" title="学习数据" sub="节奏、累计，和这本词书走到哪儿了" />
          
          {/* 界面内反馈条：写盘失败 / 备份结果。放在最上面，因为它比任何数字都重要 */}
          {notice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{notice}</Text>
              <View {...PRESS} style={styles.noticeBtn} onClick={dismissNotice}>
                <Text style={styles.noticeBtnText}>知道了</Text>
              </View>
            </View>
          ) : null}

          {/* ================= ① 节奏 ================= */}
          {/* 分区标题和 7/30 切换同一行：切换属于「节奏」这个分区，原来单独占一行是浪费 */}
          <View style={styles.sectionRow}>
            <Text style={styles.section}>节奏</Text>
            <View style={styles.switchRow}>
              {([7, 30] as Range[]).map((r) => (
                <Chip
                  key={r}
                  label={`近 ${r} 天`}
                  on={range === r}
                  onClick={() => setRange(r)}
                  style={styles.switchChip}
                />
              ))}
            </View>
          </View>

          {/* 一行摘要：把图里那两种颜色说清楚（灰=目标、蓝=实际），不在图里塞标注 */}
          <View style={styles.row}>
            <Text style={styles.label} />
            <View style={styles.body}>
              <Text style={styles.summary}>
                {rangeEdge}
                {data.target > 0 ? ` · 目标 ${data.target} 个` : ' · 没设目标'}
                {data.paceAvg > 0 ? ` · 每天约 ${data.paceAvg} 个` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label} />
            <View style={styles.body}>
              {chartEmpty ? (
                // 空状态：没有记录就不画一排空柱子（那看着像坏了），直接给一句引导
                <View style={styles.chartEmptyBox}>
                  <Text style={styles.chartEmptyText}>
                    这 {range} 天还没有记录。去翻书页标记几个词，这里就会长出柱子。
                  </Text>
                </View>
              ) : (
                <View style={styles.chartBox}>
                  <View style={styles.chart}>
                    {days.map((d) => {
                      const h = barHeight(d.count, chartMax)
                      return (
                        <View key={d.date} style={styles.chartCol}>
                          <View style={styles.chartBarBox}>
                            {/* 一个「柱槽」：目标底柱和实际柱都贴着它的底、铺满它的宽，
                                所以两根柱子共用同一条底线（负边距那套做不到，会浮起来） */}
                            <View style={{ ...styles.barSlot, width: range === 7 ? '40rpx' : '14rpx' }}>
                              {targetH > 0 ? (
                                <View style={{ ...styles.ghostBar, height: `${targetH}rpx` }} />
                              ) : null}
                              {d.count > 0 ? (
                                <View style={{ ...styles.chartBar, height: `${h}rpx` }} />
                              ) : null}
                              {/* 柱顶数值：跟着柱子走（不是统一顶在图形上方的表头）——
                                  96rpx 的图里两者会差出半屏，只有贴着柱子才读得对。
                                  30 天时太密不画；0 的那天也不画，免得一排 0 把图形淹掉 */}
                              {range === 7 && d.count > 0 ? (
                                <View style={{ ...styles.barLabelWrap, bottom: `${h + 8}rpx` }}>
                                  <Text style={styles.barLabel}>{d.count}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      )
                    })}
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
              )}
            </View>
          </View>

          {/* 达标 / 合计 / 环比：一句结论。环比原来单独占「累计」区的一行，
              现在并到这里 —— 它说的本来就是这一张图的事，而且少一行重复 */}
          {!chartEmpty ? (
            <View style={styles.row}>
              <Text style={styles.label} />
              <View style={styles.body}>
                <Text style={styles.summary}>
                  {data.target > 0
                    ? `达标 ${daysHit} 天 · 合计 ${fmt(rangeTotal)} 个词`
                    : `合计 ${fmt(rangeTotal)} 个词`}
                  {compare.percent !== null ? ` · 比上期` : ''}
                </Text>
                {compare.percent !== null ? (
                  <Text style={delta.tone === 'up' ? styles.deltaUp : styles.deltaDown}>
                    {delta.text}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

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

          {/* 「背过的词」= touchedWords（标记过 ∪ 已掌握，去重），**不是** daily 的加总 ——
              daily 只留 62 天，用它当「累计」会和下面词汇区的进度打脸（用户截图里正是如此）。
              ⚠️ R10：这一区是**活动量**（哪本书的词都算），而下面「词汇」区只按主词书算。
              两个口径都对，但必须写在界面上，否则用户会拿「背过的词 4 个」去对「整体 1 / 3」。 */}
          <View style={styles.row}>
            <Text style={styles.label}>背过的词</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {fmt(data.stats.touchedWords)}
                <Text style={styles.unit}> 个词</Text>
              </Text>
            </View>
            <Text style={styles.side}>全部词书 · 含已掌握 {fmt(data.mastered)} 个</Text>
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
              {data.stats.sinceDate ? `从 ${shortDate(data.stats.sinceDate)} 起` : '还没开始'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>连续</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {data.stats.streak}
                <Text style={styles.unit}> 天</Text>
              </Text>
            </View>
            <Text style={styles.side}>最长 {data.stats.bestStreak} 天</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>今日</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {data.stats.todayWords}
                <Text style={styles.unit}>
                  {data.target > 0 ? ` / ${data.target} 个词` : ' 个词'}
                </Text>
              </Text>
            </View>
          </View>

          {/* 活跃度时间带：30 格，有背=蓝、没背=浅灰。断签在哪一眼就能看到。
              这一行的标签用「活跃」而不是「近 30 天」—— 周期由下面那句说清 */}
          <View style={styles.row}>
            <Text style={styles.label}>活跃</Text>
            <View style={styles.body}>
              <View style={styles.activityWrap}>
                {activity.map((a) => (
                  <View
                    key={a.date}
                    style={{
                      ...styles.activityCell,
                      ...(a.active ? styles.activityOn : styles.activityOff),
                      ...(a.isToday ? styles.activityToday : null)
                    }}
                  />
                ))}
              </View>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label} />
            <View style={styles.body}>
              <Text style={styles.summary}>
                近 30 天活跃 {activeDays} 天 · 合计 {fmt(monthWords)} 个词
              </Text>
            </View>
          </View>

          {/* ================= ③ 词汇 ================= */}
          {/* 标题里写明「按哪一本算」（R10）：换过主词书之后，这一区的数字含义跟着换 */}
          <Text style={{ ...styles.section, ...styles.sectionGap }}>词汇 · 主词书 {data.mainTitle}</Text>

          {/* 主词书整体：数字行 + 进度条行，和下面三条档位**完全同构** */}
          <View style={styles.row}>
            <Text style={styles.label}>整体</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {fmt(data.overall.done)}
                <Text style={styles.unit}> / {fmt(data.overall.total)}</Text>
              </Text>
            </View>
            <Text style={styles.side}>{pct(data.overall.done, data.overall.total)}</Text>
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
              <View
                {...PRESS}
                style={{ ...styles.row, ...styles.rowGap }}
                onClick={() => openBand(b.key)}
              >
                <Text style={styles.label}>{b.label}</Text>
                <View style={styles.body}>
                  <Text style={styles.value}>
                    {fmt(b.done)}
                    <Text style={styles.unit}> / {fmt(b.total)}</Text>
                  </Text>
                </View>
                <Text style={styles.side}>{pct(b.done, b.total)}</Text>
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

          {/* 今天该复习几个（R7）：报的是**这一批领几个**（今日优先 Top N，越逾期越靠前），
              不是「今天一共欠了多少」。这是这一页唯一「能被执行」的数字，
              点它直达复习页；剩下的到期词做完这一批再回来领，不做成欠账 */}
          <View {...PRESS} style={styles.row} onClick={startReview}>
            <Text style={styles.label}>今天该复习</Text>
            <View style={styles.body}>
              {data.reviewBatch > 0 ? (
                <Text style={styles.value}>
                  {data.reviewBatch}
                  <Text style={styles.unit}> 个词</Text>
                </Text>
              ) : (
                <Text style={styles.valueQuiet}>
                  {data.vocab > 0 ? '都复习完了' : '还没有词'}
                </Text>
              )}
            </View>
            <Text style={styles.side}>
              {data.reviewBatch > 0
                ? data.reviewRest > 0
                  ? `今日优先 ${data.reviewBatch} · 下一批还有 ${data.reviewRest}`
                  : '今天的到期词就这一批'
                : nextDueText}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>

          <View {...PRESS} style={styles.row} onClick={openVocab}>
            <Text style={styles.label}>生词库</Text>
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

          {/* 主操作：有到期的词才出现（这一页的重色块只有这一个 —— 全页唯一的黑）。
              R7 起文案里的数字是**这一批**（= 上面那一行），不是今天到期的总数 */}
          {data.reviewBatch > 0 ? (
            <View {...PRESS} style={styles.cta} onClick={startReview}>
              <Text style={styles.ctaText}>开始复习 {data.reviewBatch} 个词</Text>
            </View>
          ) : null}

          {/* 生词库空了就给一句明确的下一步，而不是让几行「0 个词」干杵着 */}
          {data.vocab === 0 && data.mastered === 0 && data.reviewed === 0 ? (
            <View style={styles.row}>
              <Text style={styles.label} />
              <View style={styles.body}>
                <Text style={styles.summary}>
                  生词库是空的。在翻书页点右边的圆圈标记不会的词，它就会进到这里。
                </Text>
              </View>
            </View>
          ) : null}

          {/* ================= ⑤ 本地数据 ================= */}
          {/* 这一节回答的是「我的进度安全吗」：微信缓存上限 10MB，云同步默认没开通，
              清一次缓存几个月的进度就没了 —— 所以这里要给出占用和一条带走数据的路 */}
          <Text style={{ ...styles.section, ...styles.sectionGap }}>本地数据</Text>

          <View style={styles.row}>
            <Text style={styles.label}>缓存占用</Text>
            <View style={styles.body}>
              <Text style={styles.value}>
                {(data.usedKB / 1024).toFixed(1)}
                <Text style={styles.unit}> / {(data.limitKB / 1024).toFixed(0)} MB</Text>
              </Text>
            </View>
            <Text style={styles.side}>
              {data.usedKB / data.limitKB > 0.8 ? '快满了' : '够用'}
            </Text>
          </View>

          <View {...PRESS} style={styles.row} onClick={openBackup}>
            <Text style={styles.label}>备份 / 恢复</Text>
            <View style={styles.body}>
              <Text style={styles.valueQuiet}>换手机、清缓存前先导出</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>

          {/* ================= ⑥ 设置 ================= */}
          {/* 主词书（R10）：这是全 app 唯一的「设置」——它决定上面「词汇」那一区的口径。
              放在最后是因为它是**改配置**，不是看数据；改完这一页的数字会立刻跟着换。 */}
          <Text style={{ ...styles.section, ...styles.sectionGap }}>设置</Text>

          <View {...PRESS} style={styles.row} onClick={changeMainBook}>
            <Text style={styles.label}>主词书</Text>
            <View style={styles.body}>
              <Text className="text-break" style={styles.value}>
                {data.mainTitle}
              </Text>
            </View>
            <Text style={styles.side}>更换</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label} />
            <View style={styles.body}>
              <Text style={styles.summary}>
                高频 / 中频 / 低频、整体进度、计划和查词只按主词书算；其余词书在词书管理页里归到「归档词书」。
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <NavBar title="数据" back />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // ---------- 界面内反馈条 ----------
  notice: {
    marginBottom: '32rpx',
    paddingLeft: '24rpx',
    paddingRight: '24rpx',
    paddingTop: '20rpx',
    paddingBottom: '20rpx',
    borderRadius: '16rpx',
    backgroundColor: COLOR.dangerFill,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  noticeText: {
    flex: 1,
    fontSize: FONT.pageNo,
    lineHeight: '34rpx',
    color: COLOR.dangerText
  },
  // 「知道了」= 可点区域 88rpx（负外边距还回布局，行高不变）
  noticeBtn: {
    flexShrink: 0,
    marginLeft: '16rpx',
    marginTop: '-32rpx',
    marginBottom: '-32rpx',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    paddingLeft: '16rpx'
  },
  noticeBtnText: {
    fontSize: FONT.pageNo,
    color: COLOR.dangerText
  },

  // ---------- 分区标题：左侧一道朱砂短线，像手帐里划的栏目 ----------
  section: {
    fontFamily: FONT_STACK.cn,
    fontSize: '32rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: COLOR.onGround,
    paddingLeft: '16rpx',
    borderLeft: `5rpx solid ${COLOR.marigold}`,
    lineHeight: '30rpx',
    marginBottom: '18rpx'
  },
  sectionGap: {
    marginTop: '48rpx'
  },
  // 标题和它自己的切换控件同一行（左右两端对齐）
  sectionRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16rpx'
  },

  // ---------- 一套栅格：标签列 150rpx + 值列 ----------
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: '66rpx',
    paddingTop: '12rpx',
    paddingBottom: '12rpx'
  },
  // 组与组之间空一档（比如每个词频档的「数字行 + 图形行」算一组）
  rowGap: {
    marginTop: '16rpx'
  },
  label: {
    flexShrink: 0,
    width: '150rpx',
    fontSize: '21rpx',
    letterSpacing: '1rpx',
    color: COLOR.onGroundSoft
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  value: {
    fontFamily: FONT_STACK.serif,
    fontSize: '42rpx',
    lineHeight: '50rpx',
    color: COLOR.onGround
  },
  /** 值位置上的说明性文字（「都复习完了」这种），比数字轻 */
  valueQuiet: {
    fontSize: FONT.meta,
    color: COLOR.onGroundSoft
  },
  unit: {
    fontSize: FONT.pageNo,
    color: COLOR.onGroundSoft
  },
  side: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.onGroundSoft
  },
  // 环比「变多」：绿（项目里正向的语义色，就是「已掌握」药丸那个绿，比它深一档保证对比度）
  deltaUp: {
    flexShrink: 0,
    marginLeft: '8rpx',
    fontSize: FONT.pageNo,
    color: COLOR.pillDoneText
  },
  // 环比「变少」：**灰，不是红** —— 少背几天不是错误，红只留给危险（军纪 5）
  deltaDown: {
    flexShrink: 0,
    marginLeft: '8rpx',
    fontSize: FONT.pageNo,
    color: COLOR.onGroundSoft
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
    color: COLOR.onGroundSoft
  },

  // ---------- 7 / 30 天切换 ----------
  switchRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  // 两颗胶囊之间的间距（热区由 components/chip.tsx 保证 88rpx）
  switchChip: {
    marginLeft: '16rpx'
  },

  // ---------- 节奏图 ----------
  chartBox: {
    flex: 1
  },
  // 空状态：不画柱子，给一句引导（高度和图形区对齐，页面不会跳）
  chartEmptyBox: {
    flex: 1,
    height: `${BAR_MAX}rpx`,
    display: 'flex',
    alignItems: 'center'
  },
  chartEmptyText: {
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.onGroundSoft
  },
  // 一行灰色摘要：日期区间 / 目标 / 速度 / 达标 / 环比 —— 图里不再塞任何标注
  summary: {
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.onGroundSoft
  },
  // 图形区：上方给柱顶数字留 BAR_LABEL_ROOM，底线画在这里（柱子站在线上）
  chart: {
    marginTop: `${BAR_LABEL_ROOM}rpx`,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: '2rpx',
    borderBottomStyle: 'solid',
    borderBottomColor: COLOR.track
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
  // 柱槽：宽度由调用方给（7 天 40rpx / 30 天 14rpx），高度撑满图形区。
  // 两根柱子都绝对定位贴底 —— 这样它们**共用同一条底线**，没做到的部分自然露出来。
  barSlot: {
    height: `${BAR_MAX}rpx`,
    position: 'relative'
  },
  // 柱顶数值：绝对定位在柱子上方 8rpx 处，左右各外扩 20rpx 给三位数留位置
  barLabelWrap: {
    position: 'absolute',
    left: '-20rpx',
    right: '-20rpx',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center'
  },
  barLabel: {
    fontSize: '20rpx',
    lineHeight: '26rpx',
    color: COLOR.onGroundSoft
  },
  // 目标底柱：图表专用的灰（不再复用箭头色，见 theme.ts 的 chartGhost）
  ghostBar: {
    position: 'absolute',
    left: '0rpx',
    right: '0rpx',
    bottom: '0rpx',
    borderRadius: '8rpx',
    backgroundColor: 'rgba(18, 49, 45, 0.07)'
  },
  // 实际柱：蓝色（全页唯一的彩色），压在底柱上面
  chartBar: {
    position: 'absolute',
    left: '0rpx',
    right: '0rpx',
    bottom: '0rpx',
    borderRadius: '8rpx',
    backgroundColor: COLOR.progress,
    boxShadow: '0 4rpx 10rpx rgba(210, 65, 29, 0.24)'
  },
  // 7 天：和柱子同列的等宽 7 格，每格居中一个字（**不能**用 space-between，会错位）
  footRow: {
    marginTop: '12rpx',
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
    marginTop: '12rpx',
    height: '28rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  day: {
    fontSize: '20rpx',
    lineHeight: '28rpx',
    color: COLOR.onGroundSoft
  },
  dayOn: {
    fontSize: '20rpx',
    lineHeight: '28rpx',
    fontWeight: '700',
    color: COLOR.onGround
  },

  // ---------- 活跃度时间带：30 个细格，有背=蓝、没背=浅灰 ----------
  activityWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  activityCell: {
    width: '14rpx',
    height: '14rpx',
    borderRadius: '4rpx'
  },
  activityOn: {
    backgroundColor: COLOR.progress
  },
  activityOff: {
    backgroundColor: COLOR.track
  },
  // 今天那一格：加一圈描边，一眼定位「我在哪」
  activityToday: {
    borderWidth: '2rpx',
    borderStyle: 'solid',
    borderColor: COLOR.text
  },

  // ---------- 进度条：4rpx 发丝级，全页唯一彩色 ----------
  barTrack: {
    flex: 1,
    height: '4rpx',
    borderRadius: '2rpx',
    backgroundColor: COLOR.track,
    overflow: 'hidden'
  },
  barFill: {
    height: '4rpx',
    borderRadius: '2rpx',
    backgroundColor: COLOR.progress
  },

  // ---------- 主操作：全页唯一的黑 ----------
  cta: {
    marginTop: '32rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '96rpx',
    borderRadius: '6rpx',
    backgroundColor: COLOR.black
  },
  ctaText: {
    fontSize: '30rpx',
    fontWeight: '600',
    color: COLOR.onDark
  }
}
