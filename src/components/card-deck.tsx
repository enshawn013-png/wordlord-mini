import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { exampleOf, Word } from '../data/words'
import { SegBar } from './seg-bar'
import { Stripe } from './stripe'
import { SpeakBtn } from './speak-btn'
import { getUiPrefs } from '../store/storage'
import { speak } from '../services/tts'
import { COLOR, FONT, FONT_STACK, RADIUS, SHADOW } from '../theme'

/**
 * 卡片版式（第四版：2026-11 用户报的三个问题）。
 *
 * ## 这一版改的是什么（用户原话对应到代码）
 *
 * | 用户说 | 原来 | 现在 |
 * | --- | --- | --- |
 * | 「点认识和不认识都自动跳下一个，这个不舒服」 | 「认识」点完当场飞走 | 两个按钮都**停在原地**，先看答案 |
 * | 「点那个认识也要跳出中文」 | 「认识」不展开释义 | 点「认识」也把释义 sheet 推上来 |
 * | 「认识变成下一个，到了下一个就变回来」 | 标签不变 | 点完标签变成「下一个」，换卡后自动变回「不认识 / 认识」 |
 * | 「最后一个单词点按钮没反应」 | 推进函数在最后一张直接 return | 最后一张点完进**完成面板**，问要不要再背一批 |
 *
 * ## 交互（三步，全站统一 —— 复习页 / 抽查卡都照这个来）
 *
 * 1. **没作答**：只有两个按钮 —— 左「不认识」、右「认识」。两者动作顺序都一样：
 *    **先记录，再展开答案，不跳走**。
 *    - 不认识 → `onMark()`（等级 +1，封顶 7 级）
 *    - 认识   → `onMaster()`（**等级 −1**，降到 0 级才算掌握）
 * 2. **已作答**：释义 + 例句从底部浮上来，按钮变成「上一个 / 下一个」。
 *    这一屏是**只读**的：再点按钮不会二次记录（原来「不认识」完再点「认识」会把
 *    同一个词直接送进「熟练掌握词汇」，等于一次误触抹掉一次判断）。
 * 3. **下一个**：滑走 → 新卡从右边推进来 → 按钮复位成「不认识 / 认识」。
 *    已经是最后一张时，直接进完成面板（不再「点了没反应」）。
 *
 * 另外：点卡片本身只是「偷看一眼释义」（`peeked`，不记录判断），
 * 左右滑动仍然是「跳过 / 回看」，滑动之后不会误触卡片的 peek（用 ref 挡掉 tap）。
 *
 * ## 位置
 * `index` 从翻书页传进来的 `page * PAGE_SIZE` 起步，每次移动都回调
 * `onIndexChange(index)`，翻书页用它写 `setCurrentPage` —— 两个版式共享同一个「上次背到哪儿」。
 *
 * ## 视觉（参考扇贝 / 不背单词，细节见 styles 里的注释）
 * - 一张卡只有一个大字（单词），音标紧贴下方，右侧一个小喇叭。
 * - 没翻面时「词 + 音标 + 提示」作为一个整体垂直居中；翻面后从顶部往下排释义和例句。
 * - 例句里被考的词用暖色标出来。
 * - 底部两个等宽大按钮：左「不认识」描边、右「认识」实心。
 */
export interface CardDeckProps {
  /** 这一档还没掌握的词，顺序和翻书页一致 */
  words: Word[]
  /** 从第几个开始（= 上次翻书那一页的第一个词） */
  startIndex: number
  /** 已掌握的词（卡面压暗） */
  mastered: Record<string, number>
  /** 今天已经动过手的词数 */
  todayCount: number
  /** 每日目标（34） */
  todayTarget: number
  /** 认识 → 已掌握 */
  onMaster: (word: Word) => void
  /** 不认识 → 七级标记 +1（和翻书页的圆圈同一个写入） */
  onMark: (word: Word) => void
  /** 各词的当前档位（0~7），用来在卡角显示「标记 3/7」 */
  progress: Record<string, number>
  /** 长按卡片 → 档位 −1（和翻书页长按圆圈同一个写入） */
  onUnmark: (word: Word) => void
  /** 撤销「认识」→ 把掌握撤回（点错那一题的退路） */
  onUnmaster: (word: Word) => void
  /** 位置变化 */
  onIndexChange: (index: number) => void
  /** 这一批背完之后，词库里还有没有词可以再背一批（没有就不显示「再背 N 个」） */
  canMore?: boolean
  /**
   * 这一批是「加背」的那一批（用户 2026-10-22）：加背只给一次，
   * 背完不再问「再背几个」，直接说恭喜超额完成。
   */
  bonus?: boolean
  /** 「再背 N 个」里的 N（= 今天的每日目标） */
  moreCount?: number
  /** 再要一批（父页面重新 loadBatch，并且换 key 让本组件重新挂载） */
  onMore?: () => void
  /** 「今天到这」：退出背单词界面 */
  onExit?: () => void
  /** 档位背完后的「再刷一遍」：整档重新过一遍（复习不占额度） */
  onReplay?: () => void
  /** 档位背完后的「换一档」：跳去选词表 */
  onSwitch?: () => void
}

/** 七级标记的上限（和 storage.ts 的 MAX_MARK 保持同一个数） */
const MAX_MARK = 7

/** 卡片滑走时的位移（px）：大于卡片宽度，整张滑出屏幕 */
const FLY_OUT = 420

/** 判定结果：null = 还没作答 */
type Verdict = 'master' | 'mark'

/**
 * 一张卡的作答记录。
 * `wrote` = 这一下有没有真的写进存储（标满 7 次 / 本来就已掌握 → false），
 * 撤销时只退真正写过的，见 answers 的注释。
 */
type CardAnswer = { verdict: Verdict; wrote: boolean; level: number }

export function CardDeck({
  words,
  startIndex,
  mastered,
  todayCount,
  todayTarget,
  onMaster,
  onMark,
  progress,
  onUnmark,
  onUnmaster,
  onIndexChange,
  canMore = false,
  bonus = false,
  moreCount,
  onMore,
  onExit,
  onReplay,
  onSwitch
}: CardDeckProps) {
  const total = words.length
  /** 操作偏好：惯用手 / 字号 / 震动。每次渲染读一次，设置页改完回到这里就是新的 */
  const prefs = getUiPrefs()

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(total - 1, 0))
  )
  /**
   * 每张卡自己的判定：index → { verdict, wrote }。
   *
   * - `verdict` 决定这一张卡长什么样（已作答 = 只读，按钮是「返回 / 下一个」）。
   * - `wrote` 记「那一下有没有真的写进存储」：标满 7 次时点「不认识」只是摊开答案，
   *   没加档；本来就已掌握的词再点「认识」也没有新写入。撤销时**只退真正写过的**，
   *   否则会把 7 减成 6、或者把之前就掌握的词撤销成没掌握。
   *
   * 这里必须同时存一份 ref：同一个 tick 里连点两下时，state 还没提交，
   * `answers[index]` 读到的还是旧值 —— 那两下都会通过「已作答就不许再判」的检查，
   * 等于一次误触记两次。ref 是同步写的，挡住的就是这种情况。
   */
  const [answers, setAnswers] = useState<Record<number, CardAnswer>>({})
  const answersRef = useRef<Record<number, CardAnswer>>({})
  const verdict = answers[index]?.verdict ?? null
  /** 当前这张卡的完整记录（等级 / 有没有写入），文案用它而不是 props 里的 markCount */
  const answered = answers[index]
  /** 只「偷看」释义，不算作答（点卡片触发） */
  const [peeked, setPeeked] = useState(false)
  /** 这一批背完了（最后一张点完「下一个」之后） */
  const [done, setDone] = useState(false)
  /** 印章按下时的压感：和它本身的斜度叠在一起，不是简单缩放 */
  const [sealDown, setSealDown] = useState(false)
  const [dx, setDx] = useState(0)
  const [opacity, setOpacity] = useState(1)
  const [instant, setInstant] = useState(false)
  /**
   * 换卡 / 推进 / 作答的**同步闸门**（只用 ref，不要 state）。
   *
   * 推进有 240ms 动画，动画期间旧写法用 state `busy` 挡重复点击 —— 但 state 要到下一轮
   * 渲染才提交，同一个 tick 里连点两下两下都会放行（一次误触滑过两张卡、
   * 或者把同一个词判两次）。ref 是同步写的，所以闸门必须是 ref。
   */
  const busyRef = useRef(false)
  /** 本次操作计数：认识 / 不认识各几次（底部一句实话 + 完成面板） */
  const [known, setKnown] = useState(0)
  const [marked, setMarked] = useState(0)
  /** 卡片上临时的一句话（标满 / 减一 / 已记一档），2 秒后自己消失 */
  const [note, setNote] = useState('')
  /**
   * 点按钮时飘出来的那一个小 emoji（苹果自带的那种）。
   * 用 key = 时间戳 保证同一个 emoji 连点也会重新播动画（React 会重建节点）。
   */
  const [burst, setBurst] = useState<{ id: number; emoji: string } | null>(null)
  /**
   * 刚点完那一下的「抖动」：认识 = 往上点一下头，不认识 = 左右摇两下（2026-10-22）。
   * 只抖 260~280ms 就清空，靠 keyframes 一次性播完，不占常驻状态。
   */
  const [nudge, setNudge] = useState<'' | 'yes' | 'no'>('')
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  /** 手指这一下有没有真的拖动过（拖动结束的那一次 tap 不算「点开释义」） */
  const dragged = useRef(false)
  /** 跟手位移也要用 ref 存一份：onTouchEnd 里读 state 会拿到上一帧的旧值 */
  const dxRef = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t))
    },
    []
  )

  /**
   * 换了一批词（父页面「再背 N 个」）就从头开始。
   * 父页面还会换 key 让组件重新挂载，这里是第二道保险：只要 words 变了，
   * 位置 / 判定 / 完成态一律清空，绝不把上一批的状态带到新的一批里。
   */
  useEffect(() => {
    setIndex(Math.min(Math.max(startIndex, 0), Math.max(words.length - 1, 0)))
    answersRef.current = {}
    setAnswers({})
    setPeeked(false)
    setDone(false)
    busyRef.current = false
    setDx(0)
    setOpacity(1)
    // startIndex 只在挂载时用，这里不放进依赖（换批时父页面传 0）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words])

  const current = words[index]
  /** 这个词已经被点过几次「不认识」（0~7） */
  const markCount = current ? progress[current.word] ?? 0 : 0
  /** 释义露出来了没有：作答了算，偷看过也算 */
  const revealed = Boolean(verdict) || peeked

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])

  /** 拿闸门：已经在动就直接放弃（连点两下只算一下） */
  const lock = useCallback(() => {
    if (busyRef.current) return false
    busyRef.current = true
    return true
  }, [])

  /** 放闸门（和 lock 成对） */
  const release = useCallback(() => {
    busyRef.current = false
  }, [])

  /** 同步写一张卡的作答记录：ref 先写，state 后写（见 answers 的注释） */
  const writeAnswer = useCallback((i: number, v: Verdict | null, wrote = false, level = 0) => {
    const next = { ...answersRef.current }
    if (v === null) delete next[i]
    else next[i] = { verdict: v, wrote, level }
    answersRef.current = next
    setAnswers(next)
  }, [])

  /** 飘一个小 emoji：700ms 后自动清掉（动画本身就是 700ms，见 app.css 的 burstUp） */
  const fireBurst = useCallback(
    (emoji: string) => {
      setBurst({ id: Date.now(), emoji })
      later(() => setBurst(null), 720)
    },
    [later]
  )

  /**
   * 「说一句就消失」的统一入口。
   *
   * 为什么要有序号：`answer()` 和 `revertCurrent()` 各自挂了一个 1.8 秒后清空 note 的定时器，
   * 上一句的定时器会把**下一句**刚显示出来的提示提前清掉（实测「撤销」的提示一闪就没）。
   * 每次说话都 ++，回调里对不上号就不动手。
   */
  const noteSeq = useRef(0)
  const showNote = useCallback(
    (text: string, ms = 1800) => {
      const id = ++noteSeq.current
      setNote(text)
      later(() => {
        if (noteSeq.current === id) setNote('')
      }, ms)
    },
    [later]
  )


  const vibrate = useCallback(() => {
    if (!prefs.haptics) return
    try {
      Taro.vibrateShort({ type: 'light' })
    } catch {
      // 老基础库 / 用户在系统里关掉了震动：忽略，不影响流程
    }
  }, [prefs.haptics])

  /**
   * 换一张卡（只负责动画和位置，不写任何数据）：
   * ① 当前卡向左滑出 + 淡出（240ms）
   * ② 换 index、收起释义、判定清零，新卡瞬间挪到右侧（instant，无过渡）
   * ③ 新卡滑回原位 + 淡入（260ms）
   */
  const slideTo = useCallback(
    (dir: 1 | -1, nextIndex: number) => {
      setDx(dir * -FLY_OUT)
      setOpacity(0)
      later(() => {
        setInstant(true)
        setIndex(nextIndex)
        // 判定不再在这里清空：每张卡各留各的（滑回来要还原）
        setPeeked(false)
        setDx(dir * 90)
        setOpacity(0)
        later(() => {
          setInstant(false)
          setDx(0)
          setOpacity(1)
          later(release, 260)
        }, 32)
      }, 240)
    },
    [later, release]
  )

  /**
   * 「下一个」：不是最后一张就换卡；**是最后一张就进完成面板**。
   * 这也是用户在最后一张点按钮「没反应」的那处 bug 的修法 ——
   * 任何一次推进都必须有可见结果：要么是新卡，要么是结算屏。
   */
  const advance = useCallback(() => {
    if (!current || !lock()) return
    vibrate()
    if (index >= total - 1) {
      setDx(-FLY_OUT)
      setOpacity(0)
      later(() => {
        setDone(true)
        setInstant(false)
        setDx(0)
        setOpacity(1)
        release()
      }, 240)
      return
    }
    slideTo(1, index + 1)
  }, [current, index, total, later, lock, release, slideTo, vibrate])

  /**
   * 右滑 / 「上一个」：**只退位置，不动数据**。
   *
   * 判定按 index 记账，所以滑回去看到的还是当时那个答案（按钮是「返回 / 下一个」），
   * 而不是一张可以重判的新卡；只有 `peeked`（偷看释义）跟着卡片走、这里清掉。
   * 这一条正是「滑回已作答的词，按钮全复活、能再判一次」的修法。
   */
  const goBack = useCallback(() => {
    if (index <= 0 || !lock()) return
    vibrate()
    setDx(FLY_OUT)
    setOpacity(0)
    later(() => {
      setInstant(true)
      setIndex((i) => Math.max(i - 1, 0))
      setPeeked(false)
      setDx(-90)
      setOpacity(0)
      later(() => {
        setInstant(false)
        setDx(0)
        setOpacity(1)
        later(release, 260)
      }, 32)
    }, 200)
  }, [index, later, lock, release, vibrate])

  /**
   * 作答：「不认识」= 等级 +1，「认识」= 等级 −1（降到 0 级才掌握）。
   *
   * 两个按钮都是**先记录、再摊开答案、停在原地**（用户 2026-11 要求）。
   * 已经作答过（verdict 有值）就不再进这里 —— 已作答状态的两个按钮是
   * 「上一个 / 下一个」，没有任何路径能对一个词判两次。
   *
   * 标满 7 次时仍然摊开答案（用户显然想看这个词），只是不再往上加，
   * 并说明「长按卡片可以减一」—— 和翻书页那句「已标满 7 次 · 长按圆圈可以减一」同一个话术。
   * 关键是**判定照样成立**：按钮照常变成「下一个」，不会出现「点了没反应」。
   */
  const answer = useCallback(
    (v: Verdict) => {
      // 「这个词判过没有」用 ref 判断（同步），所以同一 tick 里的第二下直接丢掉 ——
      // 误触 / 连点都不会记两次。已作答的卡片上也不会再有认识/不认识按钮，
      // 这一条只是第二道闸。
      if (!current || answersRef.current[index]) return
      const alreadyMastered = Boolean(mastered[current.word])
      /**
       * 2026-11 用户定的七级刻度（和复习页同一套）：
       * - 认识 = **等级 −1**，落到 0 级才算掌握（移出生词本）；
       * - 不认识 = **等级 +1**，封顶 7 级。
       * 所以「认识」不再是「直接掌握」，而是磨一级。
       */
      const newLevel =
        v === 'master'
          ? alreadyMastered
            ? 0
            : Math.max(markCount - 1, 0)
          : Math.min(markCount + 1, MAX_MARK)
      const masteredNow = v === 'master' && newLevel === 0
      /** 这一下会不会真的改存储（已掌握的再点认识、7 级再点不认识 → 不改） */
      const wrote = v === 'master' ? !alreadyMastered : markCount < MAX_MARK
      // 先落记录，再动数据和动画：界面状态与存储的顺序必须一致，
      // 否则撤销时会出现「按钮已经是返回/下一个，但记录还没写」的中间态。
      writeAnswer(index, v, wrote, newLevel)
      vibrate()
      let msg = ''
      if (v === 'master') {
        if (!alreadyMastered) onMaster(current)
        setKnown((n) => n + 1)
        fireBurst('✓')
        msg = alreadyMastered
          ? '这个词之前就已经掌握'
          : masteredNow
            ? '等级归零 · 已掌握，移出生词本'
            : `等级 ${markCount} → ${newLevel} · 还差 ${newLevel} 次答对`
      } else if (markCount >= MAX_MARK) {
        msg = '已经是 7 级（最不熟）· 长按卡片可以减一'
        fireBurst('+1')
      } else {
        onMark(current)
        setMarked((n) => n + 1)
        fireBurst('+1')
        // 「长按可减」写在标记那一刻：隐藏操作必须在用户正动手的时候告诉他，
        // 塞在页面角落的静态提示没人看
        msg = `等级 +1 · 现在 ${newLevel}/7 · 长按卡片可减`
      }
      showNote(msg)
      // 先抖一下，再出中文（2026-10-22 用户要的）：认识点头、不认识摇头，
      // 抖 280ms 左右就停，紧接着释义 sheet 弹上来 —— 手感上像「卡片先有反应」。
      setNudge(v === 'master' ? 'yes' : 'no')
      later(() => setNudge(''), 320)
    },
    [current, index, markCount, mastered, onMaster, onMark, fireBurst, later, showNote, vibrate, writeAnswer]
  )

  /**
   * 「↩ 撤销」= 撤销**眼前这一张**的判定，永远只作用于当前这个词。
   *
   * 老实现只有一个 `undo` 槽位，里面记着最近一次作答的 index。于是
   * 「答 A → 下一个 → 答 B → 滑回 A → 按返回」时：按的是 A 那张卡的按钮，
   * 撤销的却是 B 的记录，人还会被滑到 B 那张上去 —— 按钮看着都「在线」，
   * 干的是另一件事。现在按 index 取记录，谁在眼前就撤谁，不再有跳卡这回事。
   *
   * 只退**真正写过的**（wrote）：标满 7 次时点「不认识」没有写入，
   * 撤这一下绝不能去减档（会把 7 减成 6）；本来就已掌握的词再点「认识」也没写入，
   * 撤它不会把之前就有的掌握状态抹掉。
   */
  const revertCurrent = useCallback(() => {
    if (!current) return
    const rec = answersRef.current[index]
    if (!rec) return
    vibrate()
    if (rec.wrote) {
      if (rec.verdict === 'master') {
        onUnmaster(current)
        setKnown((n) => Math.max(0, n - 1))
      } else {
        onUnmark(current)
        setMarked((n) => Math.max(0, n - 1))
      }
    }
    writeAnswer(index, null)
    showNote('已撤销 · 重新选')
  }, [current, index, onUnmark, onUnmaster, showNote, vibrate, writeAnswer])

  // 位置变了就告诉翻书页（它负责 setCurrentPage，两个版式共享同一个「上次背到哪儿」）
  useEffect(() => {
    onIndexChange(index)
  }, [index, onIndexChange])

  // 自动发音：设置打开时，新卡出现就读一遍单词（只读词，不读释义）
  const spokenWord = useRef('')
  useEffect(() => {
    if (!current || done) return
    if (!prefs.autoSpeak) return
    if (spokenWord.current === current.word) return
    spokenWord.current = current.word
    try {
      speak(current.word)
    } catch {
      // 断网 / 发音加载失败时 tts 内部已经提示过，这里不再叠加
    }
  }, [current, done, prefs.autoSpeak])

  if (!current && !done) return null

  const meta = current ? [current.phonetic, current.pos].filter(Boolean).join('   ') : ''
  const example = current ? exampleOf(current.word) : null
  /**
   * 字号跟着词长走：逐字母排版之后，长词（constitute / internationalization）
   * 会顶到卡片外面去。按长度分四档，最短的词最大 104rpx，最长的收到 58rpx。
   */
  const wordLen = current ? current.word.length : 0
  const wordSize = wordLen <= 8 ? 104 : wordLen <= 11 ? 88 : wordLen <= 14 ? 74 : 58
  const isMastered = current ? Boolean(mastered[current.word]) : false
  const goalPct = todayTarget > 0 ? Math.round((todayCount / todayTarget) * 100) : 0
  const left = total - index - 1
  /** 完成面板里的那句「再背几个」 */
  const nextBatch = moreCount && moreCount > 0 ? moreCount : todayTarget

  // ---------------- 完成面板（今天这一批背完）----------------
  if (done) {
    /** 加背那一批背完了：这是今天的终点，只报喜、不再问「还背吗」 */
    const overBy = todayTarget > 0 ? Math.max(todayCount - todayTarget, 0) : 0
    const title = bonus
      ? '恭喜你今天超额完成！'
      : todayTarget > 0 && todayCount >= todayTarget
        ? `今天的 ${todayTarget} 个背完了`
        : `这一批 ${total} 个背完了`
    return (
      <View style={process.env.TARO_ENV === 'h5' ? styles.h5Wrap : styles.wrap}>
        <View style={styles.doneArea}>
          <View style={styles.doneCard}>
            <Text style={styles.doneEmoji}>{bonus ? '§' : '✓'}</Text>
            <Text style={styles.doneTitle}>{title}</Text>
            <Text style={styles.doneStat}>
              认识 {known} 个 · 不认识 {marked} 个
            </Text>
            <Text style={styles.doneGoal}>
              今日累计 {todayCount} 个
              {bonus && overBy > 0
                ? ` · 比计划多背了 ${overBy} 个`
                : goalPct >= 100
                  ? ' · 已达标'
                  : todayTarget > 0
                    ? ` · 目标 ${todayTarget}`
                    : ''}
            </Text>
            <Text style={styles.doneAsk}>
              {canMore
                ? bonus
                  ? `加背 ${overBy + total} 个了，还想再来 ${nextBatch} 个？`
                  : `还留着力气的话，要继续多背 ${nextBatch} 个吗？`
                : '这一档背完了 —— 想继续随时可以再刷一遍，或者换一档。'}
            </Text>

            {/* 没词可背了也不准出现死路：给「再刷一遍 + 换一档」两条出路 */}
            {!canMore && onReplay ? (
              <View
                hoverClass="press"
                style={{ ...styles.doneBtn, ...styles.doneBtnPrimary }}
                onClick={onReplay}
              >
                <Text style={styles.doneBtnPrimaryText}>再刷一遍这一档</Text>
              </View>
            ) : null}

            {/* 加背不限次数：超额之后只要这一档还有词，就一直可以再要一批 */}
            {canMore && onMore ? (
              <View
                hoverClass="press"
                style={{ ...styles.doneBtn, ...styles.doneBtnPrimary }}
                onClick={onMore}
              >
                <Text style={styles.doneBtnPrimaryText}>再背 {nextBatch} 个</Text>
              </View>
            ) : null}
            {onExit ? (
              <View
                hoverClass="press"
                style={{
                  ...styles.doneBtn,
                  ...styles.doneBtnGhost,
                  ...(canMore ? null : styles.doneBtnGhostSolo)
                }}
                onClick={onSwitch || onExit}
              >
                <Text style={styles.doneBtnGhostText}>
                  {canMore || bonus ? '今天到这，明天见' : onSwitch ? '换一档继续' : '返回'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    )
  }

  // ---------------- 卡片 ----------------
  return (
    <View style={process.env.TARO_ENV === 'h5' ? styles.h5Wrap : styles.wrap}>
      {/* ── 顶部：位置 + 今日进度（扇贝那根细进度条的位置） ── */}
      <View style={styles.topRow}>
        <Text style={styles.counter}>
          {index + 1}
          <Text style={styles.counterUnit}> / {total}</Text>
        </Text>
        <View style={styles.goalBox}>
          <Text style={styles.goalText}>今日 </Text>
          <Text style={styles.goalNum}>{todayCount}</Text>
          {/* 超额背的时候（34 背完还继续）不再写「68 / 34」—— 分母是「今天的目标」，
              不是「今天最多能背多少」，写成分数会让人以为哪里算错了 */}
          <Text style={styles.goalText}>
            {todayTarget > 0 && todayCount > todayTarget ? ' 个' : ` / ${todayTarget}`}
          </Text>
          {goalPct >= 100 ? <Text style={styles.goalDone}>已达标</Text> : null}
        </View>
      </View>

      {/* 分段进度：和首页 / 复习页同一条进度语汇（components/seg-bar.tsx） */}
      <SegBar value={index + 1} total={total} style={{ marginTop: '16rpx' }} />

      {/* ── 卡片 ── */}
      <View style={styles.cardArea}>
        {burst ? (
          <>
            <View key={`ring-${burst.id}`} style={styles.stampRing} />
            <Text key={burst.id} style={styles.burst}>
              {burst.emoji}
            </Text>
          </>
        ) : null}
        <View
          style={{
            ...(process.env.TARO_ENV === 'h5' ? styles.h5Card : styles.card),
            // 翻面后底部要留出 sheet 的位置：sheet 是 fixed 高度的绝对定位块，
            // 不留这 320rpx 的话卡片会缩成一条，sheet 就叠在词上了
            ...(revealed ? { paddingBottom: '320rpx' } : null),
            transform: `translate3d(${dx}px, 0, 0)`,
            opacity,
            // 点完那一下的「抖动」：一次性播完就停（keyframes 见 app.css 第 6 节）
            animation:
              nudge === 'yes'
                ? 'cardNudgeYes 280ms cubic-bezier(.22,.61,.36,1)'
                : nudge === 'no'
                  ? 'cardNudgeNo 300ms cubic-bezier(.22,.61,.36,1)'
                  : undefined,
            transition: instant
              ? 'none'
              : 'transform 260ms cubic-bezier(.22,.61,.36,1), opacity 220ms ease'
          }}
          onTouchStart={(e: any) => {
            const t = e.touches[0]
            touchStart.current = { x: t.clientX, y: t.clientY }
            dragged.current = false
          }}
          onTouchMove={(e: any) => {
            const s = touchStart.current
            if (!s) return
            const t = e.touches[0]
            const mx = t.clientX - s.x
            const my = t.clientY - s.y
            // 竖向意图明显时不跟手（把上下滑让给页面）
            if (Math.abs(mx) > Math.abs(my) && Math.abs(mx) > 8) {
              // ⚠️ 性能：touchmove 一帧可能触发多次。
              // 原来每次都 setInstant + setDx（两个 state → 两次渲染），快速滑动会掉帧。
              // 现在 setInstant 只在「开始拖」那一下切一次；dx 位移小于 1.5px 不提交。
              if (!dragged.current) {
                dragged.current = true
                setInstant(true)
              }
              const next = mx * 0.55
              if (Math.abs(next - dxRef.current) > 1.5) {
                dxRef.current = next
                setDx(next)
              }
            }
          }}
          onTouchEnd={() => {
            const moved = dxRef.current
            dxRef.current = 0
            setInstant(false)
            setDx(0)
            touchStart.current = null
            if (moved < -70) advance()
            else if (moved > 70) goBack()
          }}
          onClick={() => {
            // 拖动结束那一下会跟着一个 click，别把它当成「点卡片看释义」
            if (dragged.current) {
              dragged.current = false
              return
            }
            setPeeked(true)
          }}
          onLongPress={() => {
            if (markCount <= 0) {
              showNote('这个词还没标记')
            } else {
              onUnmark(current)
              fireBurst('−1')
              showNote(`标记 −1（现在 ${markCount - 1}/7）`)
            }
          }}
        >
          {/* 卡面顶部：分档芯片钉在卡顶 */}
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{isMastered ? '已掌握' : '六级核心'}</Text>
            </View>
            {markCount > 0 ? (
              <Text style={markCount >= MAX_MARK ? styles.markFull : styles.markTag}>
                {markCount >= MAX_MARK ? '等级 7/7 · 最不熟' : `等级 ${markCount}/7`}
              </Text>
            ) : null}
          </View>

          {/*
            词的排版分两种状态：
            - 没翻面：**中间那块自己垂直居中**（词、音标、提示是一个整体，不是各飘各的）
            - 翻面后：从顶部往下自然排，释义和例句在分割线下面展开
          */}
          <Text style={styles.ghostLetter}>{current.word.charAt(0).toUpperCase()}</Text>
          <View style={revealed ? styles.topBlock : styles.centerBlock}>
            {/* 逐字母落版：每个字母从下方带一点旋转压上去，像活字印刷 */}
            <View key={current.word} style={styles.wordRow}>
              {current.word.split('').map((ch, i) => (
                <Text
                  key={`${ch}-${i}`}
                  style={{
                    ...styles.wordChar,
                    fontSize: `${prefs.font === 'large' ? Math.round(wordSize * 1.15) : wordSize}rpx`,
                    lineHeight: `${prefs.font === 'large' ? Math.round(wordSize * 1.3) : Math.round(wordSize * 1.14)}rpx`,
                    ...(isMastered ? styles.wordDone : null),
                    animationDelay: `${i * 34}ms`
                  }}
                >
                  {ch}
                </Text>
              ))}
            </View>

            {/* 音标 + 发音（发音只是个小喇叭，不做大按钮） */}
            <View style={styles.metaRow}>
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
              <SpeakBtn word={current.word} style={styles.speak} />
            </View>

            {revealed ? null : <Text style={styles.hint}>轻点卡片看释义</Text>}
          </View>

          {/*
            释义 sheet：不再把释义塞进卡片正文，而是像 iOS 的 sheet 一样
            从卡片底部浮上来 —— 顶部一条 72×8rpx 的把手、四个角只圆上面两个、
            半透明暖白 + backdrop blur，背后的单词会透出来一点影子（这就是「玻璃」的来源）。
            backdrop-filter 在个别安卓机型上会降级成纯色半透明，所以底色给到 .86，
            降级了也照样读得清；不使用它做唯一的对比来源。
          */}
          {revealed ? (
            <View
              style={{
                ...styles.sheet,
                // 中文出场：认识 = 干脆弹上来；不认识 = 歪着浮上来再扶正；只是偷看 = 普通上浮
                animation: verdict
                  ? verdict === 'master'
                    ? 'sheetSpringYes 380ms cubic-bezier(.22,1.2,.36,1) both'
                    : 'sheetBounceNo 400ms cubic-bezier(.22,1.1,.36,1) both'
                  : 'sheetUp 320ms cubic-bezier(.22,.61,.36,1) both'
              }}
            >
              <View style={styles.sheetHandle} />
              {/* 判定回执：让用户一眼看到「我刚才那一下记成什么了」 */}
              {verdict ? (
                <Text style={styles.verdictLine}>
                  {verdict === 'master'
                    ? answered?.level === 0
                      ? '等级归零 · 已掌握，移出生词本'
                      : `认识 · 等级 ${answered?.level ?? Math.max(markCount - 1, 0)}/7`
                    : `不认识 · 等级 ${answered?.level ?? markCount}/7`}
                </Text>
              ) : null}
              <ScrollView scrollY style={styles.sheetBody}>
                <Text className="text-break" style={styles.definition}>
                  {current.definition}
                </Text>
                {example ? (
                  <View style={styles.example}>
                    <Text className="text-break" style={styles.exampleEn}>
                      {highlight(example.en, current.word)}
                    </Text>
                    <Text className="text-break" style={styles.exampleZh}>
                      {example.zh}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── 底部按钮 ──
          未作答：左「不认识」（描边）右「认识」（实心）；
          已作答：左「↩ 撤销」右「下一个」。
          「撤销」就是「点错了」的退路：撤回**这一张**的记录，按钮回到认识/不认识，
          人不动（想换词用左右滑）。它永远作用于眼前这个词 —— 滑回任何一张已作答的卡，
          看到的都是当时那个答案 + 撤销，不会再出现「认识/不认识」全复活、能再判一次。 */}
      <Stripe tone="yellow" height={20} style={{ marginTop: '18rpx' }} />

      {verdict === null ? (
        <View
          style={{
            ...styles.actions,
            // 左手模式整行镜像：主按钮跑到左下角，右手模式在右下角
            flexDirection: prefs.hand === 'left' ? 'row-reverse' : 'row',
            animation: 'fadeUp 460ms cubic-bezier(.22,1,.36,1) backwards'
          }}
        >
          {/* 次要动作：一条扁长的纸带；主操作：右下角一颗厚圆钮。
              两个形状不一样，手不用看也知道哪个是「往前走」。 */}
          <View
            hoverClass="press"
            style={{ ...styles.btn, ...styles.btnGhost }}
            onClick={() => answer('mark')}
          >
            <Text style={styles.btnGhostText}>不认识</Text>
          </View>
          <View
            hoverClass="press"
            style={{
              ...styles.btnRound,
              marginLeft: prefs.hand === 'left' ? 0 : '18rpx',
              marginRight: prefs.hand === 'left' ? '18rpx' : 0,
              // 印章的斜度跟着手走：右手时尖角朝左下，左手时朝右下；
              // 按下时沿着同一个斜度再压下去一点，手感像真按了一枚章
              transform: `rotate(${prefs.hand === 'left' ? 5 : -5}deg) scale(${sealDown ? 0.9 : 1})`,
              transition: 'transform 160ms cubic-bezier(.22,1,.36,1)'
            }}
            onTouchStart={() => setSealDown(true)}
            onTouchEnd={() => setSealDown(false)}
            onTouchCancel={() => setSealDown(false)}
            onClick={() => answer('master')}
          >
            <Text style={styles.btnRoundText}>认识</Text>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          {/* 已作答：左边固定是「↩ 撤销」。
              点错认识/不认识的人第一反应就是找这个；放在左槽＝和「不认识」同一个位置，
              手不用挪。撤销只退**这一张**的记录，人停在原地重新选。 */}
          <View hoverClass="press" style={{ ...styles.btn, ...styles.btnGhost }} onClick={revertCurrent}>
            <Text key="undo" style={styles.btnGhostText}>
              ↩ 撤销
            </Text>
          </View>
          <View
            hoverClass="press"
            style={{ ...styles.btn, ...styles.btnPrimary, flex: 1.6 }}
            onClick={advance}
          >
            <Text key="next" style={styles.btnPrimaryText}>
              {index >= total - 1 ? '完成' : '下一个'}
            </Text>
          </View>
        </View>
      )}

      {/* ── 底部一行：左边是刚才那句提示（「已记一档 3/7」这类），
             撤销已经搬到上面单独一行了，这里不再放第二颗撤销胶囊 —— 
             同一个动作两个入口，用户会挑不清楚该点哪个。 */}
      <View style={styles.foot}>
        <View style={styles.footLeft}>
          {note ? (
            <Text style={styles.footNote}>{note}</Text>
          ) : (
            <Text style={styles.footText}>
              {known + marked > 0 ? `认识 ${known} · 不认识 ${marked}` : '左滑跳过 · 右滑回看'}
            </Text>
          )}
        </View>
        <Text style={styles.footText}>{index >= total - 1 ? '最后一个' : `还剩 ${left} 个`}</Text>
      </View>
    </View>
  )
}

/**
 * 例句里把目标词标出来（扇贝那种「同一句里被考的词高亮」）。
 *
 * 只标第一次出现、不分大小写；词形变化（vulnerable / vulnerability）不匹配就整句不标 ——
 * 宁可没有，也不要错标到别的词上。
 * 返回片段数组：小程序里只有 Text 嵌 Text 才有富文本，不能塞 HTML 字符串。
 */
function highlight(sentence: string, word: string) {
  if (!sentence || !word) return sentence
  const i = sentence.toLowerCase().indexOf(word.toLowerCase())
  if (i < 0) return sentence
  return (
    <>
      {sentence.slice(0, i)}
      <Text style={styles.hl}>{sentence.slice(i, i + word.length)}</Text>
      {sentence.slice(i + word.length)}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  /**
   * H5 / iOS 壳专用的卡片根节点：同一块深绿面板，但**不吃负外边距**。
   *
   * 微信里父容器有 36rpx 内边距，负外边距正好抵消，做出「出血」；
   * H5 里父容器本身满宽，负外边距只会把内容顶出屏幕（实测 427 > 视口 390），
   * 右边的「认识」按钮就被切掉几像素。这里在 H5 下把手脚放平（见 wrap 的注释）。
   */
  h5Wrap: {
    flex: 1,
    // 96rpx（不是微信端的 64rpx）：H5 里「翻书」胶囊和「1/34」都在顶部，
    // 64rpx 时两者会叠在一起（实测胶囊 84–114px，计数行 104–128px）
    paddingTop: '96rpx',
    backgroundColor: COLOR.teal,
    display: 'flex',
    flexDirection: 'column'
  },
  /** H5 版卡片：去掉 -36rpx 出血，宽度跟着父容器走 */
  h5Card: {
    position: 'relative',
    overflow: 'hidden',
    flex: 1,
    minHeight: '540rpx',
    paddingLeft: '44rpx',
    paddingRight: '44rpx',
    paddingTop: '32rpx',
    paddingBottom: '28rpx',
    borderRadius: '0rpx',
    backgroundColor: COLOR.teal,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24rpx 56rpx rgba(9, 28, 25, 0.26), 0 4rpx 10rpx rgba(9, 28, 25, 0.10)',
    willChange: 'transform, opacity'
  },
  wrap: {
    flex: 1,
    // 顶到屏幕左右边，整块是深绿面板：和首页同一块底
    // ⚠️ H5 里父容器就是满宽，负外边距会把整块顶出屏幕（宽 427 > 视口 390），
    // 右边缘的「认识」按钮被切 4px —— 所以在 H5 下改用 h5Wrap（见下）
    marginLeft: '-36rpx',
    marginRight: '-36rpx',
    paddingLeft: '36rpx',
    paddingRight: '36rpx',
    paddingTop: '64rpx',
    backgroundColor: COLOR.teal,
    display: 'flex',
    flexDirection: 'column'
  },

  // ---------- 顶部 ----------
  topRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between'
  },
  counter: {
    fontSize: '34rpx',
    lineHeight: '40rpx',
    fontWeight: '800',
    letterSpacing: '-1rpx',
    color: COLOR.marigold
  },
  counterUnit: {
    fontSize: FONT.pageNo,
    color: 'rgba(251, 247, 236, 0.5)'
  },
  goalBox: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline'
  },
  goalText: {
    fontSize: FONT.pageNo,
    color: 'rgba(251, 247, 236, 0.5)'
  },
  goalNum: {
    fontSize: '26rpx',
    fontWeight: '700',
    color: COLOR.onDark
  },
  goalDone: {
    marginLeft: '12rpx',
    fontSize: FONT.pageNo,
    fontWeight: '600',
    color: COLOR.marigold
  },
  track: {
    marginTop: '14rpx',
    height: '4rpx',
    borderRadius: '2rpx',
    backgroundColor: COLOR.track
  },
  trackFill: {
    height: '4rpx',
    borderRadius: '2rpx',
    backgroundImage: `linear-gradient(90deg, ${COLOR.progressWarmFrom} 0%, ${COLOR.progressWarmTo} 100%)`
  },

  // ---------- 卡片 ----------
  cardArea: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    // 进入背词页时，整张卡从下方抬起、回正
    animation: 'cardEnter 720ms cubic-bezier(.22,1,.36,1) backwards'
  },
  card: {
    position: 'relative',
    overflow: 'hidden',
    // 卡片吃掉中间剩余的所有高度（flex:1），上下留白由 cardArea 的 padding 控制 ——
    // 这样大屏上卡片是「一大块画布」，不是浮在中间的一张小纸片
    flex: 1,
    minHeight: '540rpx',
    // 通栏：卡片顶到屏幕左右边，直角。和学习页一样是「一块印刷面」，不是浮起的圆角卡
    marginLeft: '-36rpx',
    marginRight: '-36rpx',
    paddingLeft: '44rpx',
    paddingRight: '44rpx',
    paddingTop: '32rpx',
    paddingBottom: '28rpx',
    borderRadius: '0rpx',
    backgroundColor: COLOR.teal,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24rpx 56rpx rgba(9, 28, 25, 0.26), 0 4rpx 10rpx rgba(9, 28, 25, 0.10)',
    willChange: 'transform, opacity'
  },
  // 没翻面：这一块吃掉卡片剩下的高度，把「词 + 音标 + 提示」作为一个整体居中
  centerBlock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingBottom: '36rpx'
  },
  // 翻面后：词在上半区**自己垂直居中**（卡片底部已经用 paddingBottom 给 sheet 留了位置），
  // 这样卡片无论多高，词都落在「sheet 上方那块空间」的正中，不会顶在卡片最上面
  topBlock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  },
  // 点按钮飘出来的小 emoji：在卡片中间偏上，向上浮出画面
  // 判定印章：斜着砸下来、停一拍、再淡出
  burst: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    marginLeft: '-112rpx',
    width: '224rpx',
    paddingTop: '12rpx',
    paddingBottom: '12rpx',
    textAlign: 'center',
    borderRadius: '8rpx',
    borderWidth: '6rpx',
    borderStyle: 'solid',
    borderColor: COLOR.marigold,
    // 内圈再描一道细线，像真的木头章压出来的双线
    boxShadow: 'inset 0 0 0 3rpx rgba(240, 178, 63, 0.7), 0 6rpx 18rpx rgba(0,0,0,0.18)',
    backgroundColor: 'rgba(240, 178, 63, 0.07)',
    transform: 'rotate(-11deg)',
    fontFamily: FONT_STACK.cn,
    fontSize: '40rpx',
    lineHeight: '52rpx',
    fontWeight: '700',
    letterSpacing: '6rpx',
    color: COLOR.marigold,
    animation: 'stampSlam 900ms cubic-bezier(.22,1,.36,1) both',
    pointerEvents: 'none',
    zIndex: 20
  },
  // 章落下的那一圈冲击波
  stampRing: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    marginLeft: '-112rpx',
    width: '224rpx',
    height: '224rpx',
    borderRadius: '112rpx',
    borderWidth: '2rpx',
    borderStyle: 'solid',
    borderColor: 'rgba(240, 178, 63, 0.55)',
    animation: 'ringBurst 760ms ease-out both',
    pointerEvents: 'none',
    zIndex: 19
  },
  // ---------- 释义 sheet（iOS 那种从底部浮上来的玻璃面板）----------
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '320rpx',
    paddingLeft: '40rpx',
    paddingRight: '40rpx',
    paddingTop: '16rpx',
    paddingBottom: '32rpx',
    // 不对称的弧：左上一个大圆角，右上直角 —— 面板像一张掀起来的纸
    borderTopLeftRadius: '130rpx',
    borderTopRightRadius: '0rpx',
    backgroundColor: '#FBF7EC',
    borderTop: 'none',
    boxShadow: '0 -14rpx 40rpx rgba(78, 60, 34, 0.10)',
    display: 'flex',
    flexDirection: 'column',
    // 演出交给行内 animation 决定（认识 sheetSpringYes / 不认识 sheetBounceNo / 偷看时 sheetUp）
    animation: 'sheetUp 320ms cubic-bezier(.22,.61,.36,1) both',
    zIndex: 5
  },
  // 顶部那条「把手」：iOS sheet 的标志物，72×8rpx
  sheetHandle: {
    alignSelf: 'center',
    width: '72rpx',
    height: '8rpx',
    borderRadius: '4rpx',
    backgroundColor: 'rgba(60, 40, 30, 0.16)'
  },
  // 判定回执：22rpx 暖色小字，紧跟把手 —— 只回答一个问题「刚才那一下记成什么了」
  verdictLine: {
    marginTop: '14rpx',
    fontSize: '22rpx',
    lineHeight: '30rpx',
    fontWeight: '600',
    color: COLOR.warm,
    animation: 'verdictPop 260ms cubic-bezier(.34,1.56,.64,1) both'
  },
  // 内容超出就自己滚（长释义 / 长例句不会把 sheet 撑破）
  sheetBody: {
    flex: 1,
    marginTop: '16rpx'
  },

  // ---------- 分段进度 ----------
  segRow: {
    marginTop: '16rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  seg: {
    flex: 1,
    height: '6rpx',
    borderRadius: '0rpx',
    backgroundColor: COLOR.track,
    transition: 'background-color 220ms ease'
  },
  segOn: {
    backgroundColor: COLOR.warm,
    backgroundImage: 'none'
  },
  segCurrent: {
    boxShadow: 'none'
  },
  // 卡面背后的大字母：只做版面重量，填掉中间那片空
  ghostLetter: {
    position: 'absolute',
    right: '-30rpx',
    top: '-60rpx',
    fontFamily: FONT_STACK.serif,
    fontSize: '520rpx',
    lineHeight: '520rpx',
    color: 'rgba(251, 247, 236, 0.05)',
    pointerEvents: 'none'
  },
  chipRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  chip: {
    height: '44rpx',
    paddingLeft: '20rpx',
    paddingRight: '20rpx',
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(240, 96, 58, 0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  markTag: {
    fontSize: '20rpx',
    color: 'rgba(251, 247, 236, 0.5)'
  },
  markFull: {
    fontSize: '20rpx',
    fontWeight: '600',
    color: '#F58B6A'
  },
  footNote: {
    flexShrink: 0,
    marginRight: '16rpx',
    fontSize: '20rpx',
    fontWeight: '600',
    color: COLOR.marigold
  },
  chipText: {
    fontSize: '20rpx',
    lineHeight: '40rpx',
    letterSpacing: '1rpx',
    color: '#F58B6A'
  },

  word: {
    marginTop: '34rpx',
    fontFamily: FONT_STACK.serif,
    fontSize: '104rpx',
    lineHeight: '120rpx',
    fontWeight: '400',
    letterSpacing: '-3rpx',
    color: '#FBF7EC'
  },
  // 逐字母排：换行时整体往左靠
  wordRow: {
    marginTop: '34rpx',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline'
  },
  wordChar: {
    fontFamily: FONT_STACK.serif,
    fontSize: '104rpx',
    lineHeight: '118rpx',
    fontWeight: '400',
    letterSpacing: '-2rpx',
    color: '#FBF7EC',
    animation: 'charIn 520ms cubic-bezier(.22,1,.36,1) backwards'
  },
  wordDone: {
    color: 'rgba(251, 247, 236, 0.42)'
  },
  metaRow: {
    marginTop: '10rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  meta: {
    fontSize: '24rpx',
    lineHeight: '34rpx',
    letterSpacing: '1rpx',
    color: 'rgba(251, 247, 236, 0.58)'
  },
  speak: {
    marginLeft: '8rpx'
  },
  divider: {
    marginTop: '30rpx',
    height: '1rpx',
    backgroundColor: COLOR.track
  },
  // 未翻面：一句轻提示，贴在音标下面（词整体居中，提示跟着走）
  hint: {
    marginTop: '30rpx',
    fontSize: FONT.pageNo,
    letterSpacing: '1rpx',
    color: 'rgba(251, 247, 236, 0.38)'
  },

  // 翻面：释义 + 例句，从下往上浮出来
  answer: {
    marginTop: '28rpx',
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeUp 320ms cubic-bezier(.22,.61,.36,1) both'
  },
  definition: {
    fontSize: '34rpx',
    lineHeight: '52rpx',
    color: COLOR.text
  },
  example: {
    marginTop: '24rpx',
    paddingTop: '22rpx',
    borderTop: `1px solid ${COLOR.track}`,
    display: 'flex',
    flexDirection: 'column'
  },
  exampleEn: {
    fontSize: '26rpx',
    lineHeight: '40rpx',
    color: COLOR.body
  },
  exampleZh: {
    marginTop: '8rpx',
    fontSize: '24rpx',
    lineHeight: '34rpx',
    color: COLOR.secondary
  },
  hl: {
    color: COLOR.warm,
    fontWeight: '600'
  },

  // ---------- 动作 ----------
  actions: {
    marginTop: '14rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  btn: {
    flex: 1,
    height: '128rpx',
    borderRadius: '0rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // 主操作：一颗「印章」形的异形钮 —— 三个角圆、左下角收成尖，
  // 再轻微斜一点，像盖在纸上的一枚章。它比旁边的纸带大一头，视线自然先落上去。
  btnRound: {
    width: '196rpx',
    height: '196rpx',
    marginLeft: '18rpx',
    borderRadius: '98rpx 98rpx 98rpx 14rpx',
    backgroundColor: COLOR.warm,
    transform: 'rotate(-5deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 16rpx 34rpx rgba(210, 65, 29, 0.36), 0 3rpx 8rpx rgba(210, 65, 29, 0.22)'
  },
  btnRoundText: {
    fontSize: '32rpx',
    lineHeight: '38rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: '#FFFFFF',
    animation: 'labelIn 140ms ease both'
  },
  btnGhost: {
    marginRight: '12rpx',
    borderRadius: '0rpx',
    backgroundColor: 'rgba(253, 250, 243, 0.9)',
    boxShadow: 'inset 0 0 0 2rpx rgba(23, 21, 15, 0.08)'
  },
  btnGhostText: {
    fontSize: '30rpx',
    letterSpacing: '1rpx',
    color: COLOR.body,
    animation: 'labelIn 140ms ease both'
  },
  btnPrimary: {
    backgroundColor: COLOR.black,
    borderRadius: '32rpx 32rpx 32rpx 10rpx',
    boxShadow: SHADOW.float
  },
  btnPrimaryText: {
    fontSize: '30rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: COLOR.onDark,
    animation: 'labelIn 140ms ease both'
  },

  foot: {
    marginTop: '16rpx',
    /* 高度常驻：撤销胶囊进出不改变这一行的高度，卡片就不会被顶得上下跳 */
    minHeight: '56rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  footLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  // ---------- 返回上一词（卡片与两个大按钮之间那一行）----------
  // 高度常驻：胶囊有时无时都不改变布局，卡片不会跳
  undoRow: {
    marginTop: '18rpx',
    marginBottom: '14rpx',
    minHeight: '64rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  undoBtn: {
    height: '60rpx',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    // 只包住文字：不写死宽度，Taro 的 View 默认会把整行撑满（那就成横幅不是胶囊了）
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'center',
    borderRadius: '6rpx',
    borderWidth: '1rpx',
    borderStyle: 'solid',
    borderColor: COLOR.warmLine,
    backgroundColor: COLOR.accentSoft,
    // inline-flex：让胶囊按文字宽度收住。用 flex 的话 view 是块级、会被撑成横幅
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'labelIn 160ms ease both'
  },
  undoBtnText: {
    fontSize: '24rpx',
    lineHeight: '30rpx',
    fontWeight: '600',
    color: COLOR.warm
  },
  footText: {
    fontSize: '20rpx',
    color: 'rgba(251, 247, 236, 0.45)'
  },

  // ---------- 完成面板 ----------
  doneArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingTop: '28rpx',
    paddingBottom: '28rpx'
  },
  // 暖白卡片：和词卡同一个底、同一条描边，像同一张纸翻到了背面
  doneCard: {
    borderRadius: RADIUS.card,
    backgroundColor: COLOR.warm,
    boxShadow: '0 30rpx 60rpx rgba(160, 50, 20, 0.26)',
    paddingLeft: '44rpx',
    paddingRight: '44rpx',
    paddingTop: '52rpx',
    paddingBottom: '44rpx',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    animation: 'popIn 420ms cubic-bezier(.22,1.2,.36,1) both'
  },
  doneEmoji: {
    fontFamily: FONT_STACK.serif,
    fontSize: '76rpx',
    lineHeight: '88rpx',
    color: 'rgba(255, 249, 240, 0.9)',
    animation: 'floatY 3.2s ease-in-out infinite'
  },
  doneTitle: {
    marginTop: '12rpx',
    fontSize: '42rpx',
    lineHeight: '56rpx',
    fontWeight: '700',
    letterSpacing: '1rpx',
    color: '#FFF9F0',
    textAlign: 'center'
  },
  doneStat: {
    marginTop: '18rpx',
    fontSize: '26rpx',
    lineHeight: '36rpx',
    color: 'rgba(255, 249, 240, 0.86)'
  },
  doneGoal: {
    marginTop: '6rpx',
    fontSize: '22rpx',
    lineHeight: '32rpx',
    color: 'rgba(255, 249, 240, 0.66)'
  },
  doneAsk: {
    marginTop: '30rpx',
    fontSize: '26rpx',
    lineHeight: '38rpx',
    color: 'rgba(255, 249, 240, 0.74)',
    textAlign: 'center'
  },
  doneBtn: {
    marginTop: '20rpx',
    alignSelf: 'stretch',
    height: '100rpx',
    borderRadius: RADIUS.pill,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  doneBtnPrimary: {
    backgroundColor: '#1B1814',
    boxShadow: '0 10rpx 24rpx rgba(90, 26, 10, 0.28)'
  },
  doneBtnPrimaryText: {
    fontSize: '30rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: '#FFF9F0'
  },
  doneBtnGhost: {
    backgroundColor: 'rgba(255, 249, 240, 0.16)'
  },
  // 只有一颗按钮时（词背完了没得再背）它就是主按钮，不再留描边的次要感
  doneBtnGhostSolo: {
    marginTop: '28rpx'
  },
  doneBtnGhostText: {
    fontSize: '28rpx',
    color: '#FFF9F0'
  }
}
