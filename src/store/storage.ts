import Taro from '@tarojs/taro'
import { ALL_WORDS, Word } from '../data/words'

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

/** 标记圆圈的满级次数 */
const MAX_MARK = 7

/**
 * 圆圈填充色，按 mark_count 从浅到深。
 * 共 6 档，mark_count 6 和 7 都用最深的红色。
 */
const MARK_COLORS = ['#E5E5EA', '#007AFF', '#FFCC00', '#FF9500', '#FF3B30', '#D70015']

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

/** mark_count +1，返回本次是否真的加上了（已满则不动，返回 false）。 */
export function incrementMark(word: string): boolean {
  const p = getProgress()
  const cur = p[word] ?? 0
  if (cur >= MAX_MARK) return false
  p[word] = cur + 1
  Taro.setStorageSync(PROGRESS_KEY, p)
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
}

export interface VocabWord extends Word {
  markCount: number
}

/** 生词本：所有 markCount > 0 的词，按 markCount 降序、word 字母序升序。 */
export function getVocabWords(): VocabWord[] {
  const p = getProgress()
  const marked = Object.keys(p).filter((w) => p[w] > 0)
  if (!marked.length) return []

  const index = wordIndex()
  return marked
    .map((w) => {
      const base = index.get(w) ?? { word: w, phonetic: '', pos: '', definition: '' }
      return { ...base, markCount: p[w] }
    })
    .sort((a, b) => b.markCount - a.markCount || a.word.localeCompare(b.word))
}

/** 移除生词（markCount 归零）。 */
export function removeVocabWord(word: string): void {
  const p = getProgress()
  delete p[word]
  Taro.setStorageSync(PROGRESS_KEY, p)
}

// ---------- mastered:「我会了」点过的词，不再出现在翻书里 ----------

/** word -> 掌握时间戳 */
export function getMastered(): Record<string, number> {
  return readJson<Record<string, number>>(MASTERED_KEY, {})
}

export function masterWord(word: string): void {
  const m = getMastered()
  m[word] = Date.now()
  Taro.setStorageSync(MASTERED_KEY, m)
}

/** 点错了撤回：这个词重新回到翻书列表。 */
export function unmasterWord(word: string): void {
  const m = getMastered()
  delete m[word]
  Taro.setStorageSync(MASTERED_KEY, m)
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
  return meta
}

export function removeUploadBook(id: string): void {
  Taro.setStorageSync(UPLOAD_INDEX_KEY, getUploadBooks().filter((b) => b.id !== id))
  Taro.removeStorageSync(uploadBookKey(id))
}

/** 「我的上传」里所有书的词数合计 */
export function countUploadWords(): number {
  return getUploadBooks().reduce((n, b) => n + b.count, 0)
}

// ---------- 单词索引：word -> Word，把进度里的单词还原成完整词条 ----------

/** 内置词表 + 全部上传词书的合并索引。每次调用重建（几千条，够快）。 */
function wordIndex(): Map<string, Word> {
  const index = new Map<string, Word>()
  for (const meta of getUploadBooks()) {
    for (const w of getUploadBookWords(meta.id)) index.set(w.word, w)
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
  /** 最后一次打开的翻书页，给底部 Tab 栏的「翻书」跳回去用 */
  lastReader: { bookId: string; level: string } | null
}

const DEFAULT_STATE: AppState = {
  pages: {},
  todayDate: '',
  todayPageCount: 0,
  todayMarkCount: 0,
  lastReader: null
}

function readState(): AppState {
  return { ...DEFAULT_STATE, ...readJson<Partial<AppState>>(STATE_KEY, {}) }
}

function writeState(s: AppState): void {
  Taro.setStorageSync(STATE_KEY, s)
}

/** 本地日期，格式 YYYY-MM-DD */
function todayString(): string {
  const d = new Date()
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
}

/** 进翻书页时记一笔，Tab 栏的「翻书」从生词本切回来时要用 */
export function setLastReader(bookId: string, level: string): void {
  const s = readState()
  s.lastReader = { bookId, level }
  writeState(s)
}

export function getLastReader(): { bookId: string; level: string } | null {
  return readState().lastReader ?? null
}

/** 读今日计数：日期不是今天就清零，否则返回已存计数。 */
export function loadTodayCounts(): { pageCount: number; markCount: number } {
  const s = readState()
  const today = todayString()
  if (s.todayDate !== today) {
    s.todayDate = today
    s.todayPageCount = 0
    s.todayMarkCount = 0
    writeState(s)
    return { pageCount: 0, markCount: 0 }
  }
  return { pageCount: s.todayPageCount, markCount: s.todayMarkCount }
}

/** 成功翻一页后 +1 */
export function incrementTodayPageCount(): void {
  const s = readState()
  s.todayPageCount += 1
  writeState(s)
}

/** 成功标记一次后 +1 */
export function incrementTodayMarkCount(): void {
  const s = readState()
  s.todayMarkCount += 1
  writeState(s)
}
