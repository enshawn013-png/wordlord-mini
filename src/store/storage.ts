import Taro from '@tarojs/taro'
import { ALL_WORDS, BUILTIN_BOOK_ID, LevelKey, Word, wordsOfLevel } from '../data/words'
import { emitChange } from './events'

/**
 * 本地持久化层：用微信本地缓存替代原 RN 版的 expo-sqlite。
 *
 * 所有学习进度都以「单词本身」为 key（而不是词表下标），这样同一个词在内置
 * 词书和上传的词书之间共享进度；换词书也不会串数据。
 *
 * 上传的词书每本单独存一个 key：微信单个 key 上限 1MB，混在一个数组里几本
 * 大词书就超了。
 */

const PROGRESS_KEY = 'wordlord_progress_v3'
const MASTERED_KEY = 'wordlord_mastered_v3'
const UPLOAD_INDEX_KEY = 'wordlord_upload_index_v3'
const uploadBookKey = (id: string) => `wordlord_upload_book_v3_${id}`
const STATE_KEY = 'wordlord_state_v3'

/**
 * word -> 最近一次「标记 +1」的时间戳（毫秒）。**只存本地，不上云。**
 *
 * 两个用途，都是用户 2026-10 提的：
 * 1. 「开始复习 N 个」时**优先挑刚在翻书页标记的词**；
 * 2. 「随机抽查」时给最近标记 / 复习过的词一点点概率加成。
 *
 * 老数据没有这张表 → 读出来是 0（= 不知道什么时候标的），排序时排最后。
 * 标记被减到 0 / 被移除时这里不清：那个词已经不在生词库里，留着这份时间戳无害，
 * 下次再标记它会被刷新。
 */
const MARKED_AT_KEY = 'wordlord_marked_at_v1'

/** 标记圆圈的满级次数 */
const MAX_MARK = 7

// ---------- 考试锚点 + 第一轮缓冲期（用户 2026-11 定的硬约束）----------

/**
 * 考试日期：2026-12-12（六级）。计划页可改（万一推迟/改报），默认就是它。
 *
 * 它是**计划页的锚点**，不是另一个「每日目标」：首页 / 数据页的目标始终是 `DAILY_GOAL`，
 * 这里只回答「离考试还有几天」和「第一轮最晚哪天必须刷完」。
 */
export const DEFAULT_EXAM_DATE = '2026-12-12'

/**
 * 第一轮必须刷完的日期：**2026-12-02**（考前 10 天缓冲）。
 *
 * ⚠️ 这是硬约束，不跟着考试日期漂：不管用户把考试日期改成哪天，
 * 「第一轮完成日期不得晚于 2026-12-02」这条规则都不变（用户 2026-11 明确要求）。
 * 任何「自动建议」（改日期 / 放宽每天的量 / 计划推算出的完成日）一旦越过它，
 * 一律拒绝并给替代方案 —— 见 `checkBuffer()` / `planAdvice()`。
 */
export const FIRST_ROUND_DEADLINE = '2026-12-02'

/** 考前缓冲天数（第一轮和考试之间要留的天数）；计划页用它解释 12-02 是怎么来的 */
export const EXAM_BUFFER_DAYS = 10

/**
 * 圆圈填充色，按 mark_count 从浅到深。
 * 共 6 档，mark_count 6 和 7 都用最深的红色。
 *
 * ⚠️ 2026-10 把第 1 档从最浅的灰 `#E5E5EA`（对白底 1.2:1）换成**淡蓝** `#CFE3FF`：
 * 灰得太浅，和「没标记」（透明底 + 灰描边）几乎分不出来，用户标了一次却没有反馈感。
 * 淡蓝既是明确的「动过手」，也顺着第 2 档的蓝往下走 → 浅蓝/蓝/黄/橙/红/深红
 * 是一条「越来越熟」的阶梯。
 */
const MARK_COLORS = ['#F2D8CE', '#EDB9A6', '#E89578', '#DF704D', '#D94A23', '#9E321B']

/**
 * 每档填充色上的数字颜色。
 * 浅底（浅灰 / 黄 / 橙）用主文字色，深底（蓝 / 红 / 深红）用白色，保证对比度。
 */
const MARK_TEXT_COLORS = ['#1B1B18', '#1B1B18', '#1B1B18', '#1B1B18', '#FFFFFF', '#FFFFFF']

/** mark_count(0..7) 对应第几档颜色；0 也按第 1 档算，用 markCount > 0 判断是否填充 */
function markColorIndex(markCount: number): number {
  return Math.min(Math.max(markCount, 1), MARK_COLORS.length) - 1
}

export function markColor(markCount: number): string {
  return MARK_COLORS[markColorIndex(markCount)]
}

export function markTextColor(markCount: number): string {
  return MARK_TEXT_COLORS[markColorIndex(markCount)]
}

// ---------- progress: word -> markCount(1..7)，0 不落存储 ----------

/**
 * ⚠️ 性能（2026-11）：本地读取加一层内存缓存。
 *
 * 一次首页加载会连着读 progress / mastered / state / reviewLog… 十几个 key，
 * 每个 `Taro.getStorageSync` 都是一次**同步跨桥**，在低端机上叠起来就是「点进来先卡半秒」。
 * 缓存策略：读到就存；**任何一次写入都把该 key 的缓存丢掉**，
 * 保证「写完再读」一定读到新值，不会出现界面和磁盘不一致。
 * 缓存的是同一个对象引用，所以「取出 → 改 → 写回」的老写法照样成立。
 */
const jsonCache = new Map<string, unknown>()

function readJson<T>(key: string, fallback: T): T {
  if (jsonCache.has(key)) return jsonCache.get(key) as T
  try {
    const v = Taro.getStorageSync(key)
    const out = v === '' || v === null || v === undefined ? fallback : (v as T)
    jsonCache.set(key, out)
    return out
  } catch {
    return fallback
  }
}

/**
 * 写缓存的**唯一入口**。
 *
 * 为什么要包一层：微信本地缓存总容量只有 10MB，写满了 `setStorageSync` 会直接抛异常
 * （还有极少数机型在后台被系统清缓存时会失败）。2026-10 之前全项目都是裸调用，
 * 于是「点了标记 → 写盘失败 → 异常冒到 onClick → 页面不刷新」——用户看到的是
 * **点了没反应**，而且数据已经丢了却没有任何提示。这是这个 App 最危险的一类 bug：
 * 学习进度是用户唯一的资产，静默丢数据比报错严重得多。
 *
 * 现在所有写路径都走这里：失败时记下来（`getWriteError()`），页面读到提示就
 * 在界面上说清楚「本地空间满了 / 没存上」，而不是假装成功。
 */
let writeError: string = ''

function safeWrite(key: string, value: unknown): boolean {
  try {
    Taro.setStorageSync(key, value)
    // 写成功就同步缓存（同一个引用），下一次读不必再跨桥
    jsonCache.set(key, value)
    return true
  } catch (e) {
    // 只留第一条：连着一串写失败时，提示一句就够，不要刷屏
    if (!writeError) {
      const msg = e && typeof e === 'object' && 'errMsg' in e ? String((e as { errMsg: unknown }).errMsg) : ''
      writeError = /exceed|quota|full|size/i.test(msg) ? 'quota' : 'unknown'
    }
    return false
  }
}

/**
 * 上一次写缓存失败的原因（空串 = 一切正常）。**页面上要显式提示**：
 * 这是「数据可能没存上」的唯一信号，不允许静默。
 */
export function getWriteError(): string {
  return writeError
}

/** 用户确认看过提示后调用，避免同一条提示反复出现 */
export function clearWriteError(): void {
  writeError = ''
}

/** 本地缓存是否已经用满（配额告警）—— 上传词表前应该先问一句 */
export function storageUsage(): { usedKB: number; limitKB: number } {
  try {
    const info = Taro.getStorageInfoSync()
    return { usedKB: Math.round((info.currentSize || 0)), limitKB: Math.round(info.limitSize || 10240) }
  } catch {
    return { usedKB: 0, limitKB: 10240 }
  }
}

export function getProgress(): Record<string, number> {
  return readJson<Record<string, number>>(PROGRESS_KEY, {})
}

/** word -> 最近一次标记 +1 的时间戳（只存本地） */
export function getMarkedAt(): Record<string, number> {
  return readJson<Record<string, number>>(MARKED_AT_KEY, {})
}

/** 记一下「这个词刚被标记」——复习挑选和随机抽查都靠它 */
function touchMarkedAt(word: string): void {
  const t = getMarkedAt()
  t[word] = Date.now()
  safeWrite(MARKED_AT_KEY, t)
}

/** mark_count +1，返回本次是否真的加上了（已满则不动，返回 false）。 */
export function incrementMark(word: string): boolean {
  const p = getProgress()
  const cur = p[word] ?? 0
  if (cur >= MAX_MARK) return false
  p[word] = cur + 1
  safeWrite(PROGRESS_KEY, p)
  touchMarkedAt(word)
  // 「点击七级标记」= 今天背了这个词。已满（上面 return false）那次不算：
  // 标记没动，只是弹了个提示，不该计入今天的进度。
  addTodayWord(word)
  emitChange('word', word)
  return true
}

/** mark_count -1，归零时删除记录。 */
export function decrementMark(word: string): void {
  const p = getProgress()
  const cur = p[word] ?? 0
  if (cur <= 1) {
    delete p[word]
  } else {
    p[word] = cur - 1
  }
  safeWrite(PROGRESS_KEY, p)
  emitChange('word', word)
}

/**
 * 生词库里的一个词：词条本体 + 标记次数 + 「最近标记 / 最近复习」两个时间戳 + 复习次数。
 *
 * **生词库** = 所有 markCount > 0 且**没被掌握**的词（掌握时 masterWord 会把标记清零，
 * 这里再过滤一次是为了兜住老数据）。生词本的几个页面共用这一份读法，
 * 各自的排序在页面里做（分档页按档次过滤、全部生词页原序、复习挑选按时间倒序）。
 */
export interface PoolWord extends Word {
  /** 标记次数 1~7 */
  markCount: number
  /** 最近一次标记 +1 的时间戳；0 = 老数据，没记过 */
  markedAt: number
  /** 最近一次复习的时间戳；0 = 没复习过 */
  reviewedAt: number
  /** 复习过几次 */
  reviewTimes: number
}

/** 生词库全部词条，按标记次数降序、word 字母序升序 */
export function getVocabPool(): PoolWord[] {
  const p = getProgress()
  const m = getMastered()
  const markedAt = getMarkedAt()
  const log = getReviewLog()
  const marked = Object.keys(p).filter((w) => p[w] > 0 && !m[w])
  if (!marked.length) return []

  const index = wordIndex()
  return marked
    .map((w) => {
      const base = index.get(w) ?? { word: w, phonetic: '', pos: '', definition: '' }
      const rec = log[w]
      return {
        ...base,
        markCount: p[w],
        markedAt: markedAt[w] || 0,
        reviewedAt: rec ? rec.at : 0,
        reviewTimes: rec ? rec.times : 0
      }
    })
    .sort((a, b) => b.markCount - a.markCount || a.word.localeCompare(b.word))
}

// ---------- 间隔重复（SRS）：一个词什么时候该再复习一次 ----------

/**
 * 记忆间隔阶梯（**天**），下标 = 等级 − 1。
 *
 * 2026-11 用户定的新口径（等级语义见 `reviewKnown`）：**等级越高 = 越不熟**，
 * 所以间隔必须**反过来**——最不熟的（7 级）明天就来，快掌握的（1 级）隔两周才考一次。
 *
 * 旧表是 [1,2,4,7,15,30,60]（等级越高间隔越长），配合「认识 = 直接掌握」还能自洽；
 * 换成「认识 = 降一级」之后它就反了：7 级的词要等 60 天才见，越不熟越见不到。
 */
const REVIEW_INTERVALS = [14, 10, 7, 4, 3, 2, 1]

/** 标记次数 → 记忆间隔（天）。越界的值收敛到两端 */
export function reviewIntervalDays(markCount: number): number {
  const n = Math.round(markCount) || 1
  return REVIEW_INTERVALS[Math.min(Math.max(n, 1), REVIEW_INTERVALS.length) - 1]
}

/** 一个词的复习日程（全部现算，不落存储） */
export interface ReviewSchedule {
  /** 上次动过手的时间（标记 / 复习取较晚的那个）；0 = 老数据，不知道什么时候碰过 */
  lastAt: number
  /** 下次该复习的日期 YYYY-MM-DD */
  dueDate: string
  /** 距今天几天：**负数 = 已经逾期**，0 = 今天到期，正数 = 还没到 */
  daysLeft: number
  /** 这次的间隔是多少天 */
  intervalDays: number
}

/**
 * 算一个词的复习日程。
 *
 * 锚点是「上次标记或上次复习里较晚的那个」——用户可能只翻书标记、也可能直接来复习，
 * 两个入口都得算数。老数据（两个时间戳都没有）**一律当作今天到期**，
 * 宁可多提醒一次，也不要让这些词永远沉在库里没人管。
 */
export function scheduleOf(
  w: Pick<PoolWord, 'markCount' | 'markedAt' | 'reviewedAt'>,
  now: number = Date.now()
): ReviewSchedule {
  const intervalDays = reviewIntervalDays(w.markCount)
  const lastAt = Math.max(w.markedAt || 0, w.reviewedAt || 0)
  const today = todayString(new Date(now))
  if (!lastAt) {
    return { lastAt: 0, dueDate: today, daysLeft: 0, intervalDays }
  }
  const dueDate = todayString(new Date(lastAt + intervalDays * 86400000))
  return { lastAt, dueDate, daysLeft: daysBetween(today, dueDate), intervalDays }
}

/** 复习到期概览：首页 / 生词本 / 数据页都用它，口径只有这一份 */
export interface ReviewDue {
  /** 今天该复习的词数（**含已经逾期的**） */
  due: number
  /** 其中逾期超过一天的 */
  overdue: number
  /** 生词库总词数（标记过且还没掌握） */
  total: number
  /** 下一个未来到期日 YYYY-MM-DD（没有未来的词就是空串） */
  nextDate: string
  /** 那天有几个词 */
  nextCount: number
}

/**
 * 生词库里今天该复习多少、逾期多少、下次是哪天。
 *
 * 这是这个 App 从「你自己记得来复习」变成「它告诉你今天复习什么」的那一步：
 * 之前「待复习 45 个词」是一个静态的总量，用户看不出今天该动哪几个。
 */
export function getReviewDue(): ReviewDue {
  const pool = getVocabPool()
  const now = Date.now()
  let due = 0
  let overdue = 0
  let nextDate = ''
  let nextCount = 0

  for (const w of pool) {
    const sch = scheduleOf(w, now)
    if (sch.daysLeft <= 0) {
      due++
      if (sch.daysLeft < 0) overdue++
    } else if (!nextDate || sch.dueDate < nextDate) {
      nextDate = sch.dueDate
      nextCount = 1
    } else if (sch.dueDate === nextDate) {
      nextCount++
    }
  }

  return { due, overdue, total: pool.length, nextDate, nextCount }
}

/**
 * 复习队列的**唯一排序规则**（全站只有这一份，页面不自己排）：
 *
 * 1. **等级越低越靠前** —— 1 级（只差最后一关）永远排在 7 级前面（用户 2026-11 定的口径）；
 * 2. 同等级里**越逾期越靠前**；
 * 3. 再按「最近动过手」倒序（刚复习过的往后放，别连着考同一个词）；
 * 4. 最后按字母序兜底 —— 保证排序稳定，刷新页面不会跳来跳去。
 */
function compareForReview(a: PoolWord, b: PoolWord, now: number): number {
  if (a.markCount !== b.markCount) return a.markCount - b.markCount
  const sa = scheduleOf(a, now)
  const sb = scheduleOf(b, now)
  if (sa.daysLeft !== sb.daysLeft) return sa.daysLeft - sb.daysLeft
  return (
    Math.max(b.markedAt, b.reviewedAt) - Math.max(a.markedAt, a.reviewedAt) ||
    a.word.localeCompare(b.word)
  )
}

/**
 * 今天该复习的词（含逾期），按 `compareForReview` 排 —— 页面直接照这个顺序出题。
 * `limit <= 0` 表示全部。
 */
export function getDueWords(limit = 0): PoolWord[] {
  const now = Date.now()
  const due = getVocabPool()
    .filter((w) => scheduleOf(w, now).daysLeft <= 0)
    .sort((a, b) => compareForReview(a, b, now))
  return limit > 0 ? due.slice(0, limit) : due
}

/**
 * 七级等级体系（2026-11 用户定的新口径，**覆盖「认识 = 直接掌握」的旧行为**）
 *
 * | 等级 | 含义 | 怎么变 |
 * | --- | --- | --- |
 * | 7（最不熟） | 完全不认识 | 复习时点「不认识」→ +1，封顶 7 |
 * | 6…2 | 逐步熟悉 | 每点一次「认识」→ **−1 级** |
 * | 1 | 只差最后一关 | 再点一次「认识」→ 0 级 = 掌握，移出生词库 |
 * | 0 | 已掌握 | 进「熟练掌握词汇」，不再出现在生词本 |
 *
 * 关键点：**「认识」不再一步到胃，而是一级一级往下磨**。因为一个词从 7 级到 0 级
 * 要连续答对 7 次，用户的真实掌握程度才会被如实记下来（大厂的做法都是这个思路：
 * 一次答对不代表会，连对才算）。等级本身存在 `wordlord_progress_v3` 里，跨天不丢。
 */
export interface ReviewOutcome {
  /** 这一下之后的等级（0 = 刚掌握） */
  level: number
  /** 这一下是不是把词送进了「熟练掌握词汇」 */
  mastered: boolean
}

/**
 * 复习时点「认识」：**降 1 级**；降到 0 级就算掌握（移出生词库）。
 *
 * 词汇没进过生词库（等级 0）时点「认识」= 直接掌握，和以前的行为一致。
 */
export function reviewKnown(word: string): ReviewOutcome {
  const p = getProgress()
  const cur = p[word] ?? 0
  markReviewed(word)
  addTodayWord(word)

  if (cur <= 1) {
    // 1 级再答对一次 = 0 级：掌握，进「熟练掌握词汇」
    masterWord(word)
    return { level: 0, mastered: true }
  }

  p[word] = cur - 1
  safeWrite(PROGRESS_KEY, p)
  emitChange('word', word)
  return { level: cur - 1, mastered: false }
}

/**
 * 复习时点「还不认识」：**升 1 级**（封顶 7）。
 *
 * 旧行为是「打回第 1 档」。改成 +1 之后，等级和「认识 −1」对称：
 * 同一套 7 级刻度，答对往下走、答错往上走，用户能看见自己在刻度上的位置。
 */
export function reviewForgot(word: string): ReviewOutcome {
  const p = getProgress()
  const cur = p[word] ?? 0
  const next = Math.min(cur + 1, MAX_MARK)
  p[word] = next
  safeWrite(PROGRESS_KEY, p)
  touchMarkedAt(word)
  markReviewed(word)
  addTodayWord(word)
  emitChange('word', word)
  return { level: next, mastered: false }
}

/**
 * @deprecated 用 `reviewForgot()`；保留这个名字只是为了不打断老的调用点。
 * 语义已经改成「升 1 级」，不再是「打回第 1 档」。
 */
export function markForgotten(word: string): void {
  reviewForgot(word)
}

/**
 * 挑这一批要复习的词。
 *
 * 排序规则（2026-11 用户定的，**覆盖上一轮的「等级越高越前」**）：
 * 1. **等级越低越靠前** —— 1 级（只差最后一关）永远排 7 级（完全不认识）前面。
 *    理由是「趁热打铁」：快掌握的词必须连着答对几次才算数（见 `reviewKnown`），
 *    一旦中间断掉又要爬回去，所以优先巩固最接近掌握的那批；
 * 2. 同等级内按到期日（逾期久的先）；
 * 3. 再按「最近动过手」倒序，最后按字母序兜底，保证排序稳定（不会每次刷新都跳）。
 */
export function pickReviewBatch(size: number): PoolWord[] {
  const now = Date.now()
  const pool = getVocabPool()
  const due: PoolWord[] = []
  const later: PoolWord[] = []

  for (const w of pool) {
    if (scheduleOf(w, now).daysLeft <= 0) due.push(w)
    else later.push(w)
  }

  due.sort((a, b) => compareForReview(a, b, now))

  // 到期的凑不满一批时，用「最先到期的」补齐 —— 但**排在到期词后面**，
  // 绝不插队。这样「今天到期 3 个」就只出这 3 个，多要的部分才是提前量。
  later.sort((a, b) => {
    const sa = scheduleOf(a, now)
    const sb = scheduleOf(b, now)
    return sa.daysLeft - sb.daysLeft || compareForReview(a, b, now)
  })

  const ordered = due.concat(later)
  return size > 0 ? ordered.slice(0, size) : ordered
}

/**
 * 七级分布：1 级（快掌握）到 7 级（完全不认识）各有多少词。
 *
 * 生词本页面用它画一条「等级尺」——用户能看见自己的词堆在哪一级，
 * 而不是只有一个「共 N 个词」的总数。
 */
export function getLevelSpread(): number[] {
  const spread = [0, 0, 0, 0, 0, 0, 0]
  for (const w of getVocabPool()) {
    const lv = Math.min(Math.max(Math.round(w.markCount), 1), MAX_MARK)
    spread[lv - 1]++
  }
  return spread
}

/** 抽查的「最近」窗口：一周之内的词才有加成 */
const RECENT_DAYS = 7
/** 加成上限：刚标记 / 复习过的词被抽中的概率是最冷词的 1.5 倍（用户要的是「大一点点」） */
const RECENT_BONUS = 0.5

/** 抽中权重：越近越大，一周以外一律 1 */
function recencyWeight(w: PoolWord): number {
  const ts = Math.max(w.markedAt, w.reviewedAt)
  if (!ts) return 1
  const days = (Date.now() - ts) / 86400000
  if (days >= RECENT_DAYS) return 1
  return 1 + RECENT_BONUS * (1 - days / RECENT_DAYS)
}

/**
 * 「随机抽查」：从给的词里按权重随机抽一个 —— **最近刚标记 / 刚复习过的稍微容易抽中**。
 * 只是辅助功能，所以权重差别刻意做得很小（最多 1.5 倍），不会变成「只抽新词」。
 * 空数组返回 null。
 */
export function pickRandomByRecency(words: PoolWord[]): PoolWord | null {
  if (!words.length) return null
  let total = 0
  for (const w of words) total += recencyWeight(w)

  let r = Math.random() * total
  for (const w of words) {
    r -= recencyWeight(w)
    if (r <= 0) return w
  }
  return words[words.length - 1]
}

/** 移除生词（markCount 归零）。 */
export function removeVocabWord(word: string): void {
  const p = getProgress()
  delete p[word]
  safeWrite(PROGRESS_KEY, p)
  emitChange('word', word)
}

// ---------- mastered:「我会了」点过的词，不再出现在翻书里 ----------

/** word -> 掌握时间戳 */
export function getMastered(): Record<string, number> {
  return readJson<Record<string, number>>(MASTERED_KEY, {})
}

/**
 * 「我会了」：这个词毕业，进「熟练掌握词汇」，同时**把七级标记清零**。
 *
 * 清零这条规则是用户 2026-10 定的：词只要在生词本里（markCount > 0），点「我会了」
 * 就把标记归 0。生词本 = 标记次数 > 0，所以这个词从此不在生词本里、只在
 * 「熟练掌握词汇」里。翻书页和生词本点「我会了」走的是同一个函数，两边行为一致。
 *
 * ⚠️ 撤回掌握（unmasterWord）**不恢复**标记次数：撤回只是把这个词放回翻书列表，
 * 标记要重新点。不然「撤回」会凭空造出一次标记，和用户手点分不清。
 *
 * ⚠️ 云同步的合并规则是 markCount 取两边较大的（见下面 mergeWordRecords），
 * 所以如果另一台设备上这个词还留着旧的标记次数，同步回来会把清零结果盖掉。
 * 单机使用不受影响；跨设备这类边角等真有第二台设备再说。
 */
export function masterWord(word: string): void {
  const m = getMastered()
  m[word] = Date.now()
  safeWrite(MASTERED_KEY, m)

  const p = getProgress()
  if (p[word]) {
    delete p[word]
    safeWrite(PROGRESS_KEY, p)
  }

  // 「我会了」也算今天背过了一个词（和点标记同一个口径）
  addTodayWord(word)

  emitChange('word', word)
}

/** 点错了撤回：这个词重新回到翻书列表。 */
export function unmasterWord(word: string): void {
  const m = getMastered()
  delete m[word]
  safeWrite(MASTERED_KEY, m)
  emitChange('word', word)
}

/** 熟练掌握词汇：所有点过「我会了」的词，最近掌握的排前面。 */
export interface MasteredWord extends Word {
  /** 掌握时间戳（未记为 0，排最后） */
  masteredAt: number
}

export function getMasteredWords(): MasteredWord[] {
  const m = getMastered()
  const words = Object.keys(m).filter(Boolean)
  if (!words.length) return []

  const index = wordIndex()
  return words
    .map((w) => {
      const base = index.get(w) ?? { word: w, phonetic: '', pos: '', definition: '' }
      return { ...base, masteredAt: m[w] || 0 }
    })
    .sort((a, b) => b.masteredAt - a.masteredAt || a.word.localeCompare(b.word))
}

/** 一批词里还有多少没被掌握。mastered 可传入已读好的表，避免重复读缓存。 */
export function countUnmastered(words: Word[], mastered?: Record<string, number>): number {
  const m = mastered ?? getMastered()
  let n = 0
  for (const w of words) if (!m[w.word]) n++
  return n
}

// ---------- 上传的词书 ----------

/** 单本词书最多收多少词，避免单次缓存写入过大 */
export const MAX_UPLOAD_WORDS = 5500
/** 最多能存几本上传的词书 */
const MAX_UPLOAD_BOOKS = 20

/** 词书目录项，不含词条本体 */
export interface UploadBookMeta {
  id: string
  title: string
  createdAt: number
  count: number
}

export function getUploadBooks(): UploadBookMeta[] {
  return readJson<UploadBookMeta[]>(UPLOAD_INDEX_KEY, [])
}

export function getUploadBookWords(id: string): Word[] {
  return readJson<Word[]>(uploadBookKey(id), [])
}

/** 新增一本上传的词书，返回它的目录项；超出数量上限返回 null。 */
export function addUploadBook(title: string, words: Word[]): UploadBookMeta | null {
  const books = getUploadBooks()
  if (books.length >= MAX_UPLOAD_BOOKS) return null

  const id = `up${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
  const capped = words.slice(0, MAX_UPLOAD_WORDS)
  safeWrite(uploadBookKey(id), capped)

  const meta: UploadBookMeta = { id, title, createdAt: Date.now(), count: capped.length }
  safeWrite(UPLOAD_INDEX_KEY, [...books, meta])
  emitChange('book', id)
  return meta
}

export function removeUploadBook(id: string): void {
  safeWrite(UPLOAD_INDEX_KEY, getUploadBooks().filter((b) => b.id !== id))
  // 删掉的正好是主词书：把设置收回内置词书。虽然 `getMainBookId()` 自己也会兜底，
  // 但留在缓存里的那个 id 会让「换一本上传词书后再也回不到原来那本」这种场景变得诡异，
  // 所以当场写回一个确定的值。
  if (readJson<string>(MAIN_BOOK_KEY, '') === id) safeWrite(MAIN_BOOK_KEY, BUILTIN_BOOK_ID)
  try {
    Taro.removeStorageSync(uploadBookKey(id))
    // 删除也要同步清缓存，否则「删了书又读到旧书」这种鬼故事就会出现
    jsonCache.delete(uploadBookKey(id))
  } catch {
    // 删不掉也不该让调用方崩：索引已经摘掉了，这本词书不会再出现
  }
  emitChange('book-removed', id)
}

/** 「我的上传」里所有书的词数合计 */
export function countUploadWords(): number {
  return getUploadBooks().reduce((n, b) => n + b.count, 0)
}

// ---------- 主词书（R10）：统计只认这一本 ----------

/**
 * 当前「主词书」的 id（默认 `builtin` = 大学六级 1824 词）。
 *
 * 为什么要有这个：内置的「大学六级」和「我的上传」里那些词表的**高频/中频/低频是两套定义**
 * （分档用的是同一把尺子 `bandOf`，但每本书的词表来源不同、档位里装的人不一样），
 * 把它们的分档数字加到一起就是对不上账的假数字。所以全 app 只认一本主词书：
 * 整体进度、三个词频档、计划、查词范围、首页倒计时旁边那个百分比**全部只按它算**，
 * 其余词书折叠进「归档词书」，标签不参与任何统计。
 *
 * 只存本地（和 `plan` / `examDate` 一样是这台手机上的选择）：
 * 但 key 带 `wordlord_` 前缀，所以**备份 / 恢复会自动带上它**（exportBackup 按前缀导出）。
 *
 * 读的时候要兜两种情况，否则统计会指向一本不存在的书：
 *   ① 缓存里没有 / 是脏值 → 退回内置；
 *   ② 指定的上传词书被删了 → 也退回内置。
 */
const MAIN_BOOK_KEY = 'wordlord_main_book_v1'

export function getMainBookId(): string {
  const id = readJson<string>(MAIN_BOOK_KEY, '')
  if (!id || id === BUILTIN_BOOK_ID) return BUILTIN_BOOK_ID
  return getUploadBooks().some((b) => b.id === id) ? id : BUILTIN_BOOK_ID
}

/** 指定主词书。传空串 / 传内置 id 都等于「回到大学六级」。 */
export function setMainBookId(id: string): string {
  const next = id && id !== BUILTIN_BOOK_ID ? id : BUILTIN_BOOK_ID
  safeWrite(MAIN_BOOK_KEY, next)
  return next
}

/** 一本词书还在不在（内置永远在）。删词书 / 换主词书前用它挡一下。 */
export function bookExists(id: string): boolean {
  return id === BUILTIN_BOOK_ID || getUploadBooks().some((b) => b.id === id)
}

// ---------- 单词索引：word -> Word，把进度里的单词还原成完整词条 ----------

/**
 * 缓存里读到的东西不一定听话：云端合并、老版本残留、写到一半断电，
 * 都可能让某个 key 里躺着一个不是数组的值。取数组前先确认，顶多少个词，
 * 不能让它把生词本整页炸成白屏（这个词表是在渲染时同步读的）。
 */
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** 内置词表 + 全部上传词书的合并索引。每次调用重建（几千条，够快）。 */
function wordIndex(): Map<string, Word> {
  const index = new Map<string, Word>()
  for (const meta of asArray<UploadBookMeta>(getUploadBooks())) {
    if (!meta || !meta.id) continue
    for (const w of asArray<Word>(getUploadBookWords(meta.id))) {
      if (w && w.word) index.set(w.word, w)
    }
  }
  for (const w of ALL_WORDS) if (!index.has(w.word)) index.set(w.word, w)
  return index
}

// ---------- app state ----------

export interface AppState {
  /** 每本词书的每个档次各停在第几页，key = `${bookId}:${level}` */
  pages: Record<string, number>
  todayDate: string
  todayPageCount: number
  todayMarkCount: number
  /**
   * 今天「标记过 / 点过我会了」的词（word -> 1，只用来去重）。只存本地，不上云。
   *
   * 用户 2026-10 定的口径：翻书页那颗「今日已背 N 个词」**不是**「翻到过多少词」，
   * 而是**真动过手**的词 —— ①点击七级标记（+1）或 ②点「我会了」，两个都算，去重。
   * 写入点在 storage 里（`incrementMark` / `masterWord`），所以不管在哪一页动手
   * （翻书页 / 全部生词 / 复习页 / 档位抽查）都会算进今天。
   * 跨过本地零点（`todayDate` 变了）整张清空 —— 这就是「每天凌晨之后清零」。
   */
  todayWords: Record<string, number>
  /**
   * `todayWords` 用的是第几版口径（见 `TODAY_WORDS_RULE`）。
   *
   * 换口径时这个数字 +1，老缓存会被 `resetToday()` 一次性清掉 —— 不然用户会一直
   * 看到按旧口径数出来的虚高数字（2026-10 就踩过一次：上一版把「翻页显示过」也算进去，
   * 翻了 4 页显示 40，改口径后当天怎么点都还是 40）。
   */
  todayWordsRule: number
  /**
   * 每天背了多少个词：`YYYY-MM-DD -> 词数`。**只存本地，不上云。**
   *
   * 和 `todayWords` 是一对：`todayWords` 只管今天（跨零点清空），这张表是**历史**，
   * 永远不清（只裁掉 62 天以前的）。主界面的「最近 7 天」柱状图和「连续 N 天」
   * 都从它算出来 —— 所以连续天数是**算出来的，不是另存一个字段**，
   * 不会出现「打卡数」和「实际背词记录」对不上的情况。
   */
  daily: Record<string, number>
  /**
   * **废弃**（2026-11）：每日目标的唯一来源已经是常量 `DAILY_GOAL`（34），
   * 这个字段没有任何读取方了。只为了「老缓存里还躺着它」而留在类型里，
   * 别再往这里写、也别再读它。
   */
  dailyGoal: number
  /** 最后一次打开的翻书页，给底部 Tab 栏的「翻书」跳回去用 */
  lastReader: { bookId: string; level: string } | null
  /** 复习记录：word -> 复习过几次 / 最后一次复习的时间。只存本地，不上云 */
  reviews: Record<string, ReviewRecord>
  /** 生词本「每次复习几个」：0 = 全部。只存本地 */
  reviewBatch: number
  /** 学习计划（在某个日期前背完某本词书）。null = 没定计划。只存本地 */
  plan: StudyPlan | null
  /**
   * 考试日期 YYYY-MM-DD（默认 `DEFAULT_EXAM_DATE` = 2026-12-12）。
   * 计划页的锚点：算「离考试几天」和「第一轮最晚哪天刷完（12-02）」。只存本地。
   */
  examDate: string
}

/**
 * 学习计划：**在某个日期前背完某本词书**。
 *
 * 2026-10 用户要求加的「计划功能」。设计上只存**四个事实**，其余全是算出来的：
 *   startedAt  建计划那天
 *   deadline   目标日期
 *   baseDone   建计划时这本书已掌握多少（计划期的起点，不算进计划成绩）
 *   scopeTotal 建计划时这本书共多少词（分母，之后上传/删除词书不影响已定的计划）
 *
 * 于是「还剩多少 / 剩几天 / 每天要背几个 / 领先还是落后」都由 `getPlanStatus()` 实时算，
 * 不存第二份真相 —— 和连续天数一个思路（不另存打卡数，避免对不上）。
 * 只存本地：计划是这台手机上的节奏，换手机重定一个就行。
 */
export interface StudyPlan {
  bookId: string
  /**
   * 计划覆盖的档位：`all` = 整本，也可以只定高频 / 中频 / 低频。
   * ⚠️ 这个字段是 2026-10 补的：老计划里没有它，`getPlan()` 会当成 `all` 读出来。
   */
  level: LevelKey
  /**
   * 目标日期 YYYY-MM-DD（本地日期）。
   * **两种模式二选一**（2026-10 用户要求「可以自行选择每天背多少个」）：
   * - 按日期模式：这里填日期，`perDay` 为 0，每天要背多少由剩余量 ÷ 剩余天数推算；
   * - 按每天数量模式：这里留空，`perDay` 是你定的量，日期由它推算。
   * 两者至少要有一个，`getPlan()` 会拒绝两个都没有的脏数据。
   */
  deadline: string
  /** 每天背多少个。0 = 没定（按目标日期推算） */
  perDay: number
  /** 建计划那天 YYYY-MM-DD */
  startedAt: string
  /** 建计划时这本书这一档已掌握的词数 */
  baseDone: number
  /** 建计划时这本书这一档的总词数 */
  scopeTotal: number
}

/** 计划的实时状态（页面只负责画，不自己算） */
export interface PlanStatus {
  plan: StudyPlan
  /** 计划覆盖的词数（= 整本书的词数） */
  scopeTotal: number
  /** **这本书当前已掌握多少**（绝对进度，不是计划期增量） */
  done: number
  /** 建计划时已掌握多少（应完成的起算点 + 页面上说明用） */
  baseDone: number
  remaining: number
  /** 还剩几天（0 = 今天到期；过期后也是 0） */
  daysLeft: number
  /** 计划总天数 */
  totalDays: number
  /** 按计划「今天应该已经掌握多少」（绝对值，从 baseDone 起算） */
  plannedDone: number
  /** 实际 − 应完成：正数 = 领先，负数 = 落后 */
  gap: number
  /** 接下来每天要背几个（模式 B 就是你定的那个量） */
  perDay: number
  /** 是否设了目标日期（模式 A）；模式 B 为 false，此时没有「过期」一说 */
  hasDeadline: boolean
  expired: boolean
  finished: boolean
  /** 计划指向的词书已经不在了（上传的书被删） */
  bookMissing: boolean
  /** 最近 7 天里**有记录的那些天**平均每天背多少个（没记录 = 0） */
  avgPerDay: number
  /** 按这个速度预计还要几天（0 = 已经背完 / 算不出来） */
  etaDays: number
  /** 预计背完的日期 YYYY-MM-DD；算不出来是空串 */
  etaDate: string
  /** 预测用的每日量（模式 B = 你定的量；模式 A = 最近实际速度，没数据则退回计划节奏） */
  etaBasis: number
  /** true = 预测用的是计划自己的节奏，false = 用的是最近实际速度 */
  etaByPlan: boolean
  /** 预计比目标晚几天：正数 = 会晚到，负数 = 能提前，0 = 正好赶上 / 模式 B 没有目标日 */
  etaLateDays: number
}

/** 一个词的复习记录 */
export interface ReviewRecord {
  /** 最后一次复习的时间戳 */
  at: number
  /** 一共复习过几次 */
  times: number
}

const DEFAULT_STATE: AppState = {
  pages: {},
  todayDate: '',
  todayPageCount: 0,
  todayMarkCount: 0,
  todayWords: {},
  // 老缓存里没有这个字段 → 合并后是 0 → 和当前口径对不上 → 一次性清空（见 resetToday）
  todayWordsRule: 0,
  daily: {},
  /** @deprecated 见 AppState.dailyGoal：目标已固定为 DAILY_GOAL，这里只为兼容老缓存 */
  dailyGoal: 20,
  lastReader: null,
  reviews: {},
  reviewBatch: 20,
  plan: null,
  // 老缓存里没有这个字段 → 读出来是空串 → getExamDate() 兜回默认的 2026-12-12
  examDate: DEFAULT_EXAM_DATE
}

function readState(): AppState {
  return { ...DEFAULT_STATE, ...readJson<Partial<AppState>>(STATE_KEY, {}) }
}

function writeState(s: AppState): void {
  safeWrite(STATE_KEY, s)
}

/** 本地日期，格式 YYYY-MM-DD。默认现在；传时间戳对应的 Date 可以问「那天是几号」 */
function todayString(d: Date = new Date()): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function getCurrentPage(pageKey: string): number {
  return readState().pages[pageKey] ?? 0
}

export function setCurrentPage(pageKey: string, page: number): void {
  const s = readState()
  s.pages = { ...s.pages, [pageKey]: page }
  writeState(s)
  emitChange('state', pageKey)
}

/** 进翻书页时记一笔，Tab 栏的「翻书」从生词本切回来时要用 */
export function setLastReader(bookId: string, level: string): void {
  const s = readState()
  s.lastReader = { bookId, level }
  writeState(s)
  emitChange('state', 'lastReader')
}

/**
 * 翻书页的版式偏好：'page' = 一页 10 个词的老版式，'card' = 一屏一张卡（2026-11 新增）。
 *
 * ⚠️ **单独一个 storage key**，没有塞进 `readState()`：
 * 老数据（进度 / 掌握 / 计划 / 今日计数）一个字节都不用动，
 * 「手机上正在背的实时数据能带进新版本」这件事就靠这个 —— 新功能只加 key，不改老结构。
 */
const READER_MODE_KEY = 'wordlord_reader_mode_v1'

/**
 * 今天动过手的词（去重，跨零点自己清空）。
 *
 * 和「今日已背 N 个」是同一份数据（`state.todayWords`），
 * 翻书页用它来算「今天这一批还剩哪些词没碰过」—— 见 reader 的 `loadBatch()`。
 */
/**
 * 今天该背多少 —— **全 app 唯一的「每日新词量」**（2026-11 用户要求按计划走）。
 *
 * 规则只有一条：**有计划就听计划的每天量**（`perDay`），没有计划才用每日目标（34）。
 * 计划已完成 / 词书被删 `perDay` 会是 0，这时退回每日目标，页面不会变成「0 个」。
 *
 * ⚠️ 原来首页写死 `getDailyGoal()`（34），计划页另算一个 —— 同一台手机上两处数字不一样。
 * 现在首页、翻书页、卡片页都从这里取，改计划立刻全站一致。
 */
export function dailyQuota(): number {
  const s = getPlanStatus()
  const per = s && !s.bookMissing && !s.finished && s.perDay > 0 ? s.perDay : 0
  return per > 0 ? per : getDailyGoal()
}

export function getTodayWords(): Record<string, number> {
  return readState().todayWords ?? {}
}

export function getReaderMode(): 'page' | 'card' {
  try {
    const v = Taro.getStorageSync(READER_MODE_KEY)
    // 存储里只可能是这两个值；没有记录（老用户第一次升级）默认给卡片版式
    return v === 'page' ? 'page' : 'card'
  } catch {
    return 'card'
  }
}

export function setReaderMode(mode: 'page' | 'card'): void {
  try {
    Taro.setStorageSync(READER_MODE_KEY, mode)
    jsonCache.set(READER_MODE_KEY, mode)
  } catch {
    // 存储满 / 被禁用：版式偏好丢了不影响背词，静默降级
  }
}

export function getLastReader(): { bookId: string; level: string } | null {
  return readState().lastReader ?? null
}

/**
 * 「今日已背」这个词数的**口径版本**。改口径就 +1。
 *
 * 1 = 2026-10 起的口径：今天点过七级标记或点过「我会了」的词（去重）。
 *     （0 = 老缓存 / 上一版「翻到过的词」，见到就作废 —— 那次改口径忘了清，
 *      用户当天翻过的页数一直被算在里面，屏幕上一直显示 40。）
 */
const TODAY_WORDS_RULE = 1

/**
 * 保证 s 里的今日计数属于「今天」，并且用的是当前口径。
 * 跨过本地零点就全部清零（翻页数 / 标记数 / 今日单词表）；口径版本对不上就只清今日单词表。
 * 返回**是否需要写盘**（有东西被改过）。
 *
 * 「凌晨之后清零」是用户 2026-10 定的，靠的就是这个函数 —— 所有读写今日计数的入口
 * 都必须先过它一遍，不然会拿着昨天的数字接着往上加。
 *
 * ⚠️ 2026-11 起这里还要**把 `daily[今天]` 和 `todayWords` 对齐一次**，见 `syncDailyToday()`：
 * 数据页的「今日 / 节奏合计 / 达标 / 活跃」四处的数字全来自这一对，它们一旦对不上，
 * 同一个屏幕就会自相矛盾（用户截图里那个「今日 22/20」+「合计 1 个词」）。
 */
function resetToday(s: AppState): boolean {
  let dirty = false

  const today = todayString()
  if (s.todayDate !== today) {
    s.todayDate = today
    s.todayPageCount = 0
    s.todayMarkCount = 0
    s.todayWords = {}
    dirty = true
  }

  // 口径换过：老数据是按旧口径数出来的（上一版把「翻页显示过」也算进去，翻了 4 页就 40）。
  // 不清成 0，而是按新口径**把今天重算一遍** —— 今天标记过的时间戳 + 今天掌握的时间戳，
  // 这样用户切过来看到的就是真实数字，不用等到明天。
  if (s.todayWordsRule !== TODAY_WORDS_RULE) {
    s.todayWords = rebuildTodayWords()
    s.todayWordsRule = TODAY_WORDS_RULE
    dirty = true
  }

  // 最后一道保险：无论上面走了哪条分支，今天这一格的词数一律以 todayWords 为准。
  // 这一步修的就是「首页说 22、数据页说 1」——两处读的是同一份记忆的两个格子。
  if (syncDailyToday(s)) dirty = true

  return dirty
}

/**
 * 今日单词表里到底有几个词。**这是「今天背了多少」唯一该被显示出来的读法**，
 * 包括首页「今日 X/34」、翻书页「今日已背 N 个词」、数据页「今日」和打卡口径。
 * 老缓存里这个字段可能是坏的（不是对象），兜成 0。
 *
 * ⚠️ 一个必须兜住的情形：**跨天**（今天第一次打开 app 时 `todayDate` 还是前天）。
 * 这时今日单词表刚被清空，而 `daily[今天]` 还存着今天早些时候背过的词数 ——
 * 那是真实记录，显示成 0 就等于把它藏起来（而同一页的节奏图还是照 `daily` 画，又自相矛盾）。
 * 所以「今日单词表空、但历史表记着今天」时，认历史表；用户今天再点一个标记，
 * 去重表重新长出来，就自然回到去重表口径。
 */
export function getTodayWordCount(): number {
  const s = readState()
  const reset = resetToday(s)
  if (reset) writeState(s)
  return todayWordCount(s)
}

/** `s.daily[今天]` 记着多少个词（没有记录 = 0） */
function loggedToday(s: AppState): number {
  const daily = s.daily
  if (!daily || typeof daily !== 'object') return 0
  return daily[todayString()] || 0
}

/**
 * 把 `daily[今天]` 对准「今天的真实词数」，返回**是否改动了它**。
 *
 * 为什么必须有这一步：`daily` 是「每天背了多少」的历史，`todayWords` 是今天那份**去重表**，
 * 两者本该是同一个数（`addTodayWord()` 里是同时维护的）。但**口径迁移会只重建其中一份**
 * —— 结果就是「首页今日 22 个词」和「数据页节奏合计 1 个词」同时出现在两块屏幕上
 * （用户截图里那个「今日 22/20」+「达标 0 天 · 合计 1 个词」）。
 *
 * ⚠️ 唯一不动它的情形：**两张表都说今天没背**（真的没背，没什么可对齐的）。
 * 反过来说，只要还有一边记着今天有词，就以它为准 ——「跨天」时今日单词表被清空，
 * 但 `daily` 里今天的记录是用户真实背过的，抹成 0 就是在删数据。
 */
function syncDailyToday(s: AppState): boolean {
  const today = todayString()
  if (!s.daily || typeof s.daily !== 'object') s.daily = {}
  const authoritative = Math.max(todayWordCount(s), loggedToday(s))
  if (authoritative === 0) return false
  if (s.daily[today] === authoritative) return false
  s.daily[today] = authoritative
  s.daily = pruneDaily(s.daily)
  return true
}

/**
 * 按当前口径重算「今天背过的词」：**今天标记过的**（`markedAt` 是今天）+ **今天掌握的**
 * （`mastered` 时间戳是今天）。
 *
 * 只在换口径时用一次 —— 正常情况下这张表是 `addTodayWord()` 增量写出来的，不需要重算。
 * 这也顺手回答了「改口径之前今天已经标过的词算不算」：算，能还原出来。
 *
 * ⚠️ 取 `max(标记时间戳数, 已掌握时间戳数)` 而不是拼一张表再去重：这张表**只回答今天有几个词**，
 * 不需要知道具体是哪几个词。用并集的话，「今天标记过的词后来又被点成『我会了』」
 * 会从 2 个变成 1 个 —— 数字倒退比不精确更糟（今日计数是流水，不是库存）。
 * 另外键用 `#0 / #1 / …` 这种占位符：这张表是「今天有几个」的计数，
 * 不是「哪几个词」的清单（那件事由 `progress` / `mastered` / `markedAt` 负责），
 * 写成占位符就不会有人误以为它是一份可以拿来判重的词表。
 */
function rebuildTodayWords(): Record<string, number> {
  const today = todayString()
  const isToday = (ts: unknown) => typeof ts === 'number' && ts > 0 && todayString(new Date(ts)) === today

  let n = 0
  const markedAt = getMarkedAt()
  for (const w of Object.keys(markedAt)) if (isToday(markedAt[w])) n++

  let masteredToday = 0
  const mastered = getMastered()
  for (const w of Object.keys(mastered)) if (isToday(mastered[w])) masteredToday++

  const out: Record<string, number> = {}
  for (let i = 0; i < Math.max(n, masteredToday); i++) out[`#${i}`] = 1
  return out
}

/** 今日单词表的大小；老缓存里这个字段可能是坏的，兜一下 */
function todayWordCount(s: AppState): number {
  return s.todayWords && typeof s.todayWords === 'object' ? Object.keys(s.todayWords).length : 0
}

/** 读今日计数：日期不是今天就清零，否则返回已存计数。 */
export function loadTodayCounts(): { pageCount: number; markCount: number; wordCount: number } {
  const s = readState()
  const reset = resetToday(s)
  if (reset) writeState(s)
  return {
    pageCount: s.todayPageCount,
    markCount: s.todayMarkCount,
    wordCount: todayWordCount(s)
  }
}

/**
 * 把一个词记进「今天背过的词」，返回**今天累计的词数**。
 *
 * 「背过」= 点击七级标记（+1）或者点「我会了」（用户 2026-10 的口径）。
 * 去重：同一个词今天点几下都只算一个词。跨零点的第一次调用会先把今日计数清零，
 * 所以半夜还在学的时候，数字会自己从 0 重新数。
 *
 * 调用点只有两个（都在本文件里）：`incrementMark()` 和 `masterWord()` ——
 * 放这儿是为了让「在哪个页面动手」不影响计数。
 */
export function addTodayWord(word: string): number {
  const s = readState()
  const reset = resetToday(s)
  if (!s.todayWords || typeof s.todayWords !== 'object') s.todayWords = {}

  const isNew = Boolean(word) && !s.todayWords[word]
  if (isNew) {
    s.todayWords[word] = 1
    // 顺手记进「每天背了多少」的历史（数据页的节奏图 / 达标天数 / 活跃度带 / 连续天数都用它）。
    // 和去重表是同一个动作写下去的两个格子 —— 这是它们**永远相等**的保证。
    const today = todayString()
    if (!s.daily || typeof s.daily !== 'object') s.daily = {}
    s.daily[today] = (s.daily[today] || 0) + 1
    s.daily = pruneDaily(s.daily)
    syncDailyToday(s)
  }

  // 同一个词今天已经算过就不写盘：省一次几百个键的序列化
  if (isNew || reset) writeState(s)
  return todayWordCount(s)
}

/**
 * 撤销用：把一个词从「今天背过」里去掉（`addTodayWord` 的严格逆操作）。
 *
 * 什么时候用：卡片版点了「撤销」，且撤完之后这个词**既没有标记、也没掌握** ——
 * 那就等于今天根本没背过它，今日计数和历史曲线都该退回去，不然会出现
 * 「撤销了但今日还是 +1」这种对不上的数。
 *
 * 已经有标记 / 已掌握的词**不要**调它：那说明这个词今天确实动过手。
 */
export function untouchTodayWord(word: string): number {
  const s = readState()
  if (!s.todayWords || typeof s.todayWords !== 'object' || !s.todayWords[word]) {
    return todayWordCount(s)
  }
  delete s.todayWords[word]
  const today = todayString()
  if (s.daily && typeof s.daily === 'object' && s.daily[today] > 0) {
    s.daily[today] -= 1
    syncDailyToday(s)
  }
  writeState(s)
  emitChange('state', today)
  return todayWordCount(s)
}

/** 历史只留最近 62 天：日期是 YYYY-MM-DD，按字符串排序就是按时间排序 */
function pruneDaily(daily: Record<string, number>): Record<string, number> {
  const keys = Object.keys(daily)
  if (keys.length <= 62) return daily
  const out: Record<string, number> = {}
  for (const k of keys.sort().slice(-62)) out[k] = daily[k]
  return out
}

/**
 * 全 app **唯一**的「每日新词目标」：34 个词。
 *
 * 为什么不再让用户随便改（2026-11 用户要求）：这个数字原来有**四个来源** ——
 * `dailyGoal` 缓存值（默认 20）、首页 ActionSheet（10/20/30/50）、计划算出来的 `perDay`
 * （能是 57）、数据页沿用 `dailyGoal` —— 于是同一天同一台手机上，
 * 首页写「今日 22/20」、数据页节奏图写「目标 20 个」、计划页算出来「57 个 / 建议 30 个」。
 * **用户要的是「12-02 前刷完第一轮」，那 1824 ÷ 430 天的真实节奏就是一个数，不是四个。**
 *
 * 所以：34 写死在这里，`getDailyGoal()` 永远返回它，首页 / 计划页 / 数据页 / 打卡口径
 * 全部读这一个函数（`plan.perDay` 只是「计划为了赶上截止日需要的量」，是派生结果，
 * 不再是第二个「每日目标」）。
 *
 * ⚠️ 34 是用户 2026-11 定的：1824 词 ÷ 34 ≈ 54 天，远早于 2026-12-02 的第一轮截止日，
 * 留出缓冲；状态差时的 40 分钟保底量也按它算。改这个数**只改这一行**，
 * 不要在页面里再写死一个 34。
 */
export const DAILY_GOAL = 34

/** 每日新词目标（词/天）。**全 app 唯一来源**，不接受任何覆盖 */
export function getDailyGoal(): number {
  return DAILY_GOAL
}

/**
 * 兼容旧调用点的空实现：目标已经固定，不再允许写。
 *
 * ⚠️ 2026-11 起 `wordlord_state_v3.dailyGoal` 是**废弃字段**：老缓存里可能还躺着 20 / 30，
 * 但没有任何读取方了（唯一读它的 `getDailyGoal()` 已经改成返回常量），
 * 所以不需要 migration，也不需要清 —— 留着一个没人读的键，比写一段迁移代码安全。
 */
export function setDailyGoal(goal: number): void {
  void goal
}

/**
 * 「那一天背了多少个词」的**唯一读法**：数据页的节奏图、节奏合计、达标天数、活跃度带、
 * 环比、最近速度、连续天数全部走它，所以同一天的这几个数字不可能再打架。
 *
 * 今天这一格用**今日单词表**（`loadTodayCounts().wordCount`，和首页「今日 X/34」、「今日」
 * 那一行、达标天数完全同一个数）并兜住「跨天」的情形：去重表刚被清空、`daily` 里
 * 今天的记录还在时，取较大的那个（= 用户今天真背过的词数）。
 * 不是拿 `readState().daily` 自己拼：`daily[今天]` 可能是老口径残留
 * （用户截图里那个「合计 1 个词」的来源），也可能是另一份 `readState()` 里的过期副本。
 */
function dailyLoggedCount(daily: Record<string, number>, key: string, today: string): number {
  if (key === today) return Math.max(loadTodayCounts().wordCount, daily[key] ?? 0)
  return daily[key] ?? 0
}

/** 一天的量：日期 + 星期几的短标签 + 当天的词数 */
export interface DayCount {
  date: string
  /** 星期几，一个字：日 / 一 / 二 … */
  label: string
  count: number
  isToday: boolean
}

/**
 * 最近 N 天（含今天）每天背了多少个词，**从早到晚**排，给柱状图直接用。
 * 没有记录的那天是 0（不是缺数据 —— 那天确实没背）。
 */
export function getDailyCounts(days = 7): DayCount[] {
  const daily = readState().daily || {}
  const today = todayString()
  const labels = ['日', '一', '二', '三', '四', '五', '六']
  const out: DayCount[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = todayString(d)
    out.push({ date: key, label: labels[d.getDay()], count: dailyLoggedCount(daily, key, today), isToday: i === 0 })
  }
  return out
}

/**
 * 连续背了多少天。
 *
 * 规则：**今天背了就从今天起往前数**；今天还没背则从昨天起往前数 ——
 * 也就是说「今天还没开始」不算断签（不然每天零点一到，连续天数就归零了）。
 * 数据来自 daily 历史，不另存字段。
 */
export function getStreak(): number {
  const s = readState()
  const daily = s.daily || {}
  const today = todayString()
  // 今天这一格走 dailyLoggedCount（显示口径），历史那几格读 daily —— 和柱状图 / 活跃度同一把尺子
  const countOf = (key: string) => dailyLoggedCount(daily, key, today)
  const d = new Date()
  if (!countOf(todayString(d))) d.setDate(d.getDate() - 1)

  let streak = 0
  // 上限 62 天（历史只留这么久），避免脏数据把循环拖死
  while (streak < 62 && countOf(todayString(d))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// ---------- 学习计划 ----------

/** 今天（本地日期 YYYY-MM-DD）。计划页的日期选择器要用 */
export function todayISO(): string {
  return todayString()
}

// ---------- 考试锚点：读取 / 修改 ----------
// 常量（DEFAULT_EXAM_DATE / FIRST_ROUND_DEADLINE / EXAM_BUFFER_DAYS）在文件头部，
// 因为 AppState 的默认值要用它们。

/** 考试日期（用户改过就返回改过的，没改就是默认） */
export function getExamDate(): string {
  const d = readState().examDate
  return typeof d === 'string' && d.length === 10 ? d : DEFAULT_EXAM_DATE
}

/**
 * 改考试日期。只接受合法的 `YYYY-MM-DD`，其余（清空 / 乱填）一律回到默认值 ——
 * 这个字段是计划页的锚点，宁可回到默认值，也不要留一个算不出来的日期。
 */
export function setExamDate(date: string): void {
  const s = readState()
  s.examDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : DEFAULT_EXAM_DATE
  writeState(s)
}

/** 第一轮的最晚完成日期（常量，不随考试日期变） */
export function firstRoundDeadline(): string {
  return FIRST_ROUND_DEADLINE
}

/**
 * 完成日期有没有吃掉缓冲期（= 晚于 2026-12-02）。
 *
 * 返回：
 * - `ok`   能不能接受。`false` 时页面必须**拒绝这次设置**，不允许静默接受；
 * - `days` 晚了几天（`ok = true` 时是 0）—— 提示文案要用（「会晚 7 天」）；
 * - `date` **替代方案**：`ok = false` 时是满足缓冲期的那个日期（12-02），否则空串。
 */
export function checkBuffer(dateISO: string): { ok: boolean; date: string; days: number } {
  if (!dateISO) return { ok: true, date: '', days: 0 }
  const over = daysBetween(FIRST_ROUND_DEADLINE, dateISO)
  return over <= 0
    ? { ok: true, date: '', days: 0 }
    : { ok: false, date: FIRST_ROUND_DEADLINE, days: over }
}

/**
 * 按「每天 N 个」算完成日期。**纯算术，不替用户做决定。**
 *
 * 2026-11 之前这里会「越过 12-02 就压回 12-02、反推那天需要的每天量」——
 * 用户填 5 个结果页面给他算成 40 个，界面上显示的数字和他填的不一样。
 * 现在的口径（用户明确要求「计划完全由自己定」）：
 *
 * 1. 剩余 ÷ 每天 = 天数（向上取整）；2. 起点 + 天数 = 完成日；3. 到此为止。
 * 缓冲期（`FIRST_ROUND_DEADLINE = 2026-12-02`）降级成**提示**：
 * `checkBuffer()` 仍然会判「会晚几天」，但没有任何一处拿它去改用户填的值。
 *
 * `respectsBuffer` 保留在返回值里（调用方还在读），语义变成「只是算数」，恒为 true。
 * `remaining <= 0`（已经背完）返回空日期，调用方点一下什么都不会发生。
 */
export function planAdvice(
  remaining: number,
  perDay: number,
  today: string = todayISO()
): { days: number; date: string; perDay: number; respectsBuffer: boolean } {
  /**
   * 2026-11 用户要求：计划**完全由用户自己定**，到哪天背完、每天背几个都不许被系统改。
   *
   * 这里原来是「越过 12-02 就自动改成 12-02 之前能背完的量」—— 于是用户填多少都被
   * 悄悄改掉，界面上显示的数字和他填的不一样。现在这个函数只做除法：
   * 剩余 ÷ 每天 = 天数，加到今天就是完成日期，不做任何封顶。
   *
   * `respectsBuffer` 保留在返回值里（调用方还在读），语义变成「只是算数，不代表建议」，
   * 恒为 true —— 谁也别再拿它做拦截。
   */
  if (remaining <= 0 || perDay <= 0) {
    return { days: 0, date: '', perDay: 0, respectsBuffer: true }
  }
  const days = Math.ceil(remaining / perDay)
  return { days, date: addDaysToDate(today, days), perDay, respectsBuffer: true }
}

/**
 * 日期字符串按 **UTC 零点**解析：两个日期相减就是整天数，
 * 不受本地时区和夏令时影响（`new Date('2026-10-11')` 本来就是按 UTC 解析的，这里写明白）。
 */
function dateMs(s: string): number {
  return Date.parse(`${s}T00:00:00Z`)
}

/** to − from 的天数（to 在后面为正） */
function daysBetween(from: string, to: string): number {
  return Math.round((dateMs(to) - dateMs(from)) / 86400000)
}

/** 日期加 N 天，返回同样格式的字符串（计划页的「7 天后 / 30 天后」快捷按钮用它） */
export function addDaysToDate(s: string, n: number): string {
  const d = new Date(dateMs(s) + n * 86400000)
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${month}-${day}`
}

/** 一本书 + 一个档位的词条（内置读词表，上传的读缓存；和 store/books.ts 的 bookWords 同一套规则） */
function scopeWords(bookId: string, level: LevelKey): Word[] {
  const words = bookId === BUILTIN_BOOK_ID ? ALL_WORDS : asArray<Word>(getUploadBookWords(bookId))
  return wordsOfLevel(words, level)
}

export function getPlan(): StudyPlan | null {
  const p = readState().plan
  if (!p || !p.bookId) return null
  // 老计划没有 level 字段（2026-10 才补的）：一律当作「整本」
  const level: LevelKey = p.level || 'all'
  // 老计划没有 perDay 字段：当作「按日期」模式
  const perDay = typeof p.perDay === 'number' && p.perDay > 0 ? Math.round(p.perDay) : 0
  // 日期和每天的量至少要有一个，两个都没有说明数据坏了，当成没有计划
  if (!p.deadline && perDay <= 0) return null
  return { ...p, level, perDay }
}

/** 从今天到某个日期还有几天（今天 = 0，过去 = 负数）。计划页的日期选择器要用 */
export function daysUntil(dateISO: string): number {
  return daysBetween(todayString(), dateISO)
}

/**
 * 把 `YYYY-MM-DD` 显示成 `MM-DD`，**跨年时保留年份**。
 *
 * 为什么必须这么做：预测出来的完成日期很容易跨年（比如现在 10 月、按每天 12 个要背到明年 3 月），
 * 只写 `03-12` 会被读成「今年 3 月」—— 那是过去。计划页和主界面所有日期文案都走它。
 */
export function shortDate(dateISO: string): string {
  if (!dateISO) return ''
  return dateISO.slice(0, 4) === todayString().slice(0, 4) ? dateISO.slice(5) : dateISO
}

/**
 * 累计学习统计（数据页用）。**全部从 `daily` 历史算出来，不另存字段** ——
 * 不存第二份真相，就不会出现「统计说一套、历史说另一套」。
 *
 * ⚠️ 历史只留最近 62 天（`pruneDaily`），所以「最长连续 / 总词数」是**最近 62 天内**的账。
 */
export interface StudyStats {
  /** 所有历史加起来的词数（`daily` 加总） */
  totalWords: number
  /**
   * 累计**动过手**的词数（标记过 / 点过「我会了」，去重）。
   *
   * ⚠️ 2026-10 补的字段，修的是一个「数字自相矛盾」的硬伤：
   * `totalWords` 来自 `daily`，而 `daily` 只留最近 62 天，于是老用户会看到
   * 「总背过 0 个词」和「六级整体 4 / 1,824」同时出现在一屏上（用户的截图里就是这样）——
   * 数据面板一旦自相矛盾，用户就不信这一页的任何数字了。
   * 这个值直接从 `progress` / `mastered` 数出来，是**当前还看得见的足迹**，
   * 不受 62 天裁剪影响，和「词汇」区的进度是同一个来源，永远不会打架。
   */
  touchedWords: number
  /** 有背词记录的天数 */
  studyDays: number
  /** 当前连续天数（今天还没背就从昨天起数） */
  streak: number
  /** 历史最长连续天数 */
  bestStreak: number
  todayWords: number
  /** 最近 7 天合计 */
  weekWords: number
  /** 最近 30 天合计 */
  monthWords: number
  /** 最早有记录的那天；没记录时空串 */
  sinceDate: string
}

/**
 * 累计动过手的词数：`progress`（标记过）∪ `mastered`（点过我会了），去重。
 * 一个词从「生词本」毕业到「熟练掌握」时 progress 会被清掉，但 mastered 有它，
 * 所以这个数是**连续的**，不会因为掌握了一个词而减少。
 */
export function countTouchedWords(): number {
  const p = getProgress()
  const m = getMastered()
  const seen = new Set<string>()
  for (const w of Object.keys(p)) if (w && p[w] > 0) seen.add(w)
  for (const w of Object.keys(m)) if (w && m[w]) seen.add(w)
  return seen.size
}

export function getStudyStats(): StudyStats {
  const daily = readState().daily || {}
  const dates = Object.keys(daily)
    .filter((d) => daily[d] > 0)
    .sort()

  let totalWords = 0
  for (const d of dates) totalWords += daily[d]

  // 最长连续：有记录的日期已经排好序，相邻两天只差 1 天就接着数
  let bestStreak = 0
  let run = 0
  let prev = ''
  for (const d of dates) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1
    if (run > bestStreak) bestStreak = run
    prev = d
  }

  return {
    totalWords,
    touchedWords: countTouchedWords(),
    studyDays: dates.length,
    streak: getStreak(),
    bestStreak,
    todayWords: loadTodayCounts().wordCount,
    weekWords: getDailyCounts(7).reduce((n, d) => n + d.count, 0),
    monthWords: getDailyCounts(30).reduce((n, d) => n + d.count, 0),
    sinceDate: dates.length ? dates[0] : ''
  }
}

/**
 * 最近的实际节奏：最近 7 天里**有记录的那些天**平均每天背多少个。
 *
 * 分母用「有记录的天数」而不是硬除 7：中间空几天不该把速度拉低 —— 算出来的是
 * 「你在学习日里的速度」，所以调用方要把这个平均值写出来让用户自己判断。
 * 主界面的「近 7 天」和计划页的预测都用它。
 */
export function getRecentPace(): { avgPerDay: number; weekTotal: number; activeDays: number } {
  const week = getDailyCounts(7)
  const weekTotal = week.reduce((n, d) => n + d.count, 0)
  const activeDays = week.filter((d) => d.count > 0).length
  const avgPerDay = activeDays > 0 ? Math.round((weekTotal / activeDays) * 10) / 10 : 0
  return { avgPerDay, weekTotal, activeDays }
}

/**
 * 两个等长相邻周期的对比（数据页「环比」用）。
 *
 * 为什么需要它：累计区的几个总量（本周 / 近 30 天）单看只是一个孤零零的数字，
 * 用户看不出「比之前快了还是慢了」。大厂的数据面板都会给一个**同长度上一周期**作参照，
 * 所以这里统一算「本周期 vs 上一周期」。
 *
 * ⚠️ 全部从 `daily` 历史现算，**不新增任何缓存字段** —— 口径只有一个来源。
 */
export interface PeriodCompare {
  /** 本周期合计 */
  current: number
  /** 上一周期合计（长度相同、紧挨在本周期之前） */
  previous: number
  /** 差值（current − previous），正数是变多 */
  delta: number
  /**
   * 环比百分比，四舍五入到整数。
   * 上一周期是 0 时返回 `null` —— 除数为 0 时「增长无穷大」没有意义，
   * 页面要自己决定怎么显示（通常是「首个周期」而不是「+∞%」）。
   */
  percent: number | null
  /** 本周期内有记录的天数（活跃度分母） */
  activeDays: number
}

/**
 * 取最近 `days` 天 vs 紧挨着的前 `days` 天的合计对比。
 * 例：`comparePeriods(7)` = 最近 7 天 vs 再往前 7 天，就是常说的「周环比」。
 */
export function comparePeriods(days = 7): PeriodCompare {
  const current = getDailyCounts(days).reduce((n, d) => n + d.count, 0)
  const previous = getDailyCounts(days * 2)
    .slice(0, days)
    .reduce((n, d) => n + d.count, 0)
  const activeDays = getDailyCounts(days).filter((d) => d.count > 0).length
  const delta = current - previous
  return {
    current,
    previous,
    delta,
    percent: previous > 0 ? Math.round((delta / previous) * 100) : null,
    activeDays
  }
}

/**
 * 最近 N 天的「学习日历」格子：给数据页画一条紧凑的活跃度时间带。
 *
 * 和柱状图的分工：柱状图回答「每天背了多少」（纵轴是量），
 * 这个回答「哪天来过、哪天断了」（只有有 / 无两态）—— 连续天数一断就看得很清楚，
 * 这是纯柱状图看不出来的。
 */
export interface ActivityDay {
  date: string
  count: number
  /** 有记录 = true；页面用它决定格子的深浅（两态，不传颜色） */
  active: boolean
  isToday: boolean
}

export function getActivityDays(days = 30): ActivityDay[] {
  const daily = readState().daily || {}
  const today = todayString()
  const out: ActivityDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = todayString(d)
    const count = dailyLoggedCount(daily, key, today)
    out.push({ date: key, count, active: count > 0, isToday: i === 0 })
  }
  return out
}

/**
 * 按**实际节奏**预测：把 `remaining` 个词背完要几天、哪天完，以及比 `deadline` 早/晚几天。
 *
 * ⚠️ 和 `getPlanStatus()` 里的预测是**两件事**，别混：
 * - 这里永远用**最近的实际速度**（回答「照我现在这样，哪天能完」）；
 * - `getPlanStatus()` 在「按每天数量」模式下用的是**你定的那个量**（回答「按我的承诺，哪天完」）。
 * 符号约定：`lateDays > 0` = 预计日期晚于目标 = **会晚到**；`< 0` = 能提前。
 */
export function forecastByPace(
  remaining: number,
  deadline = ''
): { etaDate: string; etaDays: number; lateDays: number } {
  const { avgPerDay } = getRecentPace()
  if (avgPerDay <= 0 || remaining <= 0) return { etaDate: '', etaDays: 0, lateDays: 0 }
  const etaDays = Math.ceil(remaining / avgPerDay)
  const etaDate = addDaysToDate(todayString(), etaDays)
  const lateDays = deadline ? daysBetween(deadline, etaDate) : 0
  return { etaDate, etaDays, lateDays }
}

/**
 * 一批词里「已经背过」的有多少个：**标记过（`progress`）∪ 已掌握（`mastered`）去重**。
 *
 * ⚠️ 2026-11 修的是一个会**低估真实进度**的口径 bug（用户对 R3 的原话）：
 * 在这之前「某本书已背」只数 `mastered`，而用户真正的习惯是在翻书页点标记圆圈；
 * 一个词从生词本毕业时才进 `mastered`（`masterWord` 还会把标记清零），
 * 所以「已掌握 221 个词」会和「六级整体 80 / 1824」同时出现 —— 后者把前者的贡献漏掉了。
 *
 * 分母仍然是这一档的**词表总词数**（不是标记数），所以两个刻度不会混：
 * 分子是「这本书里动过手的词」，分母是「这本书有多少词」。
 */
export function countLearnedWords(
  words: Word[],
  progress?: Record<string, number>,
  mastered?: Record<string, number>
): number {
  const p = progress ?? getProgress()
  const m = mastered ?? getMastered()
  let n = 0
  for (const w of words) if ((p[w.word] ?? 0) > 0 || Boolean(m[w.word])) n++
  return n
}

/**
 * 建计划前的预览：这本书这一档共多少词、已经背过多少（标记 ∪ 已掌握，去重）。
 * 不依赖计划，所以「定计划」表单能实时告诉你「每天要背几个 / 哪天能背完」。
 */
export function bookScope(bookId: string, level: LevelKey = 'all'): { total: number; done: number } {
  const words = scopeWords(bookId, level)
  return { total: words.length, done: countLearnedWords(words) }
}

/**
 * 建立 / 调整计划：**同一本书同一档时保留原来的起点和分母**（用户是在「调整」，
 * 不是「重开」—— 否则改一次日期，领先/落后就归零，历史全丢了）；
 * 换了书或换了档才重新快照，不然基线会串到别的书上。
 *
 * `deadline` 和 `perDay` 传一个就行：给了日期就是「按日期」模式（perDay 传 0），
 * 给了每天的量就是「按每天数量」模式（deadline 传空串）。
 */
export function setPlan(
  bookId: string,
  level: LevelKey,
  deadline: string,
  perDay: number
): StudyPlan {
  const prev = getPlan()
  const sameScope = Boolean(prev && prev.bookId === bookId && prev.level === level)
  const words = scopeWords(bookId, level)

  const plan: StudyPlan = {
    bookId,
    level,
    deadline: perDay > 0 ? '' : deadline,
    perDay: perDay > 0 ? Math.round(perDay) : 0,
    startedAt: sameScope && prev ? prev.startedAt : todayString(),
    // 起点 / 分母都用「标记 ∪ 已掌握」（和进度条同一个口径，见 countLearnedWords）
    baseDone: sameScope && prev ? prev.baseDone : countLearnedWords(words),
    scopeTotal: sameScope && prev ? prev.scopeTotal : words.length
  }
  const s = readState()
  s.plan = plan
  writeState(s)
  return plan
}

export function clearPlan(): void {
  const s = readState()
  s.plan = null
  writeState(s)
}

/**
 * 计划的实时状态。全部算出来，页面只管画：
 *
 * ⚠️ **两个刻度别混**（第一版就混了，测试抓出来的）：
 * - `done` / `scopeTotal` 是**整本书的绝对进度**（已掌握 320 / 424）——
 *   只有这样「背完」才是能到达的 100%；如果分子用「计划期增量」、分母用「全书总词数」，
 *   那么建计划前已经掌握的那部分永远补不上，计划**永远无法完成**。
 * - `plannedDone` 是**应完成的绝对位置**，从 `baseDone` 起算：
 *   计划期真正要补的是「建计划时还没掌握的那部分」，
 *   所以 应完成 = baseDone + (scopeTotal − baseDone) × 已过天数 / 总天数。
 * - 领先/落后 = 绝对进度 − 应完成绝对位置；建计划当天两者都等于 baseDone，差值是 0。
 * - 每天要背 = 剩余 ÷ (剩余天数 + 1)（含今天，所以「今天到期」时就是「今天全背完」）。
 */
export function getPlanStatus(): PlanStatus | null {
  const plan = getPlan()
  if (!plan) return null

  const words = scopeWords(plan.bookId, plan.level)
  // 上传的词书被删了：词表是空的，但计划还指着它 —— 页面要能说清这件事
  const bookMissing = words.length === 0 && plan.scopeTotal > 0

  const scopeTotal = plan.scopeTotal || words.length
  // ⚠️ 分子是「标记 ∪ 已掌握」（去重），和 `bookScope()` / 数据页「六级整体」同一个口径：
  // 用户是在翻书页点标记的，如果这里只数已掌握，计划进度条会长期钉在 0 不动。
  const done = Math.min(Math.max(countLearnedWords(words), 0), scopeTotal)
  const remaining = Math.max(scopeTotal - done, 0)

  const today = todayString()
  const hasDeadline = Boolean(plan.deadline)
  const elapsedDays = Math.max(daysBetween(plan.startedAt, today), 0)

  // ---- 每天要背几个 ----
  // 模式 B（你定了每天的量）：就是那个量
  // 模式 A（你定了日期）：剩余 ÷ (剩余天数 + 1)，含今天 → 截止日当天就是「今天全背完」
  const daysRaw = hasDeadline ? daysBetween(today, plan.deadline) : 0
  const daysLeft = hasDeadline ? Math.max(daysRaw, 0) : 0
  const perDay =
    plan.perDay > 0 ? plan.perDay : remaining > 0 ? Math.ceil(remaining / (daysLeft + 1)) : 0

  // ---- 应完成到哪儿（算领先/落后）----
  // 模式 A：把「计划期要补的量」按目标日期线性铺开
  // 模式 B：baseDone + 每天的量 × 已经过了几天（按你自己定的节奏算今天应该到哪儿）
  const totalDays = hasDeadline ? Math.max(daysBetween(plan.startedAt, plan.deadline), 1) : 0
  const baseFloor = Math.min(plan.baseDone, scopeTotal)
  const plannedDone = hasDeadline
    ? Math.min(
        baseFloor +
          Math.round(
            (Math.max(scopeTotal - baseFloor, 0) * Math.min(elapsedDays, totalDays)) / totalDays
          ),
        scopeTotal
      )
    : Math.min(baseFloor + plan.perDay * elapsedDays, scopeTotal)

  // ---- 预测 ----
  // 模式 B 用你定的量（那是你的承诺，可预测）；模式 A 优先用最近实际速度，没数据才退回计划节奏
  const pace = getRecentPace()
  const avgPerDay = pace.avgPerDay
  const etaByPlan = plan.perDay > 0 || avgPerDay <= 0
  const etaBasis = plan.perDay > 0 ? plan.perDay : avgPerDay > 0 ? avgPerDay : perDay
  const etaDays = remaining > 0 && etaBasis > 0 ? Math.ceil(remaining / etaBasis) : 0
  const etaDate = etaDays > 0 ? addDaysToDate(today, etaDays) : ''
  // 只有模式 A 才有「赶不赶得上目标日」这回事
  const etaLateDays = etaDate && hasDeadline ? daysBetween(plan.deadline, etaDate) : 0

  return {
    plan,
    scopeTotal,
    done,
    baseDone: plan.baseDone,
    remaining,
    daysLeft,
    totalDays,
    plannedDone,
    gap: done - plannedDone,
    perDay,
    hasDeadline,
    expired: hasDeadline && daysRaw < 0,
    finished: remaining === 0,
    bookMissing,
    avgPerDay,
    etaDays,
    etaDate,
    etaBasis,
    etaByPlan,
    etaLateDays
  }
}

/** 成功翻一页后 +1 */
export function incrementTodayPageCount(): void {
  const s = readState()
  resetToday(s)
  s.todayPageCount += 1
  writeState(s)
}

/** 成功标记一次后 +1 */
export function incrementTodayMarkCount(): void {
  const s = readState()
  resetToday(s)
  s.todayMarkCount += 1
  writeState(s)
}

// ---------- 复习（生词本）：复习记录 + 每次复习几个 ----------

/**
 * 生词本里「每次复习几个」的默认值。
 *
 * ⚠️ **2026-11（R7）从 10 改成 20**。原来的注释写的是「和翻书页一页的词数一致」，
 * 但这两个数已经是两件事了：翻书一页 10 个这个词只在翻书页里成立，
 * 而复习的默认量要回答的是「今天先动多少个」—— 用户提 R7 的原话是
 * 「显示今日优先复习 Top 20」「一次只领 20 个，做完可再领下一批」。
 * 首页 / 数据页都按这个默认值报「今日复习 N 个」，所以它必须是 20，
 * 否则首页写 10、用户心里想的是 20，两处立刻对不上。
 * 用户自己填过的数（`reviewBatch`）优先，这里只是没填过时的答案。
 */
export const REVIEW_BATCH_DEFAULT = 20

/** 复习记录的读法：老缓存里可能整个字段都没有，读出来一律兜成空表 */
export function getReviewLog(): Record<string, ReviewRecord> {
  const r = readState().reviews
  return r && typeof r === 'object' ? r : {}
}

/**
 * 记一次复习：复习次数 +1、时间刷新。
 *
 * 这份记录现在有两个用处（用户 2026-10 调整了复习记录页的定位之后）：
 * 1. 分档页每行显示「复习 N 次」；
 * 2. 「随机抽查」的权重 —— 最近复习过的词稍微容易抽中。
 *
 * 判过就算复习过 —— 点「我会了」和点标记圆圈（+1）都会记一笔，
 * 只有「跳过」不记（没判的词不该算复习过）。
 */
export function markReviewed(word: string): void {
  if (!word) return
  const s = readState()
  const prev = s.reviews[word]
  s.reviews = { ...s.reviews, [word]: { at: Date.now(), times: (prev ? prev.times : 0) + 1 } }
  writeState(s)
}

/**
 * 复习前给一个词拍张快照，给「上一步」用。
 *
 * 为什么复习页必须有撤销：一屏一个词、手指连着点，**点错一个按钮的代价很大**——
 * 「我会了」会把词从生词本里毕业出去，标记清零；「还不认识」会把记忆打回第 1 档。
 * 这两个动作都不可逆，而它们只差 24rpx。大厂做自评式复习页（Anki、墨墨）都带撤销。
 */
export interface WordSnapshot {
  word: string
  /** 标记次数（0 = 不在生词本里） */
  markCount: number
  /** 掌握时间戳（0 = 没掌握） */
  masteredAt: number
  /** 复习记录；null = 当时还没记录 */
  review: ReviewRecord | null
}

export function snapshotWord(word: string): WordSnapshot {
  const p = getProgress()
  const m = getMastered()
  const r = getReviewLog()[word]
  return {
    word,
    markCount: p[word] ?? 0,
    masteredAt: m[word] ?? 0,
    review: r ? { at: r.at, times: r.times } : null
  }
}

/**
 * 把快照放回去（撤销）。
 *
 * ⚠️ **不动今日计数**：词确实被动手碰过一次，「今天背过 N 个词」不该因为撤销而回退
 * （那个数字是「今天动过多少词」的流水，不是「现在有多少词在生词本里」的存量）。
 * 这一点在页面上不解释，用户也不会察觉（差一个词）。
 */
export function restoreWord(s: WordSnapshot): void {
  if (!s || !s.word) return

  const p = getProgress()
  if (s.markCount > 0) p[s.word] = s.markCount
  else delete p[s.word]
  safeWrite(PROGRESS_KEY, p)

  const m = getMastered()
  if (s.masteredAt > 0) m[s.word] = s.masteredAt
  else delete m[s.word]
  safeWrite(MASTERED_KEY, m)

  const st = readState()
  const reviews = { ...(st.reviews || {}) }
  if (s.review) reviews[s.word] = s.review
  else delete reviews[s.word]
  st.reviews = reviews
  writeState(st)

  emitChange('word', s.word)
}

/**
 * 时间戳说成人话：「今天 / 昨天 / N 天前 / N 个月前」。
 * 复习卡片上要写清「上次是什么时候见的」，这个换算只该有一份。
 */
export function relativeDay(ts: number): string {
  if (!ts || ts <= 0) return '没记过'
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  return `${Math.round(days / 30)} 个月前`
}

/**
 * 生词本「每次复习几个」。
 *
 * 用户 2026-10 要求**可以填任意个数**，所以页面上是一个输入框；这个值只是「上次填的数」，
 * 下次进生词本时作为输入框的初值。0 = 全部，负数/非法值一律兜回默认值。
 */
export function getReviewBatch(): number {
  const n = readState().reviewBatch
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : REVIEW_BATCH_DEFAULT
}

export function setReviewBatch(size: number): void {
  const s = readState()
  s.reviewBatch = size
  writeState(s)
}

// ---------- 云端同步用的导入 / 导出 ----------
//
// 云端两个集合：
//   user_words  一个词一条记录（word / markCount / mastered）
//   user_books  一本上传的词书一条记录（含全部词条）
// 头像昵称和阅读位置放在 user_profile 的同一份文档里（在 sync.ts 那侧处理）。
//
// 合并规则（两边都可能有数据，必须能收敛，不能来回打架）：
//   markCount  取两边较大的 —— 次数是「标了多少下」，取大不会丢信息
//   mastered   取「或」—— 任何一台设备点过「我会了」就算掌握
//   pages      取两边较远的那页
// 合并完如果本地跟云端不一致，把新值回推一次，两边就对齐了。

/** 云端一条标记记录 */
export interface CloudWordRecord {
  word: string
  markCount: number
  mastered: boolean
}

/**
 * 把本地标记状态导成云端格式。
 * 不传 words 就导全部（登录时首次上传用）；传了只导这几个词（日常增量用）。
 */
export function exportWordRecords(words?: string[]): CloudWordRecord[] {
  const p = getProgress()
  const m = getMastered()
  const keys = words ?? Array.from(new Set([...Object.keys(p), ...Object.keys(m)]))
  const out: CloudWordRecord[] = []
  for (const w of keys) {
    if (!w) continue
    out.push({ word: w, markCount: p[w] ?? 0, mastered: Boolean(m[w]) })
  }
  return out
}

/**
 * 把云端记录合并进本地，返回「合并后的值跟云端不一样、需要回推」的记录。
 * 合并结果会直接写进本地缓存（一次写盘，不是逐个词写）。
 */
export function mergeWordRecords(remote: CloudWordRecord[]): CloudWordRecord[] {
  const p = getProgress()
  const m = getMastered()
  const needPush: CloudWordRecord[] = []
  let touched = false

  for (const r of remote) {
    if (!r || !r.word) continue

    const localMark = p[r.word] ?? 0
    const remoteMark = Math.min(Math.max(r.markCount || 0, 0), MAX_MARK)
    const localDone = Boolean(m[r.word])
    const remoteDone = Boolean(r.mastered)

    const mark = Math.max(localMark, remoteMark)
    const done = localDone || remoteDone

    if (mark !== localMark) {
      if (mark > 0) p[r.word] = mark
      else delete p[r.word]
      touched = true
    }
    if (done !== localDone) {
      // 云端带过来的掌握时间戳已经丢了，用当前时间补一个（只是个标记位，不影响功能）
      if (done) m[r.word] = Date.now()
      else delete m[r.word]
      touched = true
    }

    if (mark !== remoteMark || done !== remoteDone) needPush.push({ word: r.word, markCount: mark, mastered: done })
  }

  if (touched) {
    safeWrite(PROGRESS_KEY, p)
    safeWrite(MASTERED_KEY, m)
  }
  return needPush
}

/** 云端一本词书 */
export interface CloudBookPayload {
  id: string
  title: string
  createdAt: number
  count: number
  words: Word[]
}

/** 取一本上传词书的完整内容，用于推给云端；本地没有这本返回 null（说明已删） */
export function bookPayload(id: string): CloudBookPayload | null {
  const meta = getUploadBooks().find((b) => b.id === id)
  if (!meta) return null
  return {
    id: meta.id,
    title: meta.title,
    createdAt: meta.createdAt,
    count: meta.count,
    words: getUploadBookWords(meta.id)
  }
}

/**
 * 云端词书合并进本地：本地没有的补进来；同 id 的以本地为准（id 是本机生成的，
 * 云端有说明是另一台设备传的，不会重名）。
 * 返回本地有、云端没有的 id（要回推上去）。
 */
export function mergeBooks(remote: CloudBookPayload[]): { pulled: number; pushIds: string[] } {
  const books = getUploadBooks()
  const localIds = new Set(books.map((b) => b.id))
  const remoteIds = new Set<string>()
  let pulled = 0

  for (const r of remote) {
    if (!r || !r.id) continue
    remoteIds.add(r.id)
    if (localIds.has(r.id)) continue
    if (books.length >= MAX_UPLOAD_BOOKS) break

    const words = (r.words || []).slice(0, MAX_UPLOAD_WORDS)
    safeWrite(uploadBookKey(r.id), words)
    books.push({
      id: r.id,
      title: r.title || '云端词表',
      createdAt: r.createdAt || Date.now(),
      count: words.length
    })
    localIds.add(r.id)
    pulled++
  }

  if (pulled > 0) safeWrite(UPLOAD_INDEX_KEY, books)

  return { pulled, pushIds: books.filter((b) => !remoteIds.has(b.id)).map((b) => b.id) }
}

/** 阅读位置：最后翻的那本书那一档 + 每本书每个档次停在第几页 */
export interface ReadingState {
  lastReader: { bookId: string; level: string } | null
  pages: Record<string, number>
}

export function exportReadingState(): ReadingState {
  const s = readState()
  return { lastReader: s.lastReader, pages: s.pages }
}

/**
 * 合并阅读位置：同一档取翻得更远的那页；lastReader 本地有就保留本地的。
 * 返回合并后的状态（调用方会把它整个推回云端，一份文档很小，不用精打细算）。
 */
export function mergeReadingState(remote: ReadingState | null): { pulled: boolean; state: ReadingState } {
  const local = exportReadingState()
  if (!remote) return { pulled: false, state: local }

  const s = readState()
  const pages: Record<string, number> = { ...s.pages }
  let changed = false

  const remotePages = remote.pages || {}
  for (const key of Object.keys(remotePages)) {
    const r = remotePages[key] || 0
    if (r > (pages[key] || 0)) {
      pages[key] = r
      changed = true
    }
  }
  if (!s.lastReader && remote.lastReader) {
    s.lastReader = remote.lastReader
    changed = true
  }

  if (changed) {
    s.pages = pages
    writeState(s)
  }
  return { pulled: changed, state: exportReadingState() }
}

// ---------- 本地备份 / 恢复（云同步没开通时唯一的保险） ----------

/**
 * 为什么必须有这个：**云同步是可选的，而 `cloud/config.ts` 里的环境 ID 默认是空的**
 * —— 也就是说绝大多数用户的数据只活在这台手机的微信缓存里，用户一「清除缓存」、
 * 一换手机、一卸载重装，几个月的学习进度就没了，而且**没有任何补救手段**。
 * 大厂产品的底线是「数据可带走」，这里用最低成本的方式做到：
 * 把 `wordlord_*` 全部键导出成一段 JSON（复制到剪贴板 / 微信收藏），以后粘回来即可恢复。
 *
 * 只导出自己的键（前缀 `wordlord_`），不碰同一个小程序里别人的数据。
 */
const BACKUP_PREFIX = 'wordlord_'
const BACKUP_FORMAT = 1

export interface BackupPayload {
  format: number
  app: string
  exportedAt: string
  data: Record<string, unknown>
}

/** 导出：返回一段可以贴到任何地方的 JSON 文本 */
export function exportBackup(): string {
  const data: Record<string, unknown> = {}
  try {
    const info = Taro.getStorageInfoSync()
    for (const key of info.keys || []) {
      if (key.indexOf(BACKUP_PREFIX) !== 0) continue
      const v = Taro.getStorageSync(key)
      if (v !== '' && v !== null && v !== undefined) data[key] = v
    }
  } catch {
    // 读不出来就导出一份空的，调用方会提示「没有可备份的数据」
  }
  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    app: 'wordlord',
    exportedAt: new Date().toISOString(),
    data
  }
  return JSON.stringify(payload)
}

/** 备份里有多少个词（导入前给用户看清「这份备份是什么」） */
export function inspectBackup(json: string): { ok: boolean; words: number; mastered: number; days: number; message: string } {
  try {
    const payload = JSON.parse(json) as BackupPayload
    if (!payload || payload.app !== 'wordlord' || !payload.data) {
      return { ok: false, words: 0, mastered: 0, days: 0, message: '这不是单词君的备份内容' }
    }
    const progress = (payload.data[PROGRESS_KEY] || {}) as Record<string, number>
    const mastered = (payload.data[MASTERED_KEY] || {}) as Record<string, number>
    const state = (payload.data[STATE_KEY] || {}) as Partial<AppState>
    return {
      ok: true,
      words: Object.keys(progress).length,
      mastered: Object.keys(mastered).length,
      days: Object.keys(state.daily || {}).length,
      message: `备份里有 ${Object.keys(progress).length} 个生词、${Object.keys(mastered).length} 个已掌握`
    }
  } catch {
    return { ok: false, words: 0, mastered: 0, days: 0, message: '这段内容不是有效的备份' }
  }
}

/**
 * 恢复：把备份里的 `wordlord_*` 写回本地。
 * **覆盖式**（不是合并）—— 恢复的语义就是「回到那个时间点」，合并会让规则变得说不清。
 */
export function importBackup(json: string): { ok: boolean; message: string } {
  let payload: BackupPayload
  try {
    payload = JSON.parse(json) as BackupPayload
  } catch {
    return { ok: false, message: '这段内容不是有效的备份' }
  }
  if (!payload || payload.app !== 'wordlord' || !payload.data || typeof payload.data !== 'object') {
    return { ok: false, message: '备份内容不完整' }
  }

  const entries = Object.entries(payload.data).filter(([k]) => k.indexOf(BACKUP_PREFIX) === 0)
  if (!entries.length) return { ok: false, message: '备份里没有任何学习数据' }

  let written = 0
  for (const [k, v] of entries) if (safeWrite(k, v)) written++
  if (written === entries.length) clearWriteError()

  return {
    ok: written > 0,
    message:
      written === entries.length
        ? `已恢复 ${written} 项数据`
        : `只写进去 ${written} / ${entries.length} 项，本地空间可能不够`
  }
}


// ---------- 操作偏好（设置页）----------
//
// 只影响「怎么操作」，不碰任何学习数据：换手机 / 清缓存不会丢进度，
// 但这几项会跟着本地缓存一起没，所以默认值必须是「大多数人顺手」的那一档。
// 单独一个 key，不去动 readState 的结构（那份结构牵着云同步）。

export type HandPref = 'right' | 'left'
export type FontPref = 'normal' | 'large'

export interface UiPrefs {
  /** 惯用手：决定主按钮落在右下还是左下 */
  hand: HandPref
  /** 卡片字号：large 把单词和释义各放大一档 */
  font: FontPref
  /** 点按钮 / 判定时的轻震动 */
  haptics: boolean
  /** 新卡出现时自动朗读单词（联网发音，走有道 dictvoice） */
  autoSpeak: boolean
}

const UI_PREFS_KEY = 'wordlord_ui_v1'
const UI_DEFAULTS: UiPrefs = { hand: 'right', font: 'normal', haptics: true, autoSpeak: false }

/**
 * ⚠️ 性能：`getUiPrefs()` 会被组件在**每次渲染**里调用（翻卡页每翻一张都重渲染）。
 * 直接 `Taro.getStorageSync` 是同步跨桥，一帧一次会把滚动拖出掉帧。
 * 所以读到的值缓存在模块里，只有 setUiPrefs 时更新。
 */
let uiPrefsCache: UiPrefs | null = null

export function getUiPrefs(): UiPrefs {
  if (uiPrefsCache) return uiPrefsCache
  try {
    const raw = Taro.getStorageSync(UI_PREFS_KEY)
    if (!raw || typeof raw !== 'object') {
      uiPrefsCache = { ...UI_DEFAULTS }
      return uiPrefsCache
    }
    const r = raw as Partial<UiPrefs>
    uiPrefsCache = {
      hand: r.hand === 'left' ? 'left' : 'right',
      font: r.font === 'large' ? 'large' : 'normal',
      haptics: r.haptics !== false,
      autoSpeak: r.autoSpeak === true
    }
    return uiPrefsCache
  } catch {
    uiPrefsCache = { ...UI_DEFAULTS }
    return uiPrefsCache
  }
}

export function setUiPrefs(patch: Partial<UiPrefs>): UiPrefs {
  const next = { ...getUiPrefs(), ...patch }
  uiPrefsCache = next
  try {
    Taro.setStorageSync(UI_PREFS_KEY, next)
  } catch {
    // 写不进去就只影响这一次的显示，不阻断操作
  }
  return next
}
