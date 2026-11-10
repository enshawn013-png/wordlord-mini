import { ALL_WORDS, BUILTIN_BOOK, BUILTIN_BOOK_ID, UPLOAD_GROUP_TITLE, Word } from '../data/words'
import {
  countUnmastered,
  getMainBookId,
  getMastered,
  getUploadBooks,
  getUploadBookWords,
  UploadBookMeta
} from './storage'

/**
 * 词书的读取入口：内置那本读词表文件，上传的按 id 读本地缓存。
 * 单独一层是因为 data/words.ts 和 store/storage.ts 互相引用，放哪边都成环。
 *
 * 2026-11（R10）多了一层「主词书 / 归档词书」的概念，也在这一层收口：
 * 页面不许再自己拼「内置 + 上传」的列表，也不许自己决定用哪本书做统计 ——
 * 全部走这里的 `mainBookId()` / `mainBookWords()` / `allBooks()` / `archivedBooks()`。
 */

/** 一本词书的全部词条 */
export function bookWords(bookId: string): Word[] {
  return bookId === BUILTIN_BOOK_ID ? ALL_WORDS : getUploadBookWords(bookId)
}

/** 一本词书的名字 */
export function bookTitle(bookId: string): string {
  if (bookId === BUILTIN_BOOK_ID) return BUILTIN_BOOK.title
  return getUploadBooks().find((b) => b.id === bookId)?.title ?? UPLOAD_GROUP_TITLE
}

/** 一本词书（或它的某个档次）的规模：共多少词、还有多少没掌握 */
export function summarize(words: Word[], mastered?: Record<string, number>): { total: number; remain: number } {
  return { total: words.length, remain: countUnmastered(words, mastered ?? getMastered()) }
}

/** 「我的上传」里所有书合起来有多少词 */
export function uploadSummary(): { count: number; total: number; remain: number } {
  const mastered = getMastered()
  let total = 0
  let remain = 0
  for (const b of getUploadBooks()) {
    const ws = getUploadBookWords(b.id)
    total += ws.length
    remain += countUnmastered(ws, mastered)
  }
  return { count: getUploadBooks().length, total, remain }
}

// ---------- 主词书 / 归档词书（R10）----------

/** 全部词书的一条目录项（内置 + 上传），带上「是不是主词书」 */
export interface BookRef {
  id: string
  title: string
  /** 内置的「大学六级」不能删，界面上不显示删除 */
  builtin: boolean
  /** 当前主词书？统计只认它 */
  main: boolean
  count: number
}

/** 当前主词书 id（默认内置「大学六级」；指定的上传词书被删了会自动退回内置） */
export function mainBookId(): string {
  return getMainBookId()
}

/** 当前主词书的词表。**所有统计的分母都从这里来**，别再直接引 ALL_WORDS。 */
export function mainBookWords(): Word[] {
  return bookWords(mainBookId())
}

/** 当前主词书的名字（页面标题 / 标签里要说清「按哪一本算」） */
export function mainBookTitle(): string {
  return bookTitle(mainBookId())
}

/** 是否主词书 */
export function isMainBook(bookId: string): boolean {
  return bookId === getMainBookId()
}

/**
 * 全部词书，**主词书永远排第一**。
 * 排序是刻意的：ActionSheet 只支持 6 项，主词书排前面能保证最常用的那本一定在。
 */
export function allBooks(): BookRef[] {
  const main = getMainBookId()
  const builtin: BookRef = {
    id: BUILTIN_BOOK_ID,
    title: BUILTIN_BOOK.title,
    builtin: true,
    main: main === BUILTIN_BOOK_ID,
    count: ALL_WORDS.length
  }
  const uploads: BookRef[] = getUploadBooks().map((b: UploadBookMeta) => ({
    id: b.id,
    title: b.title,
    builtin: false,
    main: main === b.id,
    count: b.count
  }))
  return [builtin, ...uploads].sort((a, b) => Number(b.main) - Number(a.main))
}

/**
 * 归档词书 = 除了主词书以外的全部词书。
 * 它们的词频标签**不参与任何统计**（用户 R10 的原话），页面只说「共多少词 / 还剩多少词」。
 */
export function archivedBooks(): BookRef[] {
  return allBooks().filter((b) => !b.main)
}
