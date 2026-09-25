/**
 * 生成两个文件：
 *   src/data/cet6.json       内置词书的词表（六级大纲新增词，按词频从高到低）
 *   src/data/frequency.json  运行时词频分档表（给内置词表和上传的词表分档用）
 *
 * ── 数据来源（GitHub 开源） ───────────────────────────────────────────
 *   1. skywind3000/ECDICT            ecdict.csv          （MIT）
 *      tag 含 "cet6" 的词条 = 六级大纲词表，提供音标 / 中文释义 / 词性；
 *      frq = COCA 词频排名，bnc = BNC 词频排名（都是越小越常用）。
 *   2. KyleBing/english-vocabulary   json/4-CET6-顺序.json
 *      补充 ECDICT 漏标 cet6 的六级词。
 *
 * ── 只收「六级大纲新增词」，不要基础词 ───────────────────────────────
 *   六级大纲（约 5500 词）是包含四级 / 高考 / 中考词汇的，直接拿来当词书，
 *   背到的全是 what / can / way 这种早就会的词，没有收获。所以这里在大纲
 *   5500 词的基础上再剔掉两类：
 *
 *     a. tag 带 cet4 / gk(高考) / zk(中考) 的 —— 四级及以前就该会的
 *     b. ECDICT 里首字母大写的 —— Jesus / Mars 这种专有名词，不是词汇
 *
 *   剩下的就是「六级大纲新增词」，也就是市面上「六级核心词汇」那一套口径，
 *   约 1800 词。词表按词频从高到低排列。
 *
 * ── 词频分档阈值怎么来的 ─────────────────────────────────────────────
 *   没有采用拍脑袋的固定比例，而是**在本脚本里现算**：对词表的 COCA 排名
 *   做 1D k-means(k=3) 聚类（在 log10(排名) 上做，词频是重尾分布，必须先
 *   取对数），阈值取相邻簇心的中点。
 *
 *   为了让每次构建结果一致，初始化用固定种子的 mulberry32 + k-means++，
 *   25 次重启取组内平方和最小的那组——同一个输入永远得到同一组阈值。
 *
 *   改词表（比如以后换词源）阈值会跟着重算，不需要手工改常数。
 *
 * 用法：
 *   mkdir -p .worddata
 *   curl -L -o .worddata/ecdict.csv \
 *     https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
 *   curl -L -o .worddata/cet6-kylebing.json \
 *     https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/4-CET6-%E9%A1%BA%E5%BA%8F.json
 *   node scripts/build-wordlist.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseCsvFile } from './csv-parse.mjs'

const ECDICT = '.worddata/ecdict.csv'
const KYLE = '.worddata/cet6-kylebing.json'
const OUT_WORDS = 'src/data/cet6.json'
const OUT_FREQ = 'src/data/frequency.json'

/** 六级大纲的规模（先按词频截到这个数，再剔基础词） */
const MAX_WORDS = 5500

/** 带了这些标签的词 = 四级及以前就该会的「基础词」，不进内置词书 */
const BASE_TAGS = ['cet4', 'gk', 'zk']

/** k-means 的聚类数：高频 / 中频 / 低频 三档 */
const K = 3

// ---------- 1D k-means（定种子，保证可复现） ----------

/** 固定种子的伪随机数，避免 Math.random 让每次构建的阈值抖动 */
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** k-means++ 初始化：第一个簇心随机，后续按距离平方加权抽 */
function seedCenters(data, k, rand) {
  const centers = [data[Math.floor(rand() * data.length)]]
  while (centers.length < k) {
    const d2 = data.map((x) => Math.min(...centers.map((y) => (x - y) ** 2)))
    const total = d2.reduce((a, b) => a + b, 0)
    let r = rand() * total
    let i = 0
    while (i < data.length - 1 && (r -= d2[i]) > 0) i++
    centers.push(data[i])
  }
  return centers
}

/**
 * 在 log10(词频排名) 上跑 1D k-means(k=3)，返回升序簇心。
 * 25 次重启取 SSE 最小的一组，结果只跟输入有关（种子固定）。
 */
function kmeans1d(data, k) {
  let best = null
  for (let round = 0; round < 25; round++) {
    const rand = mulberry32(0x9e3779b9 + round)
    const centers = seedCenters(data, k, rand)
    let assign = new Array(data.length).fill(-1)

    for (let iter = 0; iter < 200; iter++) {
      const next = data.map((x) => {
        let bi = 0
        let bd = Infinity
        centers.forEach((y, i) => {
          const d = (x - y) ** 2
          if (d < bd) { bd = d; bi = i }
        })
        return bi
      })
      const settled = next.every((v, i) => v === assign[i])
      assign = next
      for (let i = 0; i < k; i++) {
        const group = data.filter((_, j) => assign[j] === i)
        if (group.length) centers[i] = group.reduce((a, b) => a + b, 0) / group.length
      }
      if (settled) break
    }

    const sse = data.reduce((s, x, i) => s + (x - centers[assign[i]]) ** 2, 0)
    if (!best || sse < best.sse) best = { centers: [...centers].sort((a, b) => a - b), sse }
  }
  return best
}

/** 释义长度上限（字符），超过就截断，保证条目排版不会过高 */
const MAX_DEF = 46

// ---------- 音标规范化 ----------

/**
 * 把 ECDICT 的 ASCII 音标整理成常规 IPA 写法：
 *   ә(U+04D9) / є(U+0454) 是西里尔字母，换成 ə / e
 *   ' -> ˈ (主重音)     . 和 , -> ˌ (次重音)     : -> ː (长音)
 *   ". " / ", " 后面跟空格时是「另一种读法」的分隔，只保留第一种
 */
function fixPhonetic(raw) {
  let p = (raw || '').trim()
  if (!p) return ''
  p = p
    .replace(/ә/g, 'ə')
    .replace(/є/g, 'e')
    .replace(/^\/+|\/+$/g, '')
    .trim()

  p = p.split(/[.,]\s+/)[0] // sjuːt. suːt -> sjuːt
  p = p.replace(/\s*-\s*$/, '').replace(/[.,]+$/, '').trim()

  p = p
    .replace(/:/g, 'ː')
    .replace(/'/g, 'ˈ')
    .replace(/[.,]/g, 'ˌ')
    .replace(/ˌ{2,}/g, 'ˌ')
    .trim()

  return p ? `/${p}/` : ''
}

// ---------- 释义 / 词性解析 ----------

/**
 * 行首词性标记。[网络]/[医] 这类标签行不在此列，由调用方跳过。
 * 注意顺序：长的写在前面（interj 先于 int，num 先于 n，abbr/art/aux/adj/adv 先于 a），
 * 否则 "abbr." 会被当成 "a." 吃掉。ECDICT 用 a. 表示形容词。
 */
const POS_RE = /^(interj|excl|abbr|adj|adv|art|aux|conj|modal|num|prep|pron|vt|vi|v|n|a)\s*\.\s*/i

/** ECDICT 的词性写法归一：a. -> adj.，vt./vi./modal -> v.，excl -> interj. */
function normalizePos(raw) {
  const p = raw.toLowerCase()
  if (p === 'a') return 'adj'
  if (p === 'vt' || p === 'vi' || p === 'modal') return 'v'
  if (p === 'excl') return 'interj'
  return p
}

function truncate(s) {
  const t = s.replace(/[；;、\s]+$/, '')
  return t.length > MAX_DEF ? `${t.slice(0, MAX_DEF)}…` : t
}

function parseTranslation(translation) {
  if (!translation) return { pos: '', definition: '' }

  // ECDICT 用字面量 "\n" 分隔义项，也见过真实换行，两种都切
  const lines = translation
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const posList = []
  const senses = []

  for (const line of lines) {
    if (/^[[【]/.test(line)) continue // [网络] 胡德；兜帽 这类非考纲义项
    const m = line.match(POS_RE)
    const pos = m ? normalizePos(m[1]) : ''
    const body = (m ? line.slice(m[0].length) : line).replace(/^[;；\s]+/, '').trim()
    if (!body) continue
    if (pos && !posList.includes(pos)) posList.push(pos)
    senses.push(body)
    if (senses.length >= 2) break // 最多取 2 个义项，条目要短
  }

  if (!senses.length) {
    const flat = lines.filter((l) => !/^[[【]/.test(l)).join('；').trim()
    if (!flat) return { pos: '', definition: '' }
    return { pos: '', definition: truncate(flat.replace(/,\s*/g, '；')) }
  }

  const definition = truncate(senses.join('；').replace(/,\s*/g, '；').replace(/[；;]+/g, '；'))
  return { pos: posList.map((p) => `${p}.`).join(' / '), definition }
}

// ---------- 主流程 ----------

/** 只收「单词」形态：字母开头，允许连字符和撇号，最多一个空格（短语如 in that） */
const WORD_RE = /^[a-z][a-z'’-]*(?: [a-z'’-]+)?$/
/** 词频表只收单个英文词，上传的词基本不会是短语 */
const TOKEN_RE = /^[a-z][a-z'’-]*$/

/** 统一口径的词频排名：优先 COCA(frq)，缺失退回 BNC(bnc)，都没有记 0（视为未收录） */
function rankOf(e) {
  return e.frq > 0 ? e.frq : e.bnc > 0 ? e.bnc : 0
}

async function main() {
  /** @type {Map<string, {spelling:string, phonetic:string, translation:string, frq:number, bnc:number, tag:string}>} */
  const dict = new Map()

  for await (const r of parseCsvFile(ECDICT)) {
    const [word, phonetic, , translation, , , , tag, bnc, frq] = r
    if (!word || word.toLowerCase() === 'word') continue // 表头

    const entry = { spelling: word, phonetic: phonetic || '', translation: translation || '', frq: Number(frq) || 0, bnc: Number(bnc) || 0, tag: tag || '' }
    const prev = dict.get(word.toLowerCase())
    // 同一个词多条记录时，留信息最全的那条（有音标 + 有中文释义）
    if (!prev || entryScore(entry) > entryScore(prev)) dict.set(word.toLowerCase(), entry)
  }

  // 1) ECDICT 里打了 cet6 标签的词 —— 主干
  const picked = new Map()
  for (const [word, e] of dict) {
    if (hasTag(e, 'cet6')) picked.set(word, { ...e, source: 'ecdict' })
  }
  const fromEcdict = picked.size

  // 2) KyleBing 六级词表里 ECDICT 漏标的词 —— 补漏
  let kyle = []
  try {
    kyle = JSON.parse(readFileSync(KYLE, 'utf8'))
  } catch {
    kyle = []
  }
  let added = 0
  for (const item of kyle) {
    const key = String(item.word || '').toLowerCase().trim()
    if (!key || picked.has(key)) continue
    const e = dict.get(key)
    if (!e) continue // 词典里查不到就不硬塞，避免出现没释义的空条目
    picked.set(key, { ...e, source: 'kylebing' })
    added++
  }

  // 3) 组装 + 过滤（先做出六级大纲词表，约 5500 词）
  const rows = []
  const dropped = { shape: 0, emptyDef: 0, emptyPhonetic: 0 }

  for (const [word, e] of picked) {
    if (!WORD_RE.test(word)) {
      dropped.shape++
      continue
    }
    const { pos, definition } = parseTranslation(e.translation)
    if (!definition) {
      dropped.emptyDef++
      continue
    }
    const phonetic = fixPhonetic(e.phonetic)
    if (!phonetic) dropped.emptyPhonetic++
    rows.push({ word, phonetic, pos, definition, rank: rankOf(e), tag: e.tag, spelling: e.spelling })
  }

  // 4) 按词频排序后截到 MAX_WORDS：超出部分是最生僻的尾巴
  //    未收录（rank=0）的排最后，优先被截掉
  const rankKey = (r) => (r.rank > 0 ? r.rank : Number.MAX_SAFE_INTEGER)
  rows.sort((a, b) => rankKey(a) - rankKey(b) || a.word.localeCompare(b.word))
  const outline = rows.slice(0, MAX_WORDS)

  // 5) 剔掉基础词和专有名词，只留「六级大纲新增词」
  //    基础词 = tag 带 cet4 / gk / zk；专有名词 = ECDICT 里首字母大写（Jesus / Mars）
  const base = outline.filter((r) => BASE_TAGS.some((t) => hasTag(r, t)))
  const proper = outline.filter((r) => r.spelling[0] !== r.spelling[0].toLowerCase())
  const skip = new Set([...base, ...proper].map((r) => r.word))
  const list = outline.filter((r) => !skip.has(r.word))

  const out = list.map((r) => ({ word: r.word, phonetic: r.phonetic, pos: r.pos, definition: r.definition }))
  writeFileSync(OUT_WORDS, `${JSON.stringify(out)}\n`, 'utf8')

  // 6) 分档阈值：对这份词表的 log10(词频排名) 现跑 k-means，阈值 = 相邻簇心中点
  const ranked = list.filter((r) => r.rank > 0)
  const { centers } = kmeans1d(ranked.map((r) => Math.log10(r.rank)), K)
  const T_HIGH = Math.round(10 ** ((centers[0] + centers[1]) / 2))
  const T_MID = Math.round(10 ** ((centers[1] + centers[2]) / 2))

  // 7) 运行时分档表：全英文词里排名 <= T_MID 的，按 <= T_HIGH 切成两段
  //    用空格连接的字符串存，比 JSON 数组省掉引号和逗号（约省 30%）
  const high = []
  const mid = []
  for (const [word, e] of dict) {
    if (!TOKEN_RE.test(word)) continue
    const rank = rankOf(e)
    if (rank <= 0) continue
    if (rank <= T_HIGH) high.push(word)
    else if (rank <= T_MID) mid.push(word)
  }
  high.sort()
  mid.sort()
  writeFileSync(
    OUT_FREQ,
    `${JSON.stringify(
      {
        _comment:
          '由 scripts/build-wordlist.mjs 生成，勿手改。阈值来自对内置词表 log10(COCA 排名) 现跑的 k-means(k=3)：簇心取相邻中点后取整。',
        centers: centers.map((c) => Number(10 ** c).toFixed(0)),
        highRankMax: T_HIGH,
        midRankMax: T_MID,
        high: high.join(' '),
        mid: mid.join(' ')
      },
      null,
      0
    )}\n`,
    'utf8'
  )

  const nHigh = ranked.filter((r) => r.rank <= T_HIGH).length
  const nMid = ranked.filter((r) => r.rank > T_HIGH && r.rank <= T_MID).length
  const nLow = list.length - nHigh - nMid

  console.log(`ECDICT 命中 cet6 标签：${fromEcdict}`)
  console.log(`KyleBing 补漏：+${added}`)
  console.log(`丢弃：非单词形态 ${dropped.shape} / 无中文释义 ${dropped.emptyDef} / 无音标 ${dropped.emptyPhonetic}`)
  console.log(`候选 ${rows.length} 词 → 六级大纲取词频最高的 ${outline.length} 词`)
  console.log(`剔基础词(cet4/gk/zk) ${base.length} 个 / 专有名词 ${proper.length} 个 → 六级新增词 ${list.length} 词`)
  console.log(`k-means 簇心(COCA 排名)：${centers.map((c) => (10 ** c).toFixed(0)).join(' / ')} → 阈值 ${T_HIGH} / ${T_MID}`)
  console.log(`分档：高频 ${nHigh} / 中频 ${nMid} / 低频 ${nLow}`)
  console.log(`写入 ${OUT_WORDS}（${(JSON.stringify(out).length / 1024).toFixed(0)}KB）`)
  console.log(`写入 ${OUT_FREQ}（高频词表 ${high.length} 个 / 中频词表 ${mid.length} 个）`)
  console.log('前 3：', out.slice(0, 3).map((w) => `${w.word}${w.phonetic}${w.pos}${w.definition}`).join(' | '))
  console.log('末 3：', out.slice(-3).map((w) => `${w.word}${w.phonetic}${w.pos}${w.definition}`).join(' | '))
}

function entryScore(e) {
  return (e.phonetic ? 2 : 0) + (e.translation ? 1 : 0)
}

/** ECDICT 的 tag 是空格/逗号分隔的一串标签 */
function hasTag(e, t) {
  return e.tag.split(/[\s,]+/).includes(t)
}

main()
