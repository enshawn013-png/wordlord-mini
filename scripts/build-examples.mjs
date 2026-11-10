/**
 * 例句数据的构建管线（R9）。
 *
 * 产物：`src/data/examples.json` —— `word -> [英文例句, 中文翻译, 出处?]`
 *   第三项**缺失** = AI 生成（页面标「AI 生成例句，仅供参考」）；
 *   第三项是字符串 = 六级真题原句，字符串就是出处（页面标「六级真题 · 出处」）。
 *   用「第三项在不在」编码来源，是为了让 AI 生成的那 1800 多条不额外背一个字段
 *   （每条省 12 个字节，全表省 20KB+，而小程序主包有 2MB 上限）。
 *
 * 为什么例句不进 `cet6.json`：词表是「词 + 音标 + 词性 + 释义」四个字段的极简结构，
 * 由 build-wordlist.mjs 从 ECDICT 生成；例句是**另一条生产线**（可能换数据源、
 * 可能分批补真题），单独一个文件才能各自重跑、互不干扰。运行时由 data/words.ts
 * 的 `exampleOf()` 合并，页面只认这一个入口。
 *
 * 用法（两步）：
 *   node scripts/build-examples.mjs slice   # 把词表切成 .worddata/examples/chunk-NN.json
 *   ...为每个 chunk 生成 out-NN.json（人工 / AI 都可）...
 *   node scripts/build-examples.mjs merge    # 校验 + 合并成 src/data/examples.json
 *
 * out-NN.json 的格式（严格 JSON 数组，顺序不必和 chunk 一致，但词必须都在 chunk 里）：
 *   [{ "word": "abandon", "en": "...", "zh": "...", "from": "2019.06 阅读" }]
 * `from` 只写给真题原句；AI 生成的不写。
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const WORDS = 'src/data/cet6.json'
const DIR = '.worddata/examples'
const OUT = 'src/data/examples.json'

/** 一个分片多少个词：40~60 之间都合适（生成方一次读得完，出错了也只返工一小块） */
const CHUNK = 50

/** 英文例句的长度区间（词数）。太短没有语境，太长读起来累 */
const MIN_WORDS = 8
const MAX_WORDS = 28

function loadWords() {
  return JSON.parse(readFileSync(WORDS, 'utf8'))
}

/** 把词表切成分片，每片一个文件（含 phon/pos/definition，生成方要靠释义选词义） */
function slice() {
  const words = loadWords()
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })
  let n = 0
  for (let i = 0; i < words.length; i += CHUNK) {
    const part = words.slice(i, i + CHUNK)
    const name = `chunk-${String(n).padStart(2, '0')}.json`
    writeFileSync(`${DIR}/${name}`, `${JSON.stringify(part, null, 1)}\n`, 'utf8')
    n++
  }
  console.log(`切了 ${n} 个分片（每片 ${CHUNK} 词，共 ${words.length} 词）→ ${DIR}`)
}

/** 一个词的简单词干：剥掉常见的屈折后缀，用来判断例句里到底有没有这个词 */
function stem(w) {
  return w
    .toLowerCase()
    .replace(/(ies|ied)$/, 'y')
    .replace(/(ing|ed|es|s|ly|er|est|ness|ment|tion)$/, '')
}

/**
 * 一个词的几种可能词形前缀。例句里允许变形（-s / -ed / -ing / 比较级 / y↔i），
 * 所以检查时把词干也放进来 —— 只按原词查会误报（intensified / therapies / mightiest 都被冤枉过）。
 */
function variants(word) {
  const s = String(word).toLowerCase()
  const out = new Set([s, stem(s)])
  if (s.endsWith('y')) out.add(`${s.slice(0, -1)}i`)
  if (s.endsWith('e')) out.add(s.slice(0, -1))
  return [...out].filter((v) => v.length >= 3)
}

/** 例句里是否出现了这个词（允许变形） */
function containsWord(sentence, word) {
  return variants(word).some((v) => new RegExp(`\\b${v}`, 'i').test(sentence))
}

/** 校验 + 合并所有 out-*.json → src/data/examples.json */
function merge() {
  const words = loadWords()
  const known = new Set(words.map((w) => w.word))
  const chunks = readdirSync(DIR).filter((f) => /^chunk-\d+\.json$/.test(f)).sort()

  const table = {}
  const problems = []
  const seen = new Set()

  for (const cf of chunks) {
    const idx = cf.match(/\d+/)[0]
    const outFile = `${DIR}/out-${idx}.json`
    let rows
    try {
      rows = JSON.parse(readFileSync(outFile, 'utf8'))
    } catch (e) {
      problems.push(`out-${idx}.json 读不了/不是合法 JSON：${e.message}`)
      continue
    }
    if (!Array.isArray(rows)) {
      problems.push(`out-${idx}.json 不是数组`)
      continue
    }
    for (const r of rows) {
      const key = String(r && r.word ? r.word : '').toLowerCase().trim()
      if (!key) continue
      if (!known.has(key)) {
        problems.push(`out-${idx}.json 里的「${key}」不在内置词表里`)
        continue
      }
      if (seen.has(key)) {
        problems.push(`「${key}」重复出现（out-${idx}.json）`)
        continue
      }
      const en = String(r.en || '').trim()
      const zh = String(r.zh || '').trim()
      if (!en || !zh) {
        problems.push(`「${key}」缺 en / zh`)
        continue
      }
      const n = en.split(/\s+/).length
      if (n < MIN_WORDS || n > MAX_WORDS) problems.push(`「${key}」例句长度 ${n} 词（要求 ${MIN_WORDS}~${MAX_WORDS}）`)
      if (!containsWord(en, key)) problems.push(`「${key}」例句里找不到这个词`)
      const from = String(r.from || '').trim()
      table[key] = from ? [en, zh, from] : [en, zh]
      seen.add(key)
    }
  }

  const missing = words.map((w) => w.word).filter((w) => !seen.has(w))
  /**
   * ⚠️ 词表装在一个 `words` 子对象里，**不能把词直接摊在顶层**：
   * 六级词表里有个词就叫 `default`，摊平之后 JSON 顶层多一个 `default` 键，
   * 于是 `import examples from './examples.json'` 在 CommonJS 产物里
   * （tsc 编成 `require('./examples.json').default`）拿到的是**那个词的例句数组**，
   * 不是整张表 —— 表现为「所有词都查不到例句」。这个坑踩过一次，见 p0-check 的 R9 断言。
   */
  const out = {
    _comment:
      '由 scripts/build-examples.mjs 生成，勿手改。words[word] = [英文例句, 中文翻译, 出处?]；第三项缺失 = AI 生成（页面必须标「AI 生成例句，仅供参考」），第三项是字符串 = 六级真题原句（页面标「六级真题 · 出处」）。',
    words: Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1)))
  }
  writeFileSync(OUT, `${JSON.stringify(out)}\n`, 'utf8')

  const exam = Object.values(table).filter((v) => v[2]).length
  console.log(`合并 ${chunks.length} 个分片：${seen.size} / ${words.length} 词有例句（真题 ${exam} / AI ${seen.size - exam}）`)
  console.log(`写出 ${OUT}（${(JSON.stringify(out).length / 1024).toFixed(0)}KB）`)
  if (missing.length) console.log(`⚠️ 还没有例句的 ${missing.length} 个词：${missing.slice(0, 20).join(' ')}${missing.length > 20 ? ' …' : ''}`)
  if (problems.length) {
    console.log(`⚠️ ${problems.length} 条可疑数据：`)
    for (const p of problems.slice(0, 30)) console.log(`   - ${p}`)
    if (problems.length > 30) console.log(`   …还有 ${problems.length - 30} 条`)
  }
  if (missing.length || problems.length) process.exitCode = 1
}

const cmd = process.argv[2] || 'merge'
if (cmd === 'slice') slice()
else if (cmd === 'merge') merge()
else {
  console.log('用法：node scripts/build-examples.mjs slice|merge')
  process.exitCode = 1
}
