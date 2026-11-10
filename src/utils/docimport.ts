import Taro from '@tarojs/taro'
import { pickFile } from './file-pick'
import { Word } from '../data/words'
import { MAX_UPLOAD_WORDS } from '../store/storage'
import { wordsFromCsv } from './csv'
import { addUploadBook, UploadBookMeta } from '../store/storage'

/**
 * 通用文件导入：把 Word（docx）、txt / csv / tsv / md、以及尽力而为的 PDF
 * 解析成「我的上传」里的一本词书。
 *
 * ## 各格式的处理方式
 *
 * | 格式 | 做法 | 可靠性 |
 * | --- | --- | --- |
 * | csv / tsv | 先按 CSV 严格解析（4 列），失败退回按行解析 | 高 |
 * | txt / md | 按行解析（智能分隔：逗号 / 制表符 / 两空格 / 音标 / 词性） | 高 |
 * | docx | JSZip 解包，读 word/document.xml，段落转行 | 高 |
 * | doc | 老二进制格式，纯 JS 无法解析 → 提示另存为 docx | — |
 * | pdf | 解压流 + 提取 Tj/TJ 文本算子（尽力而为） | 看文件 |
 *
 * PDF 的坑：扫描版是图片（没有文本流）；中文 PDF 的字体多是 CID 编码
 * （提出来是一堆乱码）。两种都检测出来，给用户明确的转格式指引，
 * 而不是让一堆乱码悄悄变成一本词书。
 */

/** 支持从聊天记录里选的扩展名 */
const PICK_EXTENSIONS = ['docx', 'txt', 'csv', 'tsv', 'md', 'pdf', 'doc']
/** 浏览器 input[type=file] 的 accept，和上面的扩展名一一对应 */
const PICK_ACCEPT = '.docx,.pdf,.txt,.csv,.tsv,.md,text/plain,text/csv,application/pdf'

const HEADER_WORDS = ['word', '单词', 'headword', 'english', '英文', '词汇']

export interface LineParseResult {
  words: Word[]
  skipped: number
}

/** 去掉行首的列表标记：1. / 1、 / ① / - / · */
function stripListMarker(line: string): string {
  return line
    .replace(/^\s*(?:\d+[.、)）]|[①②③④⑤⑥⑦⑧⑨⑩]|[-·•])\s*/, '')
    .trim()
}

const PHONETIC_RE = /^\/[^/]+\//
const POS_RE = /^[a-z]{1,12}\.$/i

/** 一行拆成 [word, phonetic?, pos?, definition?] */
function splitLine(line: string): string[] | null {
  const raw = stripListMarker(line)
  if (!raw) return null

  // 1) 逗号 / 分号 / 制表符：字段最分明（CSV 之外的 txt 常这么写）
  const delim = raw.includes('\t') ? '\t' : raw.includes('，') ? '，' : raw.includes(';') ? ';' : null
  if (delim) {
    const parts = raw.split(delim).map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) return parts
  }

  // 2) 英文 + 音标 + 词性 + 释义 的常见排版
  const m = raw.match(/^([A-Za-z][A-Za-z'\- ]*?)\s+(\/[^/]+\/)\s*(?:([a-z]{1,12}\.)\s*)?(.*)$/)
  if (m) {
    const parts = [m[1].trim(), m[2].trim()]
    if (m[3]) parts.push(m[3].trim())
    if (m[4] && m[4].trim()) parts.push(m[4].trim())
    return parts
  }

  // 3) 两个以上空格分隔（Word 里最常见：abandon  /əˈbændən/  v.  放弃）
  const bySpaces = raw.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean)
  if (bySpaces.length >= 2) return bySpaces

  // 4) 「英文 + 中文」挤在一行：在第一个 CJK 字符处切开
  const cjk = raw.search(/[\u4e00-\u9fff]/)
  if (cjk > 0) return [raw.slice(0, cjk).trim(), raw.slice(cjk).trim()]

  // 5) 只有一个词
  if (/^[A-Za-z][A-Za-z'\-]*$/.test(raw)) return [raw]
  return null
}

/** 字段数组 → Word（尽量猜对 phonetic / pos / definition 的位置） */
function partsToWord(parts: string[]): Word | null {
  const word = parts[0]
  if (!word || !/[A-Za-z]/.test(word)) return null

  let phonetic = ''
  let pos = ''
  const rest: string[] = []

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]
    if (!phonetic && PHONETIC_RE.test(p)) {
      phonetic = p
    } else if (!pos && POS_RE.test(p)) {
      pos = p
    } else {
      rest.push(p)
    }
  }

  return {
    word,
    phonetic,
    pos,
    definition: rest.join('；')
  }
}

/**
 * 自由文本 → 词条。先试严格的 CSV（能对上 4 列格式的优先），
 * 不行再退回按行智能拆分。
 */
export function linesToWords(text: string): LineParseResult {
  const cleaned = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')

  // 先按 CSV 试：若能解析出一批词就用它（用户传的可能是规整的 csv/tsv）
  const csv = wordsFromCsv(cleaned)
  if (csv.words.length > 0) {
    return { words: csv.words, skipped: csv.skipped }
  }

  const words: Word[] = []
  const seen = new Set<string>()
  let skipped = 0

  for (const line of cleaned.split('\n')) {
    if (!line.trim()) continue
    if (skipped + words.length === 0 && HEADER_WORDS.includes(line.trim().toLowerCase().split(/[,\t]/)[0])) continue

    const parts = splitLine(line)
    if (!parts || parts.length < 1) {
      skipped++
      continue
    }

    const w = partsToWord(parts)
    if (!w || !w.word) {
      skipped++
      continue
    }

    const key = w.word.toLowerCase()
    if (seen.has(key) || words.length >= MAX_UPLOAD_WORDS) {
      skipped++
      continue
    }

    seen.add(key)
    words.push(w)
  }

  return { words, skipped }
}

// ---------------- docx ----------------

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** docx 的 document.xml → 纯文本（段落 = 换行，单元格 = 空格） */
function docxXmlToText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab[^>]*\/>/g, '  ')
      .replace(/<\/w:tc>/g, '  ')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
}


// ---------------- pdf（尽力而为） ----------------

/** 拼出 PDF 里的十六进制 / 字面量字符串，处理转义 */
function decodePdfLiteral(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\') {
      const next = raw[i + 1]
      if (next === 'n') { out += '\n'; i++ }
      else if (next === 'r') { i++ }
      else if (next === 't') { out += ' '; i++ }
      else if (next && /[0-7]/.test(next)) {
        // 八进制转义，最多三位
        let oct = ''
        let j = i + 1
        while (j < raw.length && /[0-7]/.test(raw[j]) && oct.length < 3) { oct += raw[j]; j++ }
        out += String.fromCharCode(parseInt(oct, 8))
        i = j - 1
      } else { out += next || ''; i++ }
    } else {
      out += ch
    }
  }
  return out
}

/** 把 PDF 内容流里的文本算子抠成行（Tj / TJ / Td / TD / T*） */
function pdfStreamToText(stream: string): string {
  if (!/(BT|Tj|TJ)/.test(stream)) return ''

  const lines: string[] = []
  let cur = ''
  // 逐个扫文本事件：(...)Tj、[...]TJ、Td/TD/T*（换行）、ET（段落结束）
  const re = /\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\]\\]|\\.)*\]\s*TJ|(?:-?[\d.]+\s+){2}(?:Td|TD)|T\*|ET/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stream))) {
    const token = m[0]
    if (token.endsWith('Tj')) {
      const lit = token.match(/\(([\s\S]*)\)\s*Tj/)
      if (lit) cur += decodePdfLiteral(lit[1])
    } else if (token.endsWith('TJ')) {
      const arr = token.match(/\[([\s\S]*)\]\s*TJ/)
      if (arr) {
        const inner = arr[1]
        const litRe = /\((?:\\.|[^\\()])*\)/g
        let lm: RegExpExecArray | null
        while ((lm = litRe.exec(inner))) {
          cur += decodePdfLiteral(lm[0].slice(1, -1))
        }
      }
    } else {
      // 换行 / 段落结束：把手头的攒成一行
      if (cur.trim()) lines.push(cur.trim())
      cur = ''
    }
  }
  if (cur.trim()) lines.push(cur.trim())
  return lines.join('\n')
}

/** 内容流的解压：FlateDecode 全靠 pako；没压缩的原文也能直接用 */
function inflateStreams(bytes: Uint8Array): string[] {
  const latin = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  const out: string[] = []
  // 动态引入 pako：让打包器把它和 jszip 一起打进 vendor
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pako = require('pako')

  const re = /stream\r?\n?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(latin))) {
    const start = m.index + m[0].length
    const end = latin.indexOf('endstream', start)
    if (end < 0) break
    // 流之前的那段字典里写了有没有 Filter
    const dict = latin.slice(Math.max(0, m.index - 400), m.index)
    const chunk = bytes.subarray(start, end)

    if (/\/FlateDecode/.test(dict)) {
      try {
        out.push(pako.inflate(chunk, { to: 'string' }))
      } catch {
        // 有些流不是文本（图片 / 字体），解不开就跳过
      }
    } else if (!/\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode|\/Image/.test(dict)) {
      out.push(latin.slice(start, end))
    }
    re.lastIndex = end
  }
  return out
}

/** 提取结果的质量检查：太乱就当失败 */
function pdfExtractQuality(text: string): boolean {
  if (!text) return false
  const letters = (text.match(/[A-Za-z]/g) || []).length
  if (letters < 30) return false
  // 私有区 / 控制字符占比高 = CID 字体提出来的乱码
  const garbage = (text.match(/[\uE000-\uF8FF\u0000-\u0008\u000E-\u001F]/g) || []).length
  return garbage / text.length < 0.05
}

// ---------------- 入口 ----------------

function showFormatModal(title: string, content: string): void {
  Taro.showModal({ title, content, showCancel: false, confirmText: '知道了' })
}

/**
 * 从微信聊天记录选一个文件并导入。取消返回 null。
 * 这是「各种文件 → 词书」的唯一入口，格式路由都在这里面。
 */
export async function importAnyFile(): Promise<ImportResult2 | null> {
  // 微信走聊天记录选文件，H5 / iOS 壳走系统文件选择器（见 utils/file-pick.ts）
  const picked = await pickFile(PICK_ACCEPT, PICK_EXTENSIONS)
  if (!picked) return null

  const ext = (picked.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase()

  Taro.showLoading({ title: '正在解析' })
  try {
    let text = ''

    if (ext === 'docx') {
      const mod = require('jszip') as { default: new (b: ArrayBuffer) => { file: (n: string) => { async: (t: string) => Promise<string> } } }
      const JSZip = mod.default || (mod as unknown as new (b: ArrayBuffer) => { file: (n: string) => { async: (t: string) => Promise<string> } })
      const buf = await picked.readArrayBuffer()
      const zip = new JSZip(buf)
      const entry = zip.file('word/document.xml')
      if (!entry) throw new Error('这个 docx 里读不到正文')
      const xml = await entry.async('string')
      if (!xml) throw new Error('这个 docx 里读不到正文')
      text = docxXmlToText(xml)
    } else if (ext === 'doc') {
      Taro.hideLoading()
      showFormatModal(
        '不支持 .doc 老格式',
        '.doc 是二进制老格式。请在 Word / WPS 里「另存为 .docx」，或另存为 .txt 再上传。'
      )
      return null
    } else if (ext === 'pdf') {
      const bytes = new Uint8Array(await picked.readArrayBuffer())
      const streams = inflateStreams(bytes)
      text = streams.map(pdfStreamToText).filter(Boolean).join('\n')
      if (!pdfExtractQuality(text)) {
        Taro.hideLoading()
        showFormatModal(
          '这个 PDF 提不出文字',
          '扫描版 PDF（整页是图片）和中文字体的 PDF 常常提不出可用文本。请先转成 .docx 或 .txt 再上传；英文原版 PDF 通常可以。',
          )
        return null
      }
    } else {
      // txt / csv / tsv / md：读文本
      text = await picked.readText()
      if (text.includes('�')) {
        Taro.hideLoading()
        showFormatModal(
          '文件编码不对',
          '这个文件不是 UTF-8（多半是 Excel 在中文 Windows 上存的 GBK）。请另存为 UTF-8 后再上传。'
        )
        return null
      }
    }

    // CSV / TSV 优先走严格解析，其他文本走智能按行解析
    const looksTabular = ext === 'csv' || ext === 'tsv' || /^[^\n]*,[^\n]*,[^\n]*,/.test(text.split('\n')[0] || '')
    const parsed: LineParseResult = looksTabular
      ? (() => {
          const r = wordsFromCsv(text)
          return r.words.length > 0 ? { words: r.words, skipped: r.skipped } : linesToWords(text)
        })()
      : linesToWords(text)

    if (!parsed.words.length) {
      Taro.hideLoading()
      showFormatModal(
        '没有读到单词',
        `${picked.name} 里没解析出词条。每行一个词，支持「word,音标,词性,释义」「word  释义」等常见写法。`
      )
      return null
    }

    Taro.hideLoading()
    return commitBook(bookTitleFromFileName(picked.name), parsed.words)
  } catch (e) {
    Taro.hideLoading()
    Taro.showToast({ title: (e as Error).message || '解析失败', icon: 'none', duration: 2000 })
    return null
  }
}

export interface ImportResult2 {
  book: UploadBookMeta
}

function bookTitleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim()
  if (base) return base
  const d = new Date()
  return `上传词表 ${d.getMonth() + 1}-${d.getDate()}`
}

/** 存一本词书 + 成功/失败提示（复用 csv.ts 的口径） */
function commitBook(title: string, words: Word[]): ImportResult2 | null {
  // addUploadBook 从 csv.ts 转口，避免重复实现上限判断
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
  Taro.showToast({ title: '导入成功', icon: 'none', duration: 1500 })
  return { book }
}
