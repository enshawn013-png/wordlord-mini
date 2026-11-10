import rawWords from './cet6.json'
import frequency from './frequency.json'
import rawExamples from './examples.json'

/**
 * 六级大纲新增词（1824 词），按词频从高到低排列。
 *
 * 「新增词」= 六级大纲里剔掉 cet4 / 高考 / 中考 标签的词，也就是过了四级之后
 * 新要背的那些；基础词不再收进来，避免翻半天都是 what / can / way。
 * 由 scripts/build-wordlist.mjs 生成，来源 ECDICT + KyleBing/english-vocabulary。
 */
export interface Word {
  word: string
  phonetic: string
  pos: string
  definition: string
}

/** 翻书每页几个词 */
export const PAGE_SIZE = 10

export const ALL_WORDS: Word[] = rawWords as Word[]

// ---------- 词频分档 ----------
//
// frequency.json 里是「全英文」按 COCA 词频切好的两段词表：高频 4396 词、
// 中频 3541 词，其余算低频。两条线是 4577 / 8016（COCA 排名），由对六级词表的
// log10(排名) 做 k-means(k=3) 得到——构建期算的，见 scripts/build-wordlist.mjs 文件头，
// 所以改词表时它会跟着重新分，不是写死的常数。
// 内置词表和用户上传的词表走的是同一把尺子。

const HIGH_WORDS = new Set(frequency.high.split(' '))
const MID_WORDS = new Set(frequency.mid.split(' '))

export type Band = 'high' | 'mid' | 'low'

/** 判断一个词的词频档位；不在词频表里的按低频算。 */
export function bandOf(word: string): Band {
  const w = word.toLowerCase()
  if (HIGH_WORDS.has(w)) return 'high'
  if (MID_WORDS.has(w)) return 'mid'
  return 'low'
}

export type LevelKey = 'high' | 'mid' | 'low' | 'all'

export interface Level {
  key: LevelKey
  label: string
}

export const LEVELS: Level[] = [
  { key: 'high', label: '高频词' },
  { key: 'mid', label: '中频词' },
  { key: 'low', label: '低频词' },
  { key: 'all', label: '完整词表' }
]

export function levelLabel(key: LevelKey): string {
  return LEVELS.find((l) => l.key === key)?.label ?? ''
}

/** 从一本词书里取出某个档次的词。'all' 就是整本。 */
export function wordsOfLevel(words: Word[], level: LevelKey): Word[] {
  if (level === 'all') return words
  return words.filter((w) => bandOf(w.word) === level)
}

// ---------- 例句（R9）----------
//
// 每条词一条例句，显示在词卡释义下方。**来源必须能看出来**：
//   `source: 'exam'` = 六级真题原句（`from` 是出处，页面标「六级真题 · 出处」）
//   `source: 'ai'`   = AI 生成（页面标「AI 生成例句，仅供参考」）
// 这不是可选项：用户 2026-11 的硬要求是「若用 AI 生成，必须标注」，漏了标注等于骗人。
//
// 数据在 `src/data/examples.json`，由 scripts/build-examples.mjs 从分片合并而来
// （词表是另一条生产线，两者各自重跑互不干扰）；运行时只有 `exampleOf()` 一个入口。

export interface Example {
  en: string
  zh: string
  source: 'exam' | 'ai'
  /** 真题出处（'2019.06 阅读'）；AI 生成的是空串 */
  from: string
}

/**
 * word -> [en, zh, from?]；第三项在 = 真题，缺 = AI 生成。
 *
 * ⚠️ 这一层 `words` 不能省：词表里有个词就叫 `default`，如果把它摊在 JSON 顶层，
 * CommonJS 产物里的 `require('./examples.json').default` 拿到的会是**那个词的例句**，
 * 而不是整张表（`import x from ...` 会被编成 `.default`）—— 症状是所有词都查不到例句。
 * 见 scripts/build-examples.mjs 的 merge() 和 p0-check 的 R9 断言。
 */
const EXAMPLES = (rawExamples as unknown as { words?: Record<string, string[]> }).words ?? {}

/**
 * 取一个词的例句。没有就返回 null —— 页面**不占位也不编**，
 * 少一行例句比编一句假例句好（上传的词表本来就只保证四个字段）。
 */
export function exampleOf(word: string): Example | null {
  const row = EXAMPLES[String(word || '').toLowerCase()]
  if (!Array.isArray(row) || !row[0]) return null
  return { en: row[0], zh: row[1] || '', source: row[2] ? 'exam' : 'ai', from: row[2] || '' }
}

/** 例句来源标注文案。AI 生成的一律带「仅供参考」，这是 R9 的硬要求。 */
export function exampleSourceLabel(e: Example): string {
  return e.source === 'exam' ? `六级真题${e.from ? ` · ${e.from}` : ''}` : 'AI 生成例句，仅供参考'
}

// ---------- 词书 ----------

/** 内置词书的 id */
export const BUILTIN_BOOK_ID = 'builtin'

export const BUILTIN_BOOK = {
  id: BUILTIN_BOOK_ID,
  title: '大学六级',
  subtitle: '官方词书'
}

/** 首页「我的上传」那一项 */
export const UPLOAD_GROUP_ID = 'upload'
export const UPLOAD_GROUP_TITLE = '我的上传'
