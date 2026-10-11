import Taro from '@tarojs/taro'
import { CLOUD_FUNCTION } from '../cloud/config'
import { cloudReady, initCloud } from '../cloud/init'
import { getAuth, setAuth } from '../store/auth'
import { onChange } from '../store/events'
import {
  bookPayload,
  CloudBookPayload,
  CloudWordRecord,
  exportReadingState,
  exportWordRecords,
  mergeBooks,
  mergeReadingState,
  mergeWordRecords,
  ReadingState
} from '../store/storage'

/**
 * 云同步。
 *
 * 三件事：
 * 1. **启动时静默登录** —— 云函数用 getWXContext() 拿 openid，不需要用户点授权。
 * 2. **登录后拉一次全量合并进本地** —— 换手机登录，标记 / 上传的词书 / 翻到第几页都回来。
 * 3. **之后本地每次改动都推增量** —— 标记、移除、「我会了」、上传/删除词书、翻页，
 *    都会先标脏，安静 1200ms 后合并成**一次** push 推到云端（连着标十个词也只发一次请求）。
 *
 * 所有云端读写都走云函数 cloudfunctions/wordlord，小程序端不直连数据库。原因：
 * - 小程序端 collection.get() **一次最多 20 条**，拉全量标记得翻几十次页；
 *   云函数端一次 100 条，循环几轮就拉完了。
 * - 云函数以管理员身份读写，不受集合权限设置影响，控制台里建好集合就行。
 * - openid 由 getWXContext() 直接给，不用自己算 _openid。
 *
 * 云端没开通（src/cloud/config.ts 里 CLOUD_ENV_ID 是空的）时整条链路静默关闭，
 * 本地功能一切照旧，「我的」页会显示「云同步未开通」。
 */

export interface SyncState {
  /** off = 没配环境 ID；idle = 正常；syncing = 正在传；error = 上次失败 */
  status: 'off' | 'idle' | 'syncing' | 'error'
  /** 状态说明（错误原因 / 缺哪个集合），直接给用户看 */
  message: string
  lastSyncAt: number
  openid: string
}

export interface SyncResult {
  words: number
  books: number
  missing: string[]
}

/** 本地改动攒多久之后一起推（毫秒）。连着操作只会发一次请求。 */
const DEBOUNCE_MS = 1200

let started = false
let state: SyncState = { status: 'off', message: '', lastSyncAt: 0, openid: '' }
const listeners: Array<() => void> = []

const dirtyWords = new Set<string>()
const dirtyBooks = new Set<string>()
const dirtyBooksRemoved = new Set<string>()
let dirtyState = false
let timer: ReturnType<typeof setTimeout> | null = null
let flushing = false

// ---------- 状态订阅（「我的」页要跟着变）----------

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

/** 订阅同步状态变化。**返回退订函数**，页面卸载时要调，否则反复进出会越堆越多。 */
export function onSyncChange(fn: () => void): () => void {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i >= 0) listeners.splice(i, 1)
  }
}

export function getSyncState(): SyncState {
  return state
}

/**
 * 一句话描述当前登录 / 同步状态。
 *
 * ⚠️ 2026-10：「我的」页整个删掉之后**暂时没有页面在用它了**（首页那行「我的」也一起没了）。
 * 留着是因为它是同步状态唯一的一处文案来源 —— 以后再加登录 / 同步界面，
 * 直接调它，别在页面里另写一遍。
 */
export function describeAuthState(): string {
  const auth = getAuth()
  if (!auth.openid) return state.status === 'off' ? '云同步未开通' : '未登录'
  if (state.status === 'syncing') return '正在同步…'
  if (state.status === 'error') return `同步失败：${state.message}`
  // 登录成功但云端还缺集合时，message 里放着那句提示，不能被「已同步」盖掉
  if (state.message) return state.message
  return '微信登录 · 数据已同步到云端'
}

// ---------- 云函数调用 ----------

interface CloudReply {
  ok?: boolean
  error?: string
  openid?: string
  profile?: { avatar?: string; nickname?: string } | null
  words?: CloudWordRecord[]
  books?: CloudBookPayload[]
  state?: ReadingState | null
  missing?: string[]
}

async function call(action: string, data?: Record<string, unknown>): Promise<CloudReply> {
  const cloud = (Taro as unknown as { cloud: { callFunction: (p: unknown) => Promise<unknown> } }).cloud
  const res = (await cloud.callFunction({
    name: CLOUD_FUNCTION,
    data: { action, ...(data || {}) }
  })) as { result?: CloudReply }
  return res.result || {}
}

/**
 * 跟 call 的区别：云函数自己返回的 { ok: false } 也要当成失败抛出来。
 *
 * 这一步不能省 —— 云函数里出错（比如集合没建）是**正常返回** { ok: false, error }
 * 而不是 reject，如果不看 ok 就当成推成功了，本地脏数据会被清掉，那批标记就真丢了。
 */
async function callOk(action: string, data?: Record<string, unknown>): Promise<CloudReply> {
  const reply = await call(action, data)
  if (!reply.ok) throw new Error(reply.error || '云端操作失败')
  return reply
}

/** 把微信和云函数的英文报错翻译成用户能看懂的一句话 */
function friendlyError(e: unknown): string {
  const raw =
    (e as { errMsg?: string })?.errMsg || (e as Error)?.message || String(e || '未知错误')
  if (/FunctionName|FUNCTION_NOT_FOUND|not found/i.test(raw)) {
    return `云函数 ${CLOUD_FUNCTION} 还没部署（开发者工具里右键 cloudfunctions/${CLOUD_FUNCTION} → 上传并部署）`
  }
  if (/invalid scope|env.*not exist|env.*invalid|INVALID_ENV/i.test(raw)) {
    return '云环境 ID 不对，或者环境刚开通还没生效（新环境要等约 10 分钟）'
  }
  if (/database collection not exists|collection not exist/i.test(raw)) {
    return '云数据库里还没建集合（user_words / user_books / user_profile）'
  }
  if (/timeout/i.test(raw)) return '网络超时，稍后会自动重试'
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw
}

// ---------- 启动 ----------

/** App 启动时调一次：初始化云开发 → 静默登录 → 拉云端数据合并。 */
export async function initSync(): Promise<void> {
  if (started) return
  started = true

  // 注册本地改动监听（唯一的监听者）
  onChange((kind, key) => {
    if (kind === 'word') dirtyWords.add(key)
    else if (kind === 'book') {
      dirtyBooks.add(key)
      dirtyBooksRemoved.delete(key)
    } else if (kind === 'book-removed') {
      dirtyBooksRemoved.add(key)
      dirtyBooks.delete(key)
    } else if (kind === 'state') dirtyState = true
    scheduleFlush()
  })

  const auth = getAuth()
  state = { ...state, openid: auth.openid, lastSyncAt: auth.lastSyncAt }

  if (!initCloud()) {
    setState({
      status: 'off',
      message: '云同步未开通（src/cloud/config.ts 里还没填环境 ID）'
    })
    return
  }

  setState({ status: 'syncing', message: '正在同步…' })
  try {
    const result = await loginAndSync()
    // 缺集合不算登录失败（该同步的照常同步了），但要明确告诉用户去补建
    if (result.missing.length) {
      setState({ status: 'idle', message: `云数据库还差集合：${result.missing.join('、')}` })
    }
  } catch (e) {
    setState({ status: 'error', message: friendlyError(e) })
  }
}

// ---------- 登录 + 拉取合并 ----------

/**
 * 登录并把云端数据合并进本地。「我的」页的「微信一键登录」按钮也调它（重试用）。
 * 失败时抛错，由调用方展示。
 */
export async function loginAndSync(): Promise<SyncResult> {
  if (!initCloud()) throw new Error('云同步未开通（src/cloud/config.ts 里还没填环境 ID）')

  setState({ status: 'syncing', message: '正在同步…' })
  try {
    const login = await call('login')
    if (!login.ok || !login.openid) throw new Error(login.error || '登录失败')

    // 头像昵称：云端有就用云端的（换手机能带回来），否则保留本地已设的
    const saved = getAuth()
    setAuth({
      openid: login.openid,
      avatar: login.profile?.avatar || saved.avatar,
      nickname: login.profile?.nickname || saved.nickname
    })

    const result = await pullAndMerge()
    setState({ status: 'idle', message: '', openid: login.openid, lastSyncAt: Date.now() })
    return result
  } catch (e) {
    setState({ status: 'error', message: friendlyError(e) })
    throw e
  }
}

/**
 * 拉云端全量 → 合并进本地 → 把本地多出来的（云端没有的 / 合并后不一致的）推回去。
 * 只在登录时跑一次。
 */
export async function pullAndMerge(): Promise<SyncResult> {
  const reply = await callOk('pull')

  const remoteWords = reply.words || []
  const remoteBooks = reply.books || []

  // 词：先合并（云端有的），再补上「本地有云端没有」的
  const merged = mergeWordRecords(remoteWords)
  const remoteWordSet = new Set(remoteWords.map((w) => w.word))
  const localOnly = exportWordRecords().filter((w) => !remoteWordSet.has(w.word))
  const words = dedupeWords([...merged, ...localOnly])

  // 词书：云端有的补进本地，本地多的推上去
  const bookMerge = mergeBooks(remoteBooks)
  const books: CloudBookPayload[] = []
  for (const id of bookMerge.pushIds) {
    const payload = bookPayload(id)
    if (payload) books.push(payload)
  }

  // 阅读位置：合并后整份推回云端（一份文档很小）
  const stateMerge = mergeReadingState(reply.state ?? null)

  const pushed = await callOk('push', { words, books, state: stateMerge.state })

  setAuth({ lastSyncAt: Date.now() })
  return {
    words: words.length,
    books: books.length,
    missing: uniq([...(reply.missing || []), ...(pushed.missing || [])])
  }
}

function uniq(list: string[]): string[] {
  return Array.from(new Set(list))
}

function dedupeWords(list: CloudWordRecord[]): CloudWordRecord[] {
  const map = new Map<string, CloudWordRecord>()
  for (const r of list) {
    const prev = map.get(r.word)
    if (!prev) map.set(r.word, r)
    else map.set(r.word, { word: r.word, markCount: Math.max(prev.markCount, r.markCount), mastered: prev.mastered || r.mastered })
  }
  return Array.from(map.values())
}

// ---------- 日常增量推送 ----------

/** 攒一会儿再推：连着标十个词只发一次请求 */
function scheduleFlush(): void {
  if (!cloudReady()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, DEBOUNCE_MS)
}

async function flush(): Promise<void> {
  if (flushing) return
  if (!cloudReady()) return
  // 没登录成功就先留着脏数据，等登录成功后由 pullAndMerge 全量带上去
  if (!getAuth().openid) return
  if (!dirtyWords.size && !dirtyBooks.size && !dirtyBooksRemoved.size && !dirtyState) return

  const words = exportWordRecords(Array.from(dirtyWords))
  const books: CloudBookPayload[] = []
  const removed: Array<{ id: string; deleted: true }> = []
  for (const id of dirtyBooks) {
    const payload = bookPayload(id)
    if (payload) books.push(payload)
  }
  for (const id of dirtyBooksRemoved) removed.push({ id, deleted: true })
  const stateToPush = dirtyState ? exportReadingState() : undefined

  // 先清脏再发，避免发送期间又改了一次导致重复
  dirtyWords.clear()
  dirtyBooks.clear()
  dirtyBooksRemoved.clear()
  dirtyState = false

  flushing = true
  let ok = false
  try {
    const reply = await callOk('push', {
      words,
      books: [...books, ...removed],
      state: stateToPush
    })
    ok = true
    setState({
      status: 'idle',
      message: reply.missing?.length ? `云数据库还差集合：${reply.missing.join('、')}` : '',
      lastSyncAt: Date.now()
    })
  } catch (e) {
    // 发送失败就把脏数据放回去，下次改动或下次启动时会重试。
    //
    // 注意这里**必须把所有词都放回去，包括 markCount 归零的**：那种记录代表
    // 「这个词被移除了」，云端要收到这条才会删掉旧标记。要是把它当成「没什么可传的」
    // 跳过，这次移除就永远传不上去 —— 下次登录云端那条旧标记会被合并回来，
    // 用户会发现删掉的词又自己长出来了。
    for (const w of words) dirtyWords.add(w.word)
    for (const b of books) dirtyBooks.add(b.id)
    for (const r of removed) dirtyBooksRemoved.add(r.id)
    if (stateToPush) dirtyState = true
    setState({ status: 'error', message: friendlyError(e) })
  } finally {
    flushing = false
    // 只在**成功**的前提下补排一次：这一轮发出去的时候（await 期间）用户可能又改了东西，
    // 那些改动的事件早触发完了，不补排就得等下一次改动或下次启动才传得上去。
    //
    // 失败时**故意不补排** —— 脏数据已经在 catch 里放回去了，等下一次改动、或下次启动
    // 时全量带上去。否则集合没建这种持续性错误会变成每 1.2 秒重试一次的死循环。
    if (ok && (dirtyWords.size || dirtyBooks.size || dirtyBooksRemoved.size || dirtyState)) {
      scheduleFlush()
    }
  }
}

// ---------- 头像 / 昵称 ----------

/** 保存头像和昵称：写本地 + 推云端（失败不影响本地） */
export async function saveProfile(patch: { avatar?: string; nickname?: string }): Promise<void> {
  setAuth(patch)
  if (!cloudReady() || !getAuth().openid) return
  try {
    await call('saveProfile', { profile: patch })
  } catch (e) {
    console.warn('[单词君] 资料同步到云端失败，已存在本地', e)
  }
}

/**
 * 把用户选的头像传到云存储，返回 fileID（云存储里的地址，换手机也能加载）。
 * 云没开通时退回本地 saveFile —— 只能在这台手机上看到，但不至于不显示。
 */
export async function uploadAvatar(filePath: string): Promise<string> {
  if (cloudReady() && getAuth().openid) {
    try {
      const cloud = (Taro as unknown as { cloud: { uploadFile: (p: unknown) => Promise<{ fileID: string }> } }).cloud
      const res = await cloud.uploadFile({
        cloudPath: `avatars/${getAuth().openid}_${Date.now()}.png`,
        filePath
      })
      if (res && res.fileID) return res.fileID
    } catch (e) {
      console.warn('[单词君] 头像上传到云存储失败，退回本地保存', e)
    }
  }

  return new Promise<string>((resolve) => {
    Taro.getFileSystemManager().saveFile({
      tempFilePath: filePath,
      success: (r) => resolve(r.savedFilePath),
      fail: () => resolve(filePath)
    })
  })
}
