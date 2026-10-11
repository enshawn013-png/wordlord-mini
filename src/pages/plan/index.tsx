import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { NavBar } from '../../components/nav-bar'
import { BUILTIN_BOOK, BUILTIN_BOOK_ID, LEVELS, LevelKey, levelLabel } from '../../data/words'
import { bookTitle } from '../../store/books'
import {
  addDaysToDate,
  bookScope,
  clearPlan,
  daysUntil,
  getPlanStatus,
  getUploadBooks,
  loadTodayCounts,
  PlanStatus,
  setPlan,
  shortDate,
  todayISO
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx } from '../../utils/metrics'

/**
 * 「计划」：**在某个日期前背完某本书的某一档**，或者**每天背固定多少个**。
 *
 * ## 两种模式（用户要求「可以自行选择每天背多少个」）
 *
 * | 模式 | 你定什么 | 它算什么 | 存进计划的 |
 * | --- | --- | --- | --- |
 * | 按日期 | 目标日期 | 每天要背几个 | `deadline`，`perDay = 0` |
 * | 按每天数量 | 每天背几个 | 哪天能背完 | `perDay`，`deadline = ''` |
 *
 * 只存**一个驱动量**，另一个永远现算 —— 不会出现「日期和每天的量互相矛盾」。
 * 「今天够了吗」「领先还是落后」两种模式都有，只是「应完成」的算法不同：
 * 按日期是把要补的量按日期线性铺开；按每天数量是 `起点 + 每天的量 × 已过天数`。
 *
 * ## 2026-10 第三轮：先修「不合理」，再修「不好看」
 *
 * 用户的截图里最刺眼的不是样式，而是**「每天 59 个词」+「还差 47 个」**：
 * 30 天背 1824 词本来就不现实，页面还每天给人一次挫败。所以这轮做了三件事：
 *
 * 1. **可行性提示 + 一键放宽**：每天要背超过 `HEAVY_PER_DAY` 就直说「这个量偏大」，
 *    并给一颗按钮一键调到 `COMFORT_PER_DAY` 个/天（自动算好新的日期 / 新的每天量）；
 *    建计划的表单里也有同样的提示。**「把每日目标设为 59 个词」那个按钮删了** ——
 *    在目标不合理的时候，它是在教用户做一件做不到的事（每日目标在主界面「今日」那行能改）。
 * 2. **删冗余行**：原来「已掌握 4 / 1824」下面还有一行「还剩 1820 个词」，是同一件事；
 *    「起点 4」这种术语用户也看不懂 —— 都去掉（起点的影响已经体现在「领先/落后」里）。
 * 3. **严格对齐的表**：`进度 / 今天 / 节奏 / 预计` 共用一条 144rpx 的标签列，
 *    图形行走同一套栅格、标签列留空占位；两条进度都缩进到值列。
 *    进度条 4rpx 发丝级（和封面同一套），蓝色只表示进度。
 *
 * 另外 `setPlan()` 现在**同一本书同一档会保留起点和分母**：用户是在「调整」（改日期 /
 * 改每天的量），不是「重开」——否则调一次日期，领先/落后就归零、历史全丢。
 *
 * ⚠️ 所有**文案里的日期**都走 `shortDate()`：预测出来的完成日期很容易跨年，
 * 只写 `03-12` 会被读成「今年 3 月」（那是过去）。
 */

/** 每天要背超过这个数就提示「偏大」（背单词的常识区间，不是官方数字） */
const HEAVY_PER_DAY = 40
/** 提示里一键放宽到的目标（每天多少个） */
const COMFORT_PER_DAY = 30
/** 按日期模式的快捷截止日（天） */
const PRESETS = [7, 14, 30, 60]
/** 按每天数量模式的常用值（点一下就填进输入框，输入框仍可随便改） */
const PER_DAY_PRESETS = [10, 20, 30, 40, 50]

type Mode = 'date' | 'perDay'
type Tone = 'good' | 'bad' | 'muted'

/** 按「每天 N 个」算还需要几天、哪天完 */
function planByPerDay(remaining: number, perDay: number): { days: number; date: string } {
  if (remaining <= 0 || perDay <= 0) return { days: 0, date: '' }
  const days = Math.ceil(remaining / perDay)
  return { days, date: addDaysToDate(todayISO(), days) }
}

/** 「今天够了吗」：够 = 绿，不够 = 红 */
function todayState(s: PlanStatus, todayWords: number): { text: string; tone: Tone } {
  if (s.finished) return { text: '不用背了', tone: 'good' }
  if (s.perDay <= 0) return { text: '', tone: 'muted' }
  const rest = s.perDay - todayWords
  return rest <= 0 ? { text: '已达成', tone: 'good' } : { text: `还差 ${rest} 个`, tone: 'bad' }
}

/** 「照这个速度来不来得及」——只在预测基于实际速度时才有意义 */
function etaState(s: PlanStatus): { text: string; tone: Tone } {
  if (s.finished) return { text: '已完成', tone: 'good' }
  if (!s.etaDate) return { text: '', tone: 'muted' }
  if (s.etaLateDays > 0) return { text: `会晚 ${s.etaLateDays} 天`, tone: 'bad' }
  if (s.etaLateDays < 0) return { text: `能提前 ${-s.etaLateDays} 天`, tone: 'good' }
  return { text: '正好赶上', tone: 'good' }
}

export default function PlanScreen() {
  const [status, setStatus] = useState<PlanStatus | null>(() => getPlanStatus())
  const [todayWords, setTodayWords] = useState<number>(() => loadTodayCounts().wordCount)
  const [books, setBooks] = useState(() => getUploadBooks())
  /** 改计划时临时回到表单（复用同一套 UI，不写两遍） */
  const [editing, setEditing] = useState(false)

  // 表单草稿
  const [mode, setMode] = useState<Mode>('date')
  const [bookId, setBookId] = useState(BUILTIN_BOOK_ID)
  const [level, setLevel] = useState<LevelKey>('all')
  const [deadline, setDeadline] = useState(() => addDaysToDate(todayISO(), 30))
  const [perDayDraft, setPerDayDraft] = useState('20')

  const refresh = () => {
    setStatus(getPlanStatus())
    setTodayWords(loadTodayCounts().wordCount)
    setBooks(getUploadBooks())
  }
  useDidShow(refresh)

  const draftScope = bookScope(bookId, level)
  const draftRemain = Math.max(draftScope.total - draftScope.done, 0)
  const draftPerDayNum = Math.max(Number(perDayDraft) || 0, 0)
  // 按日期模式：天数 → 每天几个；按每天数量模式：每天几个 → 哪天背完
  const dateModeDays = Math.max(daysUntil(deadline), 0) + 1
  const dateModePerDay = draftRemain > 0 ? Math.ceil(draftRemain / dateModeDays) : 0
  const draftEta = planByPerDay(draftRemain, draftPerDayNum)
  // 表单里的可行性：两种模式都可能「每天太多」
  const draftHeavyPerDay = mode === 'date' ? dateModePerDay : draftPerDayNum
  const draftHeavy = draftHeavyPerDay > HEAVY_PER_DAY
  // 一键放宽：按日期模式改日期，按每天数量模式改每天的量
  const comfortEta = planByPerDay(draftRemain, COMFORT_PER_DAY)
  const draftRelaxLabel =
    mode === 'date'
      ? `改成 ${shortDate(comfortEta.date)}（每天 ${COMFORT_PER_DAY} 个）`
      : `改成每天 ${COMFORT_PER_DAY} 个（${shortDate(comfortEta.date)} 背完）`

  /** 选词书：系统 ActionSheet，界面里不占位置 */
  const chooseBook = () => {
    const list = [BUILTIN_BOOK.title, ...books.map((b) => b.title)]
    Taro.showActionSheet({ itemList: list })
      .then((res) => {
        if (typeof res.tapIndex !== 'number') return
        setBookId(res.tapIndex === 0 ? BUILTIN_BOOK_ID : books[res.tapIndex - 1].id)
      })
      .catch(() => undefined) // 取消
  }

  /** 选档位：也走 ActionSheet（四个选项，不值得为它再加一排胶囊） */
  const chooseLevel = () => {
    Taro.showActionSheet({ itemList: LEVELS.map((l) => l.label) })
      .then((res) => {
        if (typeof res.tapIndex !== 'number') return
        setLevel(LEVELS[res.tapIndex].key)
      })
      .catch(() => undefined)
  }

  const handlePerDayInput = (e: { detail: { value: string } }) => {
    setPerDayDraft(
      String(e.detail.value || '')
        .replace(/[^\d]/g, '')
        .slice(0, 3)
    )
  }

  const createPlan = () => {
    if (mode === 'perDay' && draftPerDayNum <= 0) {
      Taro.showToast({ title: '先填每天背多少个', icon: 'none' })
      return
    }
    setPlan(bookId, level, mode === 'date' ? deadline : '', mode === 'perDay' ? draftPerDayNum : 0)
    refresh()
    setEditing(false)
  }

  /** 表单里的一键放宽 */
  const relaxDraft = () => {
    if (!comfortEta.date) return
    if (mode === 'date') setDeadline(comfortEta.date)
    else setPerDayDraft(String(COMFORT_PER_DAY))
  }

  /** 改计划：把表单预填成当前计划的样子（含模式） */
  const startEdit = () => {
    if (status) {
      setBookId(status.plan.bookId)
      setLevel(status.plan.level)
      if (status.plan.perDay > 0) {
        setMode('perDay')
        setPerDayDraft(String(status.plan.perDay))
      } else {
        setMode('date')
        setDeadline(status.plan.deadline)
      }
    }
    setEditing(true)
  }

  const endPlan = () => {
    Taro.showModal({
      title: '结束计划',
      content: '计划会删掉，已经背过的词和标记都不受影响，随时可以再定一个。',
      confirmText: '结束',
      confirmColor: COLOR.danger,
      cancelText: '再想想'
    })
      .then((res) => {
        if (!res.confirm) return
        clearPlan()
        setStatus(null)
        setEditing(false)
      })
      .catch(() => undefined)
  }

  /** 一键放宽（进度页）：按每天 COMFORT_PER_DAY 个重排 */
  const relaxPlan = () => {
    if (!status) return
    const eta = planByPerDay(status.remaining, COMFORT_PER_DAY)
    if (!eta.date) return
    if (status.plan.perDay > 0) setPlan(status.plan.bookId, status.plan.level, '', COMFORT_PER_DAY)
    else setPlan(status.plan.bookId, status.plan.level, eta.date, 0)
    refresh()
    Taro.showToast({ title: `已改成每天 ${COMFORT_PER_DAY} 个`, icon: 'none' })
  }

  /** 一键开背：直接进这本书这一档的翻书页（不用再走 词书列表 → 档次 两层） */
  const startReading = () => {
    if (!status) return
    Taro.navigateTo({
      url: `/pages/reader/index?bookId=${status.plan.bookId}&level=${status.plan.level}`
    })
  }

  const navH = navBarHeightPx()
  const page = {
    paddingTop: `${navH + topGapPx()}px`,
    paddingBottom: `${bottomSafePx() + rpxToPx(24)}px`
  }
  const showForm = !status || editing
  const tone = (t: Tone): CSSProperties =>
    t === 'good' ? styles.good : t === 'bad' ? styles.bad : styles.muted
  const pct = (value: number, total: number) =>
    total > 0 ? `${Math.min(Math.round((value / total) * 100), 100)}%` : '0%'

  // 进度页的派生量
  const s = status
  const basisText = s
    ? s.etaByPlan
      ? `按每天 ${s.plan.perDay > 0 ? s.plan.perDay : s.perDay} 个`
      : `每天约 ${s.avgPerDay} 个`
    : ''
  const heavy = Boolean(s && !s.finished && !s.bookMissing && s.perDay > HEAVY_PER_DAY)
  const relaxEta = s ? planByPerDay(s.remaining, COMFORT_PER_DAY) : { days: 0, date: '' }
  const relaxLabel = s
    ? s.plan.perDay > 0
      ? `改成每天 ${COMFORT_PER_DAY} 个`
      : `改成 ${shortDate(relaxEta.date)}（每天 ${COMFORT_PER_DAY} 个）`
    : ''

  return (
    <View style={STYLE.container}>
      <ScrollView scrollY style={STYLE.list}>
        <View style={page}>
          <View className="glass glass-card" style={styles.card}>
            {showForm ? (
              /* ---------------- 建立 / 修改计划 ---------------- */
              <>
                <Text style={styles.title}>{editing ? '改计划' : '定个计划'}</Text>
                <Text style={styles.sub}>选词书、范围和节奏，之后每天回来看进度</Text>

                <View {...PRESS} style={styles.formRow} onClick={chooseBook}>
                  <Text style={styles.rowLabel}>要背完</Text>
                  <Text className="text-break" style={styles.rowValue}>
                    {bookTitle(bookId)}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </View>

                <View {...PRESS} style={styles.formRow} onClick={chooseLevel}>
                  <Text style={styles.rowLabel}>范围</Text>
                  <Text style={styles.rowValue}>{levelLabel(level)}</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>

                {/* 模式：定日期还是定每天的量。两个胶囊切换，不藏在下拉里 */}
                <View style={styles.formRow}>
                  <Text style={styles.rowLabel}>怎么背</Text>
                  <View style={styles.modeRow}>
                    {(['date', 'perDay'] as Mode[]).map((m) => {
                      const on = mode === m
                      return (
                        <View
                          key={m}
                          {...PRESS}
                          className={on ? undefined : 'glass glass-pill'}
                          style={{ ...styles.modeChip, ...(on ? styles.chipOn : null) }}
                          onClick={() => setMode(m)}
                        >
                          <Text style={on ? styles.chipOnText : styles.chipText}>
                            {m === 'date' ? '按日期' : '按每天数量'}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </View>

                {mode === 'date' ? (
                  <>
                    <Picker
                      mode="date"
                      value={deadline}
                      start={todayISO()}
                      onChange={(e) => setDeadline(String(e.detail.value))}
                    >
                      <View style={styles.formRow}>
                        <Text style={styles.rowLabel}>背完日期</Text>
                        <Text style={styles.rowValue}>{deadline}</Text>
                        <Text style={styles.rowSide}>{Math.max(daysUntil(deadline), 0)} 天后</Text>
                        <Text style={styles.chevron}>›</Text>
                      </View>
                    </Picker>

                    {/* 常用时长：点一下就把日期设成「N 天后」 */}
                    <View style={styles.chipRow}>
                      {PRESETS.map((n) => {
                        const value = addDaysToDate(todayISO(), n)
                        const on = value === deadline
                        return (
                          <View
                            key={n}
                            {...PRESS}
                            className={on ? undefined : 'glass glass-pill'}
                            style={{ ...styles.chip, ...(on ? styles.chipOn : null) }}
                            onClick={() => setDeadline(value)}
                          >
                            <Text style={on ? styles.chipOnText : styles.chipText}>{n} 天</Text>
                          </View>
                        )
                      })}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.formRow}>
                      <Text style={styles.rowLabel}>每天背</Text>
                      <View style={styles.inputBox}>
                        <Input
                          style={styles.input}
                          type="number"
                          value={perDayDraft}
                          placeholder="20"
                          placeholderStyle="color: #C7C7CD"
                          onInput={handlePerDayInput}
                        />
                      </View>
                      <Text style={styles.rowSide}>个词</Text>
                    </View>

                    {/* 常用量（都是能坚持下来的区间）：点一下就填进输入框 */}
                    <View style={styles.chipRow}>
                      {PER_DAY_PRESETS.map((n) => {
                        const on = draftPerDayNum === n
                        return (
                          <View
                            key={n}
                            {...PRESS}
                            className={on ? undefined : 'glass glass-pill'}
                            style={{ ...styles.chip, ...(on ? styles.chipOn : null) }}
                            onClick={() => setPerDayDraft(String(n))}
                          >
                            <Text style={on ? styles.chipOnText : styles.chipText}>{n}</Text>
                          </View>
                        )
                      })}
                    </View>
                  </>
                )}

                {/* 预览：这一行是这张卡里最大的字 */}
                <View style={styles.previewBlock}>
                  <Text style={styles.preview}>
                    {mode === 'date'
                      ? `每天 ${dateModePerDay} 个词`
                      : draftEta.date
                        ? `预计 ${shortDate(draftEta.date)} 背完`
                        : '每天 0 个词'}
                  </Text>
                  <Text style={styles.previewSub}>
                    {mode === 'date'
                      ? `还剩 ${draftRemain} 个词 · ${dateModeDays} 天`
                      : `每天 ${draftPerDayNum} 个词 · 还剩 ${draftRemain} 个词`}
                  </Text>
                </View>

                {/* 可行性：先说清「这个量偏大」，再给一键放宽 */}
                {draftHeavy && draftRemain > 0 ? (
                  <View style={styles.tipBlock}>
                    <Text style={styles.tipText}>
                      每天 {draftHeavyPerDay} 个偏大，容易坚持不下来
                    </Text>
                    <View
                      {...PRESS}
                      className="glass glass-pill"
                      style={styles.tipBtn}
                      onClick={relaxDraft}
                    >
                      <Text style={styles.tipBtnText}>{draftRelaxLabel}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              /* ---------------- 计划进度 ---------------- */
              <>
                <View style={styles.headRow}>
                  <Text className="text-break" style={styles.title}>
                    {bookTitle(s!.plan.bookId)} · {levelLabel(s!.plan.level)}
                  </Text>
                  <Text style={styles.headSide}>
                    {s!.bookMissing
                      ? '词书不在了'
                      : s!.finished
                        ? '已完成'
                        : s!.expired
                          ? '已过期'
                          : s!.hasDeadline
                            ? `剩 ${s!.daysLeft} 天`
                            : `每天 ${s!.perDay} 个`}
                  </Text>
                </View>
                <Text style={styles.sub}>
                  {s!.hasDeadline
                    ? `${shortDate(s!.plan.startedAt)} → ${shortDate(s!.plan.deadline)}`
                    : `${shortDate(s!.plan.startedAt)} 开始 · 每天 ${s!.perDay} 个词`}
                </Text>

                {/* 严格对齐的表：标签列 144rpx，图形行留空占位，两条进度都缩进到值列 */}
                <View style={styles.tableRow}>
                  <Text style={styles.rowLabel}>进度</Text>
                  <Text style={styles.rowValue}>
                    {s!.done}
                    <Text style={styles.rowUnit}> / {s!.scopeTotal}</Text>
                  </Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.rowLabel} />
                  <View style={styles.rowBarWrap}>
                    <View style={styles.barTrack}>
                      <View style={{ ...styles.barFill, width: pct(s!.done, s!.scopeTotal) }} />
                    </View>
                  </View>
                </View>

                <View style={{ ...styles.tableRow, ...styles.rowGap }}>
                  <Text style={styles.rowLabel}>今天</Text>
                  <Text style={styles.rowValue}>
                    {todayWords}
                    <Text style={styles.rowUnit}>
                      {s!.perDay > 0 ? ` / ${s!.perDay} 个词` : ' 个词'}
                    </Text>
                  </Text>
                  <Text style={tone(todayState(s!, todayWords).tone)}>
                    {todayState(s!, todayWords).text}
                  </Text>
                </View>
                {s!.perDay > 0 ? (
                  <View style={styles.tableRow}>
                    <Text style={styles.rowLabel} />
                    <View style={styles.rowBarWrap}>
                      <View style={styles.barTrack}>
                        <View style={{ ...styles.barFill, width: pct(todayWords, s!.perDay) }} />
                      </View>
                    </View>
                  </View>
                ) : null}

                <View style={{ ...styles.tableRow, ...styles.rowGap }}>
                  <Text style={styles.rowLabel}>节奏</Text>
                  <Text style={styles.rowMuted}>
                    {s!.finished ? '不用再背' : `每天 ${s!.perDay} 个词`}
                  </Text>
                  {!s!.finished && s!.gap !== 0 ? (
                    <Text style={s!.gap > 0 ? styles.good : styles.bad}>
                      {s!.gap > 0 ? '领先' : '落后'} {Math.abs(s!.gap)} 个词
                    </Text>
                  ) : null}
                </View>

                <View style={styles.tableRow}>
                  <Text style={styles.rowLabel}>预计</Text>
                  <Text style={styles.rowMuted}>
                    {s!.etaDate ? `${shortDate(s!.etaDate)} 背完（${basisText}）` : '—'}
                  </Text>
                  {/* 「会晚 / 能提前」只在预测基于**实际速度**、且定了目标日期时才显示 ——
                      按日期模式如果没数据、拿计划自己的节奏预测，数学上必然「正好赶上」，那是废话 */}
                  {s!.etaDate && s!.hasDeadline && !s!.etaByPlan ? (
                    <Text style={tone(etaState(s!).tone)}>{etaState(s!).text}</Text>
                  ) : null}
                </View>

                {/* 可行性：目标不合理时直说，并给一键放宽 */}
                {heavy && relaxEta.date ? (
                  <View style={styles.tipBlock}>
                    <Text style={styles.tipText}>
                      每天 {s!.perDay} 个偏大，容易坚持不下来
                    </Text>
                    <View
                      {...PRESS}
                      className="glass glass-pill"
                      style={styles.tipBtn}
                      onClick={relaxPlan}
                    >
                      <Text style={styles.tipBtnText}>{relaxLabel}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* 操作区：主操作一个，其余退成文字链接 */}
          {showForm ? (
            <>
              <View {...PRESS} style={styles.primary} onClick={createPlan}>
                <Text style={styles.primaryText}>{editing ? '保存计划' : '开始计划'}</Text>
              </View>
              {editing ? (
                <View {...PRESS} style={styles.textBtn} onClick={() => setEditing(false)}>
                  <Text style={styles.textBtnText}>取消</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              {s!.bookMissing || s!.finished ? (
                <View {...PRESS} style={styles.primary} onClick={endPlan}>
                  <Text style={styles.primaryText}>结束计划</Text>
                </View>
              ) : (
                <View {...PRESS} style={styles.primary} onClick={startReading}>
                  <Text style={styles.primaryText}>继续背这本书</Text>
                </View>
              )}
              <View style={styles.footRow}>
                <View {...PRESS} style={styles.textBtn} onClick={startEdit}>
                  <Text style={styles.textBtnText}>改计划</Text>
                </View>
                {s!.bookMissing || s!.finished ? null : (
                  <View {...PRESS} style={styles.textBtn} onClick={endPlan}>
                    <Text style={styles.dangerText}>结束计划</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <NavBar title="计划" back />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 唯一的卡：内边距 44rpx（比列表卡大），一屏通常只有这一张
  card: {
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingLeft: '44rpx',
    paddingRight: '44rpx',
    paddingTop: '44rpx',
    paddingBottom: '44rpx',
    display: 'flex',
    flexDirection: 'column'
  },
  title: {
    flex: 1,
    fontSize: '32rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  sub: {
    marginTop: '10rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  headRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headSide: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },

  // 表单行：标签列 + 值 + 备注 + 箭头；整行 ≥88rpx 热区，行距靠 padding
  formRow: {
    marginTop: '8rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: '26rpx',
    paddingBottom: '26rpx'
  },
  // 表格行：只做对齐，不做热区（不可点），行距紧凑成组
  tableRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: '8rpx',
    paddingBottom: '8rpx'
  },
  // 两组之间空一档（进度组 / 今天组 / 节奏组分开）
  rowGap: {
    marginTop: '24rpx'
  },
  rowLabel: {
    flexShrink: 0,
    width: '144rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  rowValue: {
    flex: 1,
    fontSize: FONT.definition,
    color: COLOR.text
  },
  rowUnit: {
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  rowMuted: {
    flex: 1,
    fontSize: FONT.meta,
    lineHeight: '34rpx',
    color: COLOR.body
  },
  rowSide: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  // 值列里的图形行（进度条缩进到这里）
  rowBarWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
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
  muted: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  chevron: {
    flexShrink: 0,
    marginLeft: '12rpx',
    fontSize: '34rpx',
    lineHeight: '34rpx',
    color: COLOR.chevron
  },

  // 模式切换：两个胶囊并排
  modeRow: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  modeChip: {
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
  chip: {
    minWidth: '104rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '16rpx',
    marginBottom: '8rpx',
    paddingLeft: '24rpx',
    paddingRight: '24rpx',
    paddingTop: '16rpx',
    paddingBottom: '16rpx',
    borderRadius: '26rpx'
  },
  chipRow: {
    marginTop: '8rpx',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  chipText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  chipOnText: {
    fontSize: FONT.meta,
    color: COLOR.onDark
  },
  // 「每天背」的输入框：浅灰底小方块，和生词本页那个一致
  inputBox: {
    width: '160rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: '16rpx',
    paddingRight: '16rpx',
    paddingTop: '12rpx',
    paddingBottom: '12rpx',
    borderRadius: '20rpx',
    backgroundColor: COLOR.fill
  },
  input: {
    flex: 1,
    height: '40rpx',
    fontSize: '32rpx',
    lineHeight: '40rpx',
    color: COLOR.text,
    textAlign: 'center'
  },

  // 预览块：和上面的表单行用一档空白隔开（**不画分割线** —— 这一页的分区靠留白，
  // 和封面同一套规矩），里面是这张卡最大的字
  previewBlock: {
    marginTop: '36rpx'
  },
  preview: {
    fontSize: '52rpx',
    lineHeight: '68rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  previewSub: {
    marginTop: '8rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },

  // 可行性提示：一句实话 + 一颗一键放宽的胶囊
  tipBlock: {
    marginTop: '28rpx',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start'
  },
  tipText: {
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.dangerText
  },
  tipBtn: {
    marginTop: '16rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '72rpx',
    paddingLeft: '28rpx',
    paddingRight: '28rpx',
    borderRadius: '36rpx'
  },
  tipBtnText: {
    fontSize: FONT.meta,
    color: COLOR.text
  },

  // 进度条：4rpx 发丝级（和封面同一套），蓝色只表示进度
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
  },

  // 主操作：黑底胶囊
  primary: {
    marginTop: '32rpx',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '96rpx',
    borderRadius: '48rpx',
    backgroundColor: COLOR.black
  },
  primaryText: {
    fontSize: '32rpx',
    fontWeight: '600',
    color: COLOR.onDark
  },
  footRow: {
    marginTop: '16rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  textBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    paddingLeft: '40rpx',
    paddingRight: '40rpx',
    marginTop: '-20rpx',
    marginBottom: '-20rpx'
  },
  textBtnText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  dangerText: {
    fontSize: FONT.meta,
    color: COLOR.dangerText
  }
}
