import rawWords from './cet6.json'
import frequency from './frequency.json'

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
