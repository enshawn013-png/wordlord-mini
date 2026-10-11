// 单词君 · 云函数（整个项目只有这一个）
//
// 为什么所有云端读写都走云函数、小程序端不直连数据库：
//   1. 小程序端 collection.get() **一次最多 20 条**，拉全量标记得翻几十次页；
//      云函数端一次 100 条，循环几轮就能拉完（pull 里的 fetchAll）。
//   2. 云函数以管理员身份读写，**不受集合权限设置影响** —— 控制台里把三个集合
//      建出来就行，不用逐个去调权限（默认权限也不用改）。
//   3. openid 由 getWXContext() 直接给出，不用自己维护 _openid。
//
// action：
//   login        登录：返回 openid + 头像昵称（就是「用云函数换 openid」那一步）
//   pull         拉全量：标记 + 上传的词书 + 阅读位置
//   push         推增量：标记 / 词书（delete 标记为删除）/ 阅读位置
//   saveProfile  单独保存头像昵称

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const COL_WORDS = 'user_words'
const COL_BOOKS = 'user_books'
const COL_PROFILE = 'user_profile'

/** 一次 get 最多取多少条。云函数端上限是 100。 */
const PAGE = 100

/** 文档 _id 前缀，保证不同用户的同名记录不会撞 _id */
const wordId = (openid, word) => `${openid}__w__${word}`
const bookId = (openid, id) => `${openid}__b__${id}`
const profileId = (openid) => `${openid}__profile`

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, error: '云函数拿不到 openid' }

  const action = (event && event.action) || 'login'

  try {
    if (action === 'login') return await login(OPENID)
    if (action === 'pull') return await pull(OPENID)
    if (action === 'push') return await push(OPENID, event)
    if (action === 'saveProfile') return await saveProfile(OPENID, event.profile || {})
    return { ok: false, error: `未知的 action：${action}` }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) }
  }
}

// ---------- login ----------

async function login(openid) {
  const profile = await readProfile(openid)
  return { ok: true, openid, profile }
}

async function readProfile(openid) {
  try {
    const res = await db.collection(COL_PROFILE).doc(profileId(openid)).get()
    return res.data || null
  } catch (e) {
    // 文档不存在、甚至集合还没建，都当成「还没有资料」
    return null
  }
}

// ---------- pull ----------

async function pull(openid) {
  const missing = []

  const wordDocs = await fetchAll(COL_WORDS, openid, missing)
  const bookDocs = await fetchAll(COL_BOOKS, openid, missing)
  const profile = await readProfile(openid)
  if (!(await collectionExists(COL_PROFILE))) missing.push(COL_PROFILE)

  return {
    ok: true,
    openid,
    words: wordDocs.map((d) => ({
      word: d.word,
      markCount: d.markCount || 0,
      mastered: !!d.mastered
    })),
    books: bookDocs
      .filter((d) => !d.deleted)
      .map((d) => ({
        id: d.bookId,
        title: d.title || '',
        createdAt: d.createdAt || 0,
        count: d.count || 0,
        words: d.words || []
      })),
    state: (profile && profile.state) || null,
    profile: profile ? { avatar: profile.avatar || '', nickname: profile.nickname || '' } : null,
    missing
  }
}

/** 循环取满一个集合里属于该用户的所有记录 */
async function fetchAll(name, openid, missing) {
  const out = []
  for (let skip = 0; ; skip += PAGE) {
    let res
    try {
      res = await db
        .collection(name)
        .where({ _openid: openid })
        .skip(skip)
        .limit(PAGE)
        .get()
    } catch (e) {
      // 集合还没建（-502005 collection not exists）：不算致命错误，
      // 告诉客户端缺哪个，控制台里补建一下就好
      if (/collection|not exist|不存在/i.test((e && e.message) || '')) {
        if (missing.indexOf(name) < 0) missing.push(name)
        return []
      }
      throw e
    }
    out.push(...res.data)
    if (res.data.length < PAGE) break
  }
  return out
}

async function collectionExists(name) {
  try {
    await db.collection(name).limit(1).get()
    return true
  } catch (e) {
    return false
  }
}

// ---------- push ----------

async function push(openid, event) {
  const words = Array.isArray(event.words) ? event.words : []
  const books = Array.isArray(event.books) ? event.books : []
  const state = event.state || null
  const missing = []

  // 分批并发，别一口气几百个请求把云函数打满。
  // 标记和词书写失败**必须往外抛** —— 客户端要靠这个把脏数据留下来重试，
  // 悄悄吞掉就等于丢数据。
  await inChunks(words, 20, (w) => saveWord(openid, w))
  await inChunks(books, 5, (b) => saveBook(openid, b))

  // 阅读位置和头像昵称存在 user_profile 里。这个集合没建**不算错**：
  // 顶多不同步「翻到第几页」和头像昵称，不该连累标记同步。
  if (state) {
    try {
      await saveState(openid, state)
    } catch (e) {
      if (missing.indexOf(COL_PROFILE) < 0) missing.push(COL_PROFILE)
    }
  }

  return { ok: true, words: words.length, books: books.length, missing }
}

async function inChunks(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn))
  }
}

async function saveWord(openid, w) {
  if (!w || !w.word) return
  const id = wordId(openid, w.word)
  const coll = db.collection(COL_WORDS)
  const markCount = Math.max(0, Math.min(7, Number(w.markCount) || 0))
  const mastered = !!w.mastered

  // 标记归零又没掌握 = 这个词已经从用户数据里删掉了（生词本点了「移除」），
  // 云端也别留着占地方
  if (markCount === 0 && !mastered) {
    try {
      await coll.doc(id).remove()
    } catch (e) {
      // 本来就不存在，忽略
    }
    return
  }

  const data = { _openid: openid, word: w.word, markCount, mastered, updatedAt: Date.now() }
  // 先 add（带自定义 _id）——不存在就插入了；已存在会报重复，退回去 update
  try {
    await coll.add({ data: Object.assign({ _id: id }, data) })
  } catch (e) {
    await coll.doc(id).update({ data })
  }
}

async function saveBook(openid, b) {
  if (!b || !b.id) return
  const id = bookId(openid, b.id)
  const coll = db.collection(COL_BOOKS)

  if (b.deleted) {
    try {
      await coll.doc(id).remove()
    } catch (e) {
      // 本来就不存在，忽略
    }
    return
  }

  const data = {
    _openid: openid,
    bookId: b.id,
    title: b.title || '',
    createdAt: b.createdAt || Date.now(),
    count: b.count || (Array.isArray(b.words) ? b.words.length : 0),
    words: Array.isArray(b.words) ? b.words : []
  }
  try {
    await coll.add({ data: Object.assign({ _id: id }, data) })
  } catch (e) {
    await coll.doc(id).update({ data })
  }
}

async function saveState(openid, state) {
  await upsertProfile(openid, { state })
}

async function saveProfile(openid, profile) {
  const data = {}
  if (typeof profile.avatar === 'string') data.avatar = profile.avatar
  if (typeof profile.nickname === 'string') data.nickname = profile.nickname
  if (!Object.keys(data).length) return { ok: true }

  try {
    await upsertProfile(openid, data)
    return { ok: true }
  } catch (e) {
    // 集合没建：本地已经存下了，只是传不上去，不用当致命错误
    return { ok: true, missing: [COL_PROFILE] }
  }
}

/** user_profile 里一个用户一份文档，放头像昵称 + 阅读位置 */
async function upsertProfile(openid, patch) {
  const id = profileId(openid)
  const coll = db.collection(COL_PROFILE)
  const data = Object.assign({ _openid: openid, updatedAt: Date.now() }, patch)

  try {
    await coll.add({ data: Object.assign({ _id: id }, data) })
  } catch (e) {
    // 已存在：只更新这次带上的字段，别把头像昵称覆盖没了
    const update = Object.assign({}, patch)
    update.updatedAt = Date.now()
    await coll.doc(id).update({ data: update })
  }
}
