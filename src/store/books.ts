import { ALL_WORDS, BUILTIN_BOOK, BUILTIN_BOOK_ID, UPLOAD_GROUP_TITLE, Word } from '../data/words'
import { countUnmastered, getMastered, getUploadBooks, getUploadBookWords } from './storage'

/**
 * 词书的读取入口：内置那本读词表文件，上传的按 id 读本地缓存。
 * 单独一层是因为 data/words.ts 和 store/storage.ts 互相引用，放哪边都成环。
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
