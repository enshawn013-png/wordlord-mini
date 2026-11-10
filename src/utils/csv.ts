import Taro from '@tarojs/taro'
import { Word } from '../data/words'
import { addUploadBook, MAX_UPLOAD_WORDS, UploadBookMeta } from '../store/storage'

/**
 * CSV 词表导入。
 *
 * 规定列序：word,phonetic,pos,definition（有表头行会自动跳过）
 *   word,phonetic,pos,definition
 *   abandon,/əˈbændən/,v.,放弃；抛弃
 *
 * 每上传一次 = 「我的上传」里新增一本词书，书名取文件名。
 */

/** 规定的列数：word,phonetic,pos,definition */
const REQUIRED_COLUMNS = 4

/** RFC4180 风格解析：支持字段内逗号、换行、"" 转义。 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }

  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

const HEADER_WORDS = ['word', '单词', 'headword', 'english', '英文']

export interface ParseResult {
  words: Word[]
  /** 因重复 / 空单词 / 列数不足被跳过的行数 */
  skipped: number
  /** 因列数不足被跳过的行数，用于给用户精确的提示 */
  tooFewColumns: number
}

/**
 * 把 CSV 文本转成词条。
 * 列序固定为 word,phonetic,pos,definition；列数不足 4 的行跳过，
 * 不做「猜列」的兼容——猜错会把词性当释义，错得看不出来。
 */
export function wordsFromCsv(text: string): ParseResult {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  const words: Word[] = []
  const seen = new Set<string>()
  let skipped = 0
  let tooFewColumns = 0

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.trim())

    if (!cells.some((c) => c !== '')) continue // 空行
    if (i === 0 && HEADER_WORDS.includes(cells[0].toLowerCase())) continue // 表头

    if (cells.length < REQUIRED_COLUMNS) {
      tooFewColumns++
      skipped++
      continue
    }

    const word = cells[0]
    if (!word) {
      skipped++
      continue
    }

    const key = word.toLowerCase()
    if (seen.has(key)) {
      skipped++
      continue
    }
    if (words.length >= MAX_UPLOAD_WORDS) {
      skipped++
      continue
    }

    seen.add(key)
    words.push({
      word,
      phonetic: cells[1],
      pos: cells[2],
      // 第 4 列之后如果有内容，一起并进释义，避免用户多写一列就丢数据
      definition: cells.slice(3).filter(Boolean).join('；')
    })
  }

  return { words, skipped, tooFewColumns }
}

/** 让用户从微信聊天记录里选一个 CSV 文件。取消选择返回 null。 */
async function pickCsvFile(): Promise<{ path: string; name: string } | null> {
  const res = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['csv'] })
  const file = res.tempFiles?.[0]
  if (!file) return null
  return { path: file.path, name: file.name || '' }
}

function readFileText(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: 'utf8',
      success: (r) => resolve(String(r.data)),
      fail: (e) => reject(new Error(e.errMsg || '读取文件失败'))
    })
  })
}

/** 用文件名当词书名，去掉扩展名；文件名空就退回按日期命名。 */
function bookTitleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim()
  if (base) return base
  const d = new Date()
  return `上传词表 ${d.getMonth() + 1}-${d.getDate()}`
}

export interface ImportResult {
  book: UploadBookMeta
}

/** 词表里读不出词时的统一提示。 */
function showNoWordsModal(tooFewColumns: number): void {
  Taro.showModal({
    title: '没有读到单词',
    content: tooFewColumns
      ? `有 ${tooFewColumns} 行不足 4 列。格式必须是：word,phonetic,pos,definition`
      : '格式必须是：word,phonetic,pos,definition，且第一列是英文单词。',
    showCancel: false,
    confirmText: '知道了'
  })
}

/** 存一本词书 + 成功/失败提示。存不下（超过 20 本）返回 null。 */
function commitBook(title: string, words: Word[]): ImportResult | null {
  const book = addUploadBook(title, words)
  if (!book) {
    Taro.showModal({
      title: '上传的书太多了',
      content: '「我的上传」最多放 20 本词书，先删掉几本再传。',
      showCancel: false,
      confirmText: '知道了'
    })
    return null
  }

  // 短提示：Toast 超过 7 个汉字就会被挤成两行。
  // 「存了哪些词」不需要说 —— 新的那本词书马上就出现在下面的列表里，那才是回执。
  Taro.showToast({ title: '导入成功', icon: 'none', duration: 1500 })
  return { book }
}

/**
 * 完整的上传流程：选文件 → 读文本 → 解析 → 存成「我的上传」里的一本词书。
 * 用户取消或出错时返回 null（错误已弹窗提示）。
 */
export async function importCsvFromChat(): Promise<ImportResult | null> {
  let picked: { path: string; name: string } | null = null
  try {
    picked = await pickCsvFile()
  } catch {
    // 用户取消时开发者工具也会走 fail，不弹错误
    return null
  }
  if (!picked) return null

  Taro.showLoading({ title: '正在导入' })
  try {
    const text = await readFileText(picked.path)

    // Excel 在中文 Windows 上默认存成 GBK，读成 utf8 会出现大量替换字符
    if (text.includes('�')) {
      Taro.hideLoading()
      Taro.showModal({
        title: '文件编码不对',
        content:
          '这个 CSV 不是 UTF-8 编码（多半是 Excel 存的 GBK）。请用 Excel「另存为 → CSV UTF-8」或记事本另存为 UTF-8 后再上传。',
        showCancel: false,
        confirmText: '知道了'
      })
      return null
    }

    const { words, tooFewColumns } = wordsFromCsv(text)

    if (!words.length) {
      Taro.hideLoading()
      showNoWordsModal(tooFewColumns)
      return null
    }

    Taro.hideLoading()
    return commitBook(bookTitleFromFileName(picked.name), words)
  } catch (e) {
    Taro.hideLoading()
    Taro.showToast({ title: (e as Error).message || '导入失败', icon: 'none', duration: 2000 })
    return null
  }
}

/** 手动粘贴的一本词书叫什么：按日期命名，避免同一天多本重名。 */
function pastedBookTitle(): string {
  const d = new Date()
  return `手动粘贴 ${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * 手动粘贴词表：把文本框里的原文解析成词条，存成「我的上传」里的一本词书。
 * 格式和 CSV 完全一样（一词一行，逗号分隔 word,phonetic,pos,definition），
 * 所以直接复用 wordsFromCsv。没读到词 / 存不下时返回 null（已弹窗提示）。
 */
export function importPastedText(text: string): ImportResult | null {
  const { words, tooFewColumns } = wordsFromCsv(text)

  if (!words.length) {
    showNoWordsModal(tooFewColumns)
    return null
  }

  return commitBook(pastedBookTitle(), words)
}
