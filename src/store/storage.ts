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

/**
 * 圆圈填充色，按 mark_count 从浅到深。
 * 共 6 档，mark_count 6 和 7 都用最深的红色。
 *
 * ⚠️ 2026-10 把第 1 档从最浅的灰 `#E5E5EA`（对白底 1.2:1）换成**淡蓝** `#CFE3FF`：
 * 灰得太浅，和「没标记」（透明底 + 灰描边）几乎分不出来，用户标了一次却没有反馈感。
 * 淡蓝既是明确的「动过手」，也顺着第 2 档的蓝往下走 → 浅蓝/蓝/黄/橙/红/深红
 * 是一条「越来越熟」的阶梯。
 */
const MARK_COLORS = ['#CFE3FF', '#007AFF', '#FFCC00', '#FF9500', '#FF3B30', '#D70015']

/**
 * 每档填充色上的数字颜色。
 * 浅底（浅灰 / 黄 / 橙）用主文字色，深底（蓝 / 红 / 深红）用白色，保证对比度。
 */
const MARK_TEXT_COLORS = ['#1D1D1F', '#FFFFFF', '#1D1D1F', '#1D1D1F', '#FFFFFF', '#FFFFFF']

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

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = Taro.getStorageSync(key)
    return v === '' || v === null || v === undefined ? fallback : (v as T)
  } catch {
    return fallback
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
  Taro.setStorageSync(MARKED_AT_KEY, t)
}

/** mark_count +1，返回本次是否真的加上了（已满则不动，返回 false）。 */
export function incrementMark(word: string): boolean {
  const p = getProgress()
  const cur = p[word] ?? 0
  if (cur >= MAX_MARK) return false
  p[word] = cur + 1
  Taro.setStorageSync(PROGRESS_KEY, p)
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
  Taro.setStorageSync(PROGRESS_KEY, p)
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

/**
 * 挑这一批要复习的词：**优先挑刚在翻书页标记过的**（markedAt 倒序）。
 * 老数据没有时间戳（markedAt = 0）的排最后，同一时间戳的按标记次数多的、字母序靠前的排。
 * size <= 0 表示全部。
 */
export function pickReviewBatch(size: number): PoolWord[] {
  const pool = getVocabPool().sort(
    (a, b) => b.markedAt - a.markedAt || b.markCount - a.markCount || a.word.localeCompare(b.word)
  )
  return size > 0 ? pool.slice(0, size) : pool
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
  Taro.setStorageSync(PROGRESS_KEY, p)
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
  Taro.setStorageSync(MASTERED_KEY, m)

  const p = getProgress()
  if (p[word]) {
    delete p[word]
    Taro.setStorageSync(PROGRESS_KEY, p)
  }

  // 「我会了」也算今天背过了一个词（和点标记同一个口径）
  addTodayWord(word)

  emitChange('word', word)
}

/** 点错了撤回：这个词重新回到翻书列表。 */
export function unmasterWord(word: string): void {
  const m = getMastered()
  delete m[word]
  Taro.setStorageSync(MASTERED_KEY, m)
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
  Taro.setStorageSync(uploadBookKey(id), capped)

  const meta: UploadBookMeta = { id, title, createdAt: Date.now(), count: capped.length }
  Taro.setStorageSync(UPLOAD_INDEX_KEY, [...books, meta])
  emitChange('book', id)
  return meta
}

export function removeUploadBook(id: string): void {
  Taro.setStorageSync(UPLOAD_INDEX_KEY, getUploadBooks().filter((b) => b.id !== id))
  Taro.removeStorageSync(uploadBookKey(id))
  emitChange('book-removed', id)
}

/** 「我的上传」里所有书的词数合计 */
export function countUploadWords(): number {
  return getUploadBooks().reduce((n, b) => n + b.count, 0)
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
  /** 每日目标（词/天），用来画今日进度条。0 = 不限 */
  dailyGoal: number
  /** 最后一次打开的翻书页，给底部 Tab 栏的「翻书」跳回去用 */
  lastReader: { bookId: string; level: string } | null
  /** 复习记录：word -> 复习过几次 / 最后一次复习的时间。只存本地，不上云 */
  reviews: Record<string, ReviewRecord>
  /** 生词本「每次复习几个」：0 = 全部。只存本地 */
  reviewBatch: number
  /** 学习计划（在某个日期前背完某本词书）。null = 没定计划。只存本地 */
  plan: StudyPlan | null
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
  dailyGoal: 20,
  lastReader: null,
  reviews: {},
  reviewBatch: 10,
  plan: null
}

function readState(): AppState {
  return { ...DEFAULT_STATE, ...readJson<Partial<AppState>>(STATE_KEY, {}) }
}

function writeState(s: AppState): void {
  Taro.setStorageSync(STATE_KEY, s)
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

  return dirty
}

/**
 * 按当前口径重算「今天背过的词」：**今天标记过的**（`markedAt` 是今天）+ **今天掌握的**
 * （`mastered` 时间戳是今天）。
 *
 * 只在换口径时用一次 —— 正常情况下这张表是 `addTodayWord()` 增量写出来的，不需要重算。
 * 这也顺手回答了「改口径之前今天已经标过的词算不算」：算，能还原出来。
 */
function rebuildTodayWords(): Record<string, number> {
  const today = todayString()
  const out: Record<string, number> = {}
  const isToday = (ts: unknown) => typeof ts === 'number' && ts > 0 && todayString(new Date(ts)) === today

  const markedAt = getMarkedAt()
  for (const w of Object.keys(markedAt)) if (isToday(markedAt[w])) out[w] = 1

  const mastered = getMastered()
  for (const w of Object.keys(mastered)) if (isToday(mastered[w])) out[w] = 1

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
    // 顺手记进「每天背了多少」的历史（主界面的 7 天节奏 + 连续天数都用它）
    const today = todayString()
    if (!s.daily || typeof s.daily !== 'object') s.daily = {}
    s.daily[today] = (s.daily[today] || 0) + 1
    s.daily = pruneDaily(s.daily)
  }

  // 同一个词今天已经算过就不写盘：省一次几百个键的序列化
  if (isNew || reset) writeState(s)
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

/** 每日目标（词/天）；0 或非法值表示不限 */
export function getDailyGoal(): number {
  const n = readState().dailyGoal
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 20
}

export function setDailyGoal(goal: number): void {
  const s = readState()
  s.dailyGoal = Math.max(Math.round(goal), 0)
  writeState(s)
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
  const labels = ['日', '一', '二', '三', '四', '五', '六']
  const out: DayCount[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = todayString(d)
    out.push({ date: key, label: labels[d.getDay()], count: daily[key] ?? 0, isToday: i === 0 })
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
  const daily = readState().daily || {}
  const d = new Date()
  if (!daily[todayString(d)]) d.setDate(d.getDate() - 1)

  let streak = 0
  // 上限 62 天（历史只留这么久），避免脏数据把循环拖死
  while (streak < 62 && daily[todayString(d)]) {
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
  /** 所有历史加起来的词数 */
  totalWords: number
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
 * 建计划前的预览：这本书这一档共多少词、已掌握多少。
 * 不依赖计划，所以「定计划」表单能实时告诉你「每天要背几个 / 哪天能背完」。
 */
export function bookScope(bookId: string, level: LevelKey = 'all'): { total: number; done: number } {
  const words = scopeWords(bookId, level)
  const mastered = getMastered()
  return { total: words.length, done: words.filter((w) => mastered[w.word]).length }
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
  const mastered = getMastered()

  const plan: StudyPlan = {
    bookId,
    level,
    deadline: perDay > 0 ? '' : deadline,
    perDay: perDay > 0 ? Math.round(perDay) : 0,
    startedAt: sameScope && prev ? prev.startedAt : todayString(),
    baseDone:
      sameScope && prev ? prev.baseDone : words.filter((w) => mastered[w.word]).length,
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

  const mastered = getMastered()
  const scopeTotal = plan.scopeTotal || words.length
  const doneNow = words.filter((w) => mastered[w.word]).length
  const done = Math.min(Math.max(doneNow, 0), scopeTotal)
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

/** 生词本里「每次复习几个」的默认值，和翻书页一页的词数一致 */
export const REVIEW_BATCH_DEFAULT = 10

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
    Taro.setStorageSync(PROGRESS_KEY, p)
    Taro.setStorageSync(MASTERED_KEY, m)
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
    Taro.setStorageSync(uploadBookKey(r.id), words)
    books.push({
      id: r.id,
      title: r.title || '云端词表',
      createdAt: r.createdAt || Date.now(),
      count: words.length
    })
    localIds.add(r.id)
    pulled++
  }

  if (pulled > 0) Taro.setStorageSync(UPLOAD_INDEX_KEY, books)

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
