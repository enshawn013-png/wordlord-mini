/*
 * P0 自查脚本：逐条对着验收标准跑真代码（storage.ts 的编译产物），不是「看代码觉得对」。
 *
 * 跑法：
 *   npx tsc -p p0-check/tsconfig.json
 *   node p0-check/run.js
 *
 * 覆盖：
 *   R1 每日目标唯一 = 34（首页 / 数据页 / 计划页读的是同一个函数）
 *   R2 今日 22 → 节奏合计 / 达标 / 活跃 / 首页今日 四处一致；且「迁移过口径的老缓存」也对
 *   R3 「六级整体」= 标记 ∪ 已掌握 去重后的真实已背数；计划进度口径一致
 *   R4 完成日期 12-09 被拒绝并给出 12-02 前的替代方案
 *   R9 内置词表每个词都有例句；AI 生成的一律带「AI 生成例句，仅供参考」
 *   R10 统计只按主词书；换主词书 / 删主词书都收敛到内置，其余词书进归档
 */
const path = require('path')
const Module = require('module')

const LIB = path.join(__dirname, 'lib')
const taroStub = path.join(__dirname, 'stub-taro.js')

// tsc 把 `import x from './f.json'` 编译成 `__importDefault(require(...)).default`，
// 而 Node 的 require 直接返回 JSON 本体 —— 在 require 阶段补一个 default 字段即可。
const origRequire = Module.prototype.require
Module.prototype.require = function (request) {
  const out = origRequire.apply(this, arguments)
  if (typeof request === 'string' && request.endsWith('.json') && out && typeof out === 'object') {
    if (!Object.prototype.hasOwnProperty.call(out, 'default')) {
      Object.defineProperty(out, 'default', { value: out, enumerable: false })
    }
  }
  return out
}

// 把 @tarojs/taro 换成替身（storage.ts 只用到缓存接口）
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === '@tarojs/taro') return taroStub
  return origResolve.call(this, request, ...rest)
}

const stub = require(taroStub)
const storage = require(path.join(LIB, 'store', 'storage.js'))

const DAY = 86400000
function dayKey(offset) {
  const d = new Date(Date.now() - offset * DAY)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}
const TODAY = dayKey(0)
const STATE_KEY = 'wordlord_state_v3'
const PROGRESS_KEY = 'wordlord_progress_v3'
const MASTERED_KEY = 'wordlord_mastered_v3'
const MARKED_AT_KEY = 'wordlord_marked_at_v1'

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log(`  [PASS] ${name}`)
  } else {
    fail++
    console.log(`  [FAIL] ${name}${extra === undefined ? '' : `  -> 实际：${JSON.stringify(extra)}`}`)
  }
}
function section(t) {
  console.log(`\n${t}`)
}

// ---------------------------------------------------------------------------
section('R1 · 每日目标只有一个来源（34）')
ok('getDailyGoal() === 34', storage.getDailyGoal() === 34, storage.getDailyGoal())
ok('DAILY_GOAL 常量 === 34', storage.DAILY_GOAL === 34, storage.DAILY_GOAL)
// 老缓存里躺着一个 20：不能再有任何读取方认它
stub.__store.set(STATE_KEY, { dailyGoal: 20, daily: {}, todayWords: {}, todayWordsRule: 1, todayDate: TODAY })
ok('老缓存 dailyGoal=20 时仍然返回 34', storage.getDailyGoal() === 34, storage.getDailyGoal())

// ---------------------------------------------------------------------------
section('R2 · 今日 22 个词 → 四处数字必须一致（正常路径）')
{
  stub.__store.clear()
  // 今天真的点过 22 个词：进度标记 22 个 + markedAt 22 个
  const progress = {}
  const markedAt = {}
  const todayWords = {}
  for (let i = 0; i < 22; i++) {
    const w = `word${i}`
    progress[w] = 1
    markedAt[w] = Date.now() - i * 1000
    todayWords[w] = 1
  }
  const daily = { [dayKey(3)]: 14, [dayKey(2)]: 9, [dayKey(1)]: 22, [TODAY]: 22 }
  stub.__store.set(PROGRESS_KEY, progress)
  stub.__store.set(MARKED_AT_KEY, markedAt)
  stub.__store.set(STATE_KEY, {
    pages: {},
    todayDate: TODAY,
    todayPageCount: 3,
    todayMarkCount: 22,
    todayWords,
    todayWordsRule: 1,
    daily,
    dailyGoal: 20,
    lastReader: null,
    reviews: {},
    reviewBatch: 10,
    plan: null
  })

  const todayCount = storage.loadTodayCounts().wordCount
  const stats = storage.getStudyStats()
  const counts = storage.getDailyCounts(7)
  const activity = storage.getActivityDays(30)
  const todayRow = counts[counts.length - 1]
  const rangeTotal = counts.reduce((n, d) => n + d.count, 0)
  const activeDays = activity.filter((a) => a.active).length

  ok('首页/翻书页今日计数 = 22', todayCount === 22, todayCount)
  ok('数据页「今日」= 22', stats.todayWords === 22, stats.todayWords)
  ok('节奏图今天那根柱 = 22', todayRow.count === 22, todayRow.count)
  ok('节奏「合计」里算进了 22（22+22+9+14=67）', rangeTotal === 67, rangeTotal)
  ok('节奏「达标」= 目标 34 下的 0 天（22 还没到 34）', counts.filter((d) => d.count >= storage.getDailyGoal()).length === 0)
  ok('活跃「合计」= 近 30 天 67 个词', stats.monthWords === 67, stats.monthWords)
  ok('活跃天数 = 4 天', activeDays === 4, activeDays)
  ok('near-30 与近 7 之和一致（同一数据源）', stats.monthWords === rangeTotal, { month: stats.monthWords, week7: rangeTotal })
}

// ---------------------------------------------------------------------------
section('R2 · 换成 12 个词（同一份数据）→ 各处跟着一起变')
{
  const s = stub.__store.get(STATE_KEY)
  s.todayWords = {}
  s.daily = { [dayKey(1)]: 22, [TODAY]: 0 }
  s.todayDate = TODAY
  s.todayWordsRule = 1
  for (let i = 0; i < 12; i++) s.todayWords[`w${i}`] = 1
  s.daily[TODAY] = 12
  stub.__store.set(STATE_KEY, s)

  const counts = storage.getDailyCounts(7)
  ok('今日 = 12', storage.getStudyStats().todayWords === 12, storage.getStudyStats().todayWords)
  ok('节奏图今天 = 12', counts[counts.length - 1].count === 12, counts[counts.length - 1].count)
  ok('活跃合计 = 34（12+22）', storage.getStudyStats().monthWords === 34, storage.getStudyStats().monthWords)
}

// ---------------------------------------------------------------------------
section('R2 · 老缓存口径迁移（今日 22 但 daily 还是旧值 1）→ 三处仍是 22')
{
  stub.__store.clear()
  const markedAt = {}
  for (let i = 0; i < 22; i++) markedAt[`mig${i}`] = Date.now() - i * 1000
  stub.__store.set(MARKED_AT_KEY, markedAt)
  // todayWordsRule = 0 = 老口径；daily[今天] = 1（用户截图里那个「合计 1 个词」的来源）
  stub.__store.set(STATE_KEY, {
    pages: {},
    todayDate: TODAY,
    todayPageCount: 4,
    todayMarkCount: 22,
    todayWords: {},
    todayWordsRule: 0,
    daily: { [TODAY]: 1 },
    dailyGoal: 20,
    lastReader: null,
    reviews: {},
    reviewBatch: 10,
    plan: null
  })

  const todayCount = storage.getStudyStats().todayWords
  const counts = storage.getDailyCounts(7)
  const rangeTotal = counts.reduce((n, d) => n + d.count, 0)
  const after = stub.__store.get(STATE_KEY)
  ok('迁移后今日 = 22', todayCount === 22, todayCount)
  ok('迁移后节奏合计 = 22（不再是 1）', rangeTotal === 22, rangeTotal)
  ok('迁移后 daily[今天] 被对齐成 22', after.daily[TODAY] === 22, after.daily[TODAY])
  ok('迁移可重复执行且不退化', storage.getDailyCounts(7).reduce((n, d) => n + d.count, 0) === 22)
  ok('活跃 = 1 天（今天）', storage.getActivityDays(30).filter((a) => a.active).length === 1)
}

// ---------------------------------------------------------------------------
section('R2 · 跨了两天才打开 app（去重表已空，daily 还有记录）→ 认历史记录，不抹成 0')
{
  stub.__store.clear()
  // 关键：**没有任何标记时间戳**（应用两天没打开、也没有可还原的依据），
  // 此时 syncDailyToday 必须让路给历史记录，而不是把 22 抹成 0
  stub.__store.set(STATE_KEY, {
    pages: {},
    todayDate: dayKey(2),
    todayPageCount: 0,
    todayMarkCount: 0,
    todayWords: {},
    todayWordsRule: 1,
    daily: { [TODAY]: 22 },
    dailyGoal: 20,
    lastReader: null,
    reviews: {},
    reviewBatch: 10,
    plan: null
  })
  const counts = storage.getDailyCounts(7)
  const dbgState = stub.__store.get(STATE_KEY)
  ok(
    '今天那格保留 22（不被 syncDailyToday 抹掉）',
    counts[counts.length - 1].count === 22,
    { count: counts[counts.length - 1].count, daily: dbgState.daily, todayWords: dbgState.todayWords }
  )
  ok(
    '跨天时活跃度带今天那格也是 22（同一把尺子）',
    storage.getActivityDays(30).slice(-1)[0].count === 22,
    storage.getActivityDays(30).slice(-1)[0].count
  )
}

// ---------------------------------------------------------------------------
section('R3 · 「六级整体」= 标记 ∪ 已掌握 去重')
{
  stub.__store.clear()
  // 4 个标记过（gamma 标了 2 次）、2 个已掌握（shared 两边都有 = 重复的那个）
  const progress = { alpha: 1, beta: 1, gamma: 2, shared: 3 }
  const mastered = { shared: Date.now(), delta: Date.now() }
  stub.__store.set(PROGRESS_KEY, progress)
  stub.__store.set(MASTERED_KEY, mastered)

  const words = [
    { word: 'alpha', phonetic: '', pos: '', definition: '' },
    { word: 'beta', phonetic: '', pos: '', definition: '' },
    { word: 'gamma', phonetic: '', pos: '', definition: '' },
    { word: 'delta', phonetic: '', pos: '', definition: '' },
    { word: 'shared', phonetic: '', pos: '', definition: '' },
    { word: 'untouched', phonetic: '', pos: '', definition: '' }
  ]

  // 真实已背 = {alpha, beta, gamma, shared, delta} = 5 个（shared 只算一次，untouched 不算）
  ok(
    '全词表 = 5，shared 只算一次、untouched 不算',
    storage.countLearnedWords(words, progress, mastered) === 5,
    storage.countLearnedWords(words, progress, mastered)
  )
  ok(
    '旧口径（只数 mastered）= 2，明显低估真实进度',
    Object.keys(mastered).length === 2,
    Object.keys(mastered).length
  )
  ok(
    '新口径 = 旧口径 + 只标记没掌握的那些（3 个）',
    storage.countLearnedWords(words, progress, mastered) ===
      Object.keys(mastered).length + Object.keys(progress).filter((w) => !mastered[w]).length,
    storage.countLearnedWords(words, progress, mastered)
  )

  // 数据页读的是缓存（不是上面那两张临时表），所以这里走一遍 setStorageSync → 读回来
  const stats = storage.getStudyStats()
  ok('「背过的词」（countTouchedWords）= 5，和上面同一个口径', stats.touchedWords === 5, stats.touchedWords)

  // 空词表 / 老缓存缺字段都不许炸
  ok('空词表返回 0', storage.countLearnedWords([], progress, mastered) === 0)
  ok('进度表是垃圾值时不炸', storage.countLearnedWords(words, {}, {}) === 0)
}

// ---------------------------------------------------------------------------
section('R3 补充 · 内置词书的真实分母（1824）+ 去重后分子')
{
  stub.__store.clear()
  const scope = storage.bookScope('builtin', 'all')
  ok('bookScope 分母 = 1824', scope.total === 1824, scope.total)
  ok('没有进度时分子 = 0', scope.done === 0, scope.done)
  ok('三档之和 = 整本', (() => {
    const h = storage.bookScope('builtin', 'high')
    const m = storage.bookScope('builtin', 'mid')
    const l = storage.bookScope('builtin', 'low')
    return h.total + m.total + l.total === scope.total
  })())
}

// ---------------------------------------------------------------------------
section('R4 · 12-02 缓冲期硬约束 + 考试日期锚点')
{
  ok('firstRoundDeadline() = 2026-12-02', storage.firstRoundDeadline() === '2026-12-02', storage.firstRoundDeadline())
  ok('默认考试日期 = 2026-12-12', storage.getExamDate() === '2026-12-12', storage.getExamDate())

  const bad = storage.checkBuffer('2026-12-09')
  ok('12-09 被判定越界', bad.ok === false && bad.days === 7, bad)
  ok('越界时给出替代日期 12-02', bad.date === '2026-12-02', bad.date)
  const good = storage.checkBuffer('2026-12-02')
  ok('12-02 本身允许（边界含当天）', good.ok === true, good)
  ok('允许时不给替代方案（date 是空串）', good.date === '' && good.days === 0, good)
  ok('11-30 允许', storage.checkBuffer('2026-11-30').ok === true)

  // 2026-11 口径（用户要求「计划完全由自己定」）：
  // `planAdvice()` 只做除法 —— **不改用户填的量，也不把完成日压回 12-02**。
  // 缓冲期（12-02）从「硬拦截」降级成「提示」：`checkBuffer()` 仍然会告诉你越界了，
  // 但计划页不再拒绝用户的设定（见 plan 页 pickDeadline / createPlan 的注释）。
  const advice = storage.planAdvice(1824, 5, '2026-11-20')
  ok('每天 5 个就按 5 个算（系统不再改用户填的量）', advice.perDay === 5, advice.perDay)
  ok(
    '完成日 = 起点 + ceil(1824/5) = 365 天后（2027-11-20）',
    advice.days === 365 && advice.date === '2027-11-20',
    advice
  )

  const late = storage.planAdvice(1824, 34, '2026-11-20')
  ok(
    '34 个/天也原样保留（54 天 → 2027-01-13）',
    late.perDay === 34 && late.days === 54 && late.date === '2027-01-13',
    late
  )
  ok(
    '越过缓冲期不再被自动改写（respectsBuffer 恒为 true，它只是算数）',
    late.respectsBuffer === true && storage.checkBuffer(late.date).ok === false,
    late
  )
  ok(
    '缓冲期提示还在：越界的完成日 checkBuffer 仍报 false',
    storage.checkBuffer(advice.date).ok === false,
    advice.date
  )

  // 真正算一遍：1824 词 ÷ 34 个/天 = 54 天。从 9-01 开始 → 在 12-02 之前，必须原样放行
  const fine = storage.planAdvice(1824, 34, '2026-09-01')
  ok(
    '9-01 开始、每天 34 个：原样放行（54 天后 = 10-25，早于 12-02）',
    fine.respectsBuffer === true && fine.perDay === 34 && fine.date === '2026-10-25',
    fine
  )

  // 考试日期可改，但缓冲期规则不跟着漂
  storage.setExamDate('2026-12-19')
  ok('考试日期可改', storage.getExamDate() === '2026-12-19', storage.getExamDate())
  ok('改考试日期不影响 12-02 规则', storage.firstRoundDeadline() === '2026-12-02')
  ok('12-09 仍然越界', storage.checkBuffer('2026-12-09').ok === false)
  storage.setExamDate('乱填')
  ok('乱填的日期回到默认 2026-12-12', storage.getExamDate() === '2026-12-12', storage.getExamDate())
}

// ---------------------------------------------------------------------------
section('R3 补充 · 计划进度也认「标记」（不再长期钉在 0）')
{
  stub.__store.clear()
  // 用词表里真实存在的前三个词（按词频排序）
  stub.__store.set(PROGRESS_KEY, { environmental: 1, attorney: 1, participant: 1 })
  stub.__store.set(MASTERED_KEY, {})
  storage.setPlan('builtin', 'all', '2026-12-02', 0)
  const st = storage.getPlanStatus()
  ok('计划进度 = 3（只标记、没点「我会了」也算已背）', st && st.done === 3, st && st.done)
  ok('计划剩余 = 1821', st && st.remaining === 1821, st && st.remaining)
  ok('计划分母仍是整本 1824', st && st.scopeTotal === 1824, st && st.scopeTotal)
  ok('按日期模式算出每天要背多少 > 0', st && st.perDay > 0, st && st.perDay)
}

// ---------------------------------------------------------------------------
section('R9 · 每个词都有例句，来源必须能看出来')
{
  const words = require(path.join(LIB, 'data', 'words.js'))
  const raw = require(path.join(LIB, 'data', 'cet6.json'))
  const list = raw.default || raw
  const missing = list.filter((w) => !words.exampleOf(w.word))
  ok(
    `内置词表 ${list.length} 个词全部有例句`,
    missing.length === 0,
    missing.slice(0, 5).map((w) => w.word)
  )

  const ex = words.exampleOf('environmental')
  ok('exampleOf() 给出英文例句 + 中文翻译', Boolean(ex && ex.en && ex.zh), ex)
  ok('例句里确实出现了这个词', Boolean(ex) && /environment/i.test(ex.en), ex && ex.en)
  ok(
    'AI 生成的标注 =「AI 生成例句，仅供参考」',
    Boolean(ex) && words.exampleSourceLabel(ex) === 'AI 生成例句，仅供参考',
    ex && words.exampleSourceLabel(ex)
  )
  ok(
    '真题原句的标注带出处',
    words.exampleSourceLabel({ en: 'x', zh: 'y', source: 'exam', from: '2019.06 阅读' }) ===
      '六级真题 · 2019.06 阅读',
    words.exampleSourceLabel({ en: 'x', zh: 'y', source: 'exam', from: '2019.06 阅读' })
  )
  ok('查不到的词返回 null（页面不占位、不编例句）', words.exampleOf('zzzznotaword') === null)
  ok('大小写不敏感（Environmental）', Boolean(words.exampleOf('Environmental')))
  // 词表里真的有个词叫 default：例句表要是把词摊在 JSON 顶层，
  // `import examples from './examples.json'` 在 CJS 产物里会拿到这个词的例句而不是整张表
  ok('default 这个词也能查到例句（顶层 .default 冲突的回归）', Boolean(words.exampleOf('default')))
}

// ---------------------------------------------------------------------------
section('R10 · 统计只按主词书口径算，其余词书归档')
{
  stub.__store.clear()
  const books = require(path.join(LIB, 'store', 'books.js'))

  ok('默认主词书 = 内置「大学六级」', books.mainBookId() === 'builtin', books.mainBookId())
  ok('默认主词书是 1824 词', books.mainBookWords().length === 1824, books.mainBookWords().length)
  ok('没有上传词书时归档区是空的', books.archivedBooks().length === 0, books.archivedBooks())

  // 造一本上传词书（3 个词，其中 environmental 和内置词表重名）
  const up = storage.addUploadBook('我的上传', [
    { word: 'internship', phonetic: '', pos: 'n.', definition: '实习' },
    { word: 'environmental', phonetic: '', pos: 'adj.', definition: '环境的' },
    { word: 'syllabus', phonetic: '', pos: 'n.', definition: '教学大纲' }
  ])
  ok('上传成功', Boolean(up && up.id), up)
  ok(
    '刚上传的词书默认进归档（不抢主词书）',
    books.mainBookId() === 'builtin' && books.archivedBooks().some((b) => b.id === up.id)
  )
  ok('主词书排在词书列表第一项', books.allBooks()[0].main === true && books.allBooks()[0].id === 'builtin')

  // 指定上传的那本为主词书
  storage.setMainBookId(up.id)
  ok('可以指定上传的词书为主词书', books.mainBookId() === up.id, books.mainBookId())
  ok('主词书词表跟着换（3 词）', books.mainBookWords().length === 3, books.mainBookWords().length)
  ok('主词书名字跟着换', books.mainBookTitle() === '我的上传', books.mainBookTitle())
  ok(
    '原主词书（大学六级）落进归档区',
    books.archivedBooks().length === 1 && books.archivedBooks()[0].id === 'builtin',
    books.archivedBooks()
  )

  // 统计口径：只在归档词书里动过手，绝不进主词书口径
  stub.__store.set(PROGRESS_KEY, { internship: 1 })
  stub.__store.set(MASTERED_KEY, {})
  ok(
    '主词书口径 = 1（只数主词书里动过的词）',
    storage.countLearnedWords(books.mainBookWords()) === 1,
    storage.countLearnedWords(books.mainBookWords())
  )
  ok(
    '内置六级口径 = 0（internship 不在内置词表里）',
    storage.countLearnedWords(books.bookWords('builtin')) === 0,
    storage.countLearnedWords(books.bookWords('builtin'))
  )

  // 删掉主词书：设置必须自动收回内置，不能指着一本不存在的书
  storage.removeUploadBook(up.id)
  ok('删掉主词书后自动退回内置', books.mainBookId() === 'builtin', books.mainBookId())
  ok('退回后主词书又是 1824 词', books.mainBookWords().length === 1824, books.mainBookWords().length)
  ok('归档区回到空', books.archivedBooks().length === 0, books.archivedBooks())
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
