import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter, useUnload } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { MarkCircle } from '../../components/mark-circle'
import { NavBar, goBack } from '../../components/nav-bar'
import { SegBar } from '../../components/seg-bar'
import { SpeakBtn } from '../../components/speak-btn'
import { exampleOf, exampleSourceLabel } from '../../data/words'
import { stopSpeak } from '../../services/tts'
import {
  getProgress,
  getReviewBatch,
  pickReviewBatch,
  PoolWord,
  relativeDay,
  restoreWord,
  reviewForgot,
  reviewIntervalDays,
  reviewKnown,
  scheduleOf,
  snapshotWord,
  WordSnapshot
} from '../../store/storage'
import { COLOR, FONT, FONT_STACK, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx, windowHeightPx } from '../../utils/metrics'

/**
 * 卡片式复习页：**一屏一个词**，生词本的子页（也是数据页「今天该复习 N 个」的落点）。
 *
 * ## 两个动作，语义在 2026-10 被拆开了
 *
 * | 按钮 | 发生什么 | 下次什么时候见 |
 * | --- | --- | --- |
 * | **还不认识** | `reviewForgot()`：**等级 +1**（封顶 7 级） | 等级越高见越勤 |
 * | **认识** | `reviewKnown()`：**等级 −1**；降到 0 级才掌握、进「熟练掌握词汇」 | 等级越低越先考 |
 * | 跳过 | 不判、不记 | 下次照旧 |
 *
 * ⚠️ 「还不认识」以前是 `incrementMark()`（标记 +1）。那在间隔重复里是**反的**：
 * 想不起来的时候间隔反而变长（1→2→4→7…），越不熟的词越见不到。
 * 现在记不住就回到 1 档、明天再见 —— 这是这一版复习算法唯一的行为变化，
 * 也是它从「随手点点的卡片」变成「能记住东西的复习」的关键一处。
 *
 * ## 这一批从哪来
 *
 * `pickReviewBatch()`：**先按间隔重复的到期日排（越逾期越靠前），
 * 没到期的沿用老规矩（最近标记过的优先）**。`?size=` 由生词本或数据页传进来，
 * 从数据页的「今天该复习 N 个」进来时，size 正好等于今天的到期数。
 *
 * ## 撤销
 *
 * 两个动作都不可逆，而它们只差 24rpx。所以每次判断前 `snapshotWord()` 拍一张快照，
 * 底部有「上一步」可以退回去（大厂的自评式复习页都有这个）。
 *
 * 版式：没有 Tab 栏（它是生词本的子页），底部按钮用 STYLE.bottomBar + bottomSafePx()，
 * 内容留出 actionBarHeightPx() 的内边距。
 */

/** 「还不认识」那颗圆圈的处理函数：点击交给外层药丸（见下面 markup 的注释） */
const noop = () => {}

/**
 * 底部按钮块的高度：16rpx 上距 + 96rpx 药丸 + 16rpx + 48rpx（上一步 / 跳过）+ 底部安全区。
 * **这个常量必须跟真实的 bar 高度一致**，否则滚到底时最后一段内容会被压在 bar 底下。
 */
function actionBarHeightPx(): number {
  return rpxToPx(176) + bottomSafePx()
}

/**
 * 复习卡片能用的高度：窗口高度扣掉导航栏、底部按钮条和上下那点间距。
 * 字太小（比如键盘弹起后的窗口）时兜一个 240rpx，免得卡片被压成一条缝。
 *
 * ⚠️ WXSS 默认是 content-box，所以这个值算的是「内容盒」——外面的
 * paddingTop / paddingBottom 是另外加的，页面里的写法要对上（见下面的用法）。
 */
function cardAreaHeightPx(navH: number): number {
  const h = windowHeightPx() - actionBarHeightPx() - navH - topGapPx() - rpxToPx(24)
  return Math.max(h, rpxToPx(240))
}

/** 按 size 取这一批：0 = 全部。**到期优先**（见 storage.pickReviewBatch） */
function loadBatch(size: number): PoolWord[] {
  return pickReviewBatch(size)
}

/** 这次复习的「为什么现在见它」：逾期 / 今天到期 / 还没到期（后面两种情况都会出现） */
function dueText(w: PoolWord): string {
  const sch = scheduleOf(w)
  if (sch.daysLeft < 0) return `逾期 ${-sch.daysLeft} 天`
  if (sch.daysLeft === 0) return '今天到期'
  return `${sch.daysLeft} 天后到期`
}

/**
 * 一张卡的判定结果。
 * `kind` 决定界面（已作答=只读），`level` 是**判完之后**的等级，
 * `mastered` 表示这一下把词从 7 级磨到了 0 级（进「熟练掌握词汇」）。
 */
type Step = { kind: 'pass' | 'mark'; level: number; mastered: boolean }

export default function ReviewScreen() {
  const { params } = useRouter()
  const size = Math.max(Number(params.size ?? getReviewBatch()) || 0, 0)

  // 这一批是**进页面时算好的快照**：复习过程中词会离开生词本（点「我会了」），
  // 但这一屏不该跟着变，不然用户眼前的词会凭空少掉、进度也会乱。
  const [list] = useState<PoolWord[]>(() => loadBatch(size))
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  /**
   * 这一批里**每一张卡各自的判定**：index → 'pass' | 'mark'（没有就是还没判）。
   *
   * 2026-11 用户要求全站统一成「先判 → 看答案 → 再翻下一个」：
   * 点「我会了 / 还不认识」**当场记录并展开释义**，按钮变成「下一个」。
   *
   * ⚠️ 老写法是一个全局 `judged`：按「上一步」回到上一个词时，这个值还停在 null，
   * 于是那个**已经判过、也记过账**的词又长出一副「还不认识 / 我会了」的按钮，
   * 用户一点就再记一遍（和背单词卡片里那个 bug 是同一类）。现在按 index 记账：
   * 回到哪个词、看到的就是那个词自己的状态，判过就是判过。
   *
   * ref 是同步镜像：同一个 tick 里连点两下时 state 还没提交，
   * 两下都会过「判过没有」的检查 → 一次误触记两次。守卫一律读 ref。
   */
  const [verdicts, setVerdicts] = useState<Record<number, Step>>({})
  const verdictsRef = useRef<Record<number, Step>>({})
  const judged = verdicts[index] ?? null
  /**
   * 点「我会了 / 还不认识」时整张卡抖一下（2026-10-22，和背单词卡片同一套 keyframes）：
   * 认识 = 点头，不认识 = 摇头；抖完释义才展开。
   */
  const [nudge, setNudge] = useState<'' | 'yes' | 'no'>('')
  const nudgeCard = (k: 'yes' | 'no') => {
    setNudge(k)
    setTimeout(() => setNudge(''), 340)
  }
  /** 点按钮时飘出来的小 emoji（和卡片版一致：认识 ✨ / 不认识 📌） */
  const [burst, setBurst] = useState<{ id: number; emoji: string } | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>(() => getProgress())
  const [result, setResult] = useState({ pass: 0, mark: 0, skip: 0, undo: 0, mastered: 0 })
  /**
   * 每一步判断前的快照（栈），「上一步」从这里弹。
   * 同时记住这一步是哪种判断，撤销时才能把结算页的计数一起退回去（否则数字会对不上）。
   */
  const [history, setHistory] = useState<{ snap: WordSnapshot; grade: 'pass' | 'mark'; mastered: boolean }[]>([])

  const finished = index >= list.length
  const current: PoolWord | null = finished ? null : list[index]

  /** 同步写一张卡的判定（ref 先写、state 后写）；null = 退回未作答 */
  const writeVerdict = (i: number, v: Step | null) => {
    const next = { ...verdictsRef.current }
    if (v === null) delete next[i]
    else next[i] = v
    verdictsRef.current = next
    setVerdicts(next)
  }

  // 离开这一页停掉发音
  useUnload(() => stopSpeak())

  const goNext = () => {
    setRevealed(false)
    // 判定不用清：每一张卡各留各的（按 index 记账），回到哪个词就看到哪个词的状态
    setIndex((i) => i + 1)
  }

  /**
   * 「还不认识」：**等级 +1**（封顶 7 级）+ 记一笔复习。
   *
   * 记完之后**停在原地**：释义当场摊开（`setRevealed(true)`），
   * 按钮换成「下一个」—— 用户要看到自己刚判的是什么词、下次什么时候再见，
   * 而不是屏幕上刷地换成了下一个词。
   */
  const handleForgot = () => {
    // 守卫读 ref（同步）：一个词不可能被判两次，连点也只算一下
    if (!current || verdictsRef.current[index]) return
    nudgeCard('no')
    setBurst({ id: Date.now(), emoji: '+1' })
    setTimeout(() => setBurst(null), 720)
    const snap = snapshotWord(current.word)
    // 不认识 = 等级 +1（封顶 7）。reviewForgot 里已经记了复习日志和今日进度
    const out = reviewForgot(current.word)
    writeVerdict(index, { kind: 'mark', level: out.level, mastered: false })
    setHistory((h) => [...h, { snap, grade: 'mark', mastered: false }])
    setProgress(getProgress())
    setResult((r) => ({ ...r, mark: r.mark + 1 }))
    setRevealed(true)
  }

  /**
   * 「认识」= **等级 −1**（不是直接掌握）。
   *
   * 这是 2026-11 用户定的新规矩：一个词从 7 级磨到 0 级要连续答对 7 次，
   * 只有落到 0 级才算真正掌握、进「熟练掌握词汇」并被移出生词本。
   * 一次答对就毕业会让「掌握」这个词变得很廉价，复习也就白做了。
   */
  const handleMaster = () => {
    if (!current || verdictsRef.current[index]) return
    nudgeCard('yes')
    setBurst({ id: Date.now(), emoji: '✓' })
    setTimeout(() => setBurst(null), 720)
    const snap = snapshotWord(current.word)
    const out = reviewKnown(current.word)
    if (out.mastered) {
      setBurst({ id: Date.now(), emoji: '§' })
    }
    writeVerdict(index, { kind: 'pass', level: out.level, mastered: out.mastered })
    setHistory((h) => [...h, { snap, grade: 'pass', mastered: out.mastered }])
    setProgress(getProgress())
    setResult((r) => ({
      ...r,
      pass: r.pass + 1,
      mastered: r.mastered + (out.mastered ? 1 : 0)
    }))
    setRevealed(true)
  }

  /** 「跳过」：不判也不记，复习记录里不会出现它（所以也不需要撤销） */
  const handleSkip = () => {
    if (!current) return
    setResult((r) => ({ ...r, skip: r.skip + 1 }))
    goNext()
  }

  /**
   * 「上一步」：把上一个词的状态放回去，并退回到它。
   * 结算页上也能用 —— 最后那个词点错的概率并不低，而那时底部的动作条已经收起来了，
   * 所以结算卡里单独留了一颗「上一步」。
   */
  const handleUndo = () => {
    if (!history.length) return
    const last = history[history.length - 1]
    restoreWord(last.snap)
    setHistory((h) => h.slice(0, -1))
    setProgress(getProgress())
    setResult((r) => ({
      ...r,
      undo: r.undo + 1,
      pass: last.grade === 'pass' ? Math.max(r.pass - 1, 0) : r.pass,
      mark: last.grade === 'mark' ? Math.max(r.mark - 1, 0) : r.mark,
      mastered: last.mastered ? Math.max(r.mastered - 1, 0) : r.mastered
    }))
    // 要退回去的那个词：数据已经退回去了，它自己的判定也要一起清，
    // 否则回到它的时候按钮还是「下一个」——那等于「撤销点了没反应」。
    const target = Math.max(index - 1, 0)
    writeVerdict(target, null)
    setRevealed(false)
    setIndex(target)
  }

  /**
   * 「撤销这一步」：**只退当前这个词的判断**，人停在原地重新看。
   *
   * 和 handleUndo 的区别：那个是「退到上一个词」（未作答时用，以及结算页用），
   * 这个是「我这一下点错了，把这一步撤了」—— 两个动作都在底部，
   * 但它们解决的焦虑不一样，所以分成两个函数，不去赌用户想的是哪个。
   */
  const undoCurrent = () => {
    if (!history.length) return
    const last = history[history.length - 1]
    restoreWord(last.snap)
    setHistory((h) => h.slice(0, -1))
    setProgress(getProgress())
    setResult((r) => ({
      ...r,
      undo: r.undo + 1,
      pass: last.grade === 'pass' ? Math.max(r.pass - 1, 0) : r.pass,
      mark: last.grade === 'mark' ? Math.max(r.mark - 1, 0) : r.mark,
      mastered: last.mastered ? Math.max(r.mastered - 1, 0) : r.mastered
    }))
    // 只退当前这个词的判断，人停在原地重新看（数据回滚在 restoreWord 里做完了）
    writeVerdict(index, null)
    setRevealed(false)
  }

  const handleBackToVocab = () => {
    stopSpeak()
    goBack()
  }

  const handleOpenLog = () => {
    stopSpeak()
    // redirectTo：把这页换掉，从「复习记录」返回时回到的是生词本，而不是结算页
    Taro.redirectTo({ url: '/pages/review-log/index' })
  }

  const navH = navBarHeightPx()
  const navTitle = finished ? '复习完成' : `复习 · ${index + 1}/${list.length}`
  const markCount = current ? progress[current.word] ?? current.markCount : 0
  /** 例句（R9）：和翻书页同一个来源（`exampleOf`），没有就不占位 */
  const example = current ? exampleOf(current.word) : null
  /** 这个词当前的记忆间隔（下次再见是几天后）—— 判完就给用户一个明确的「下次」 */
  const nextInterval = current ? reviewIntervalDays(current.markCount) : 0

  return (
    <View style={STYLE.container}>
      <PageCurtain label="复习" kicker="REVIEW" />
      {list.length === 0 ? (
        <View style={{ ...STYLE.empty, paddingBottom: `${bottomSafePx()}px` }}>
          <Text style={STYLE.emptyText}>
            生词本里还没有词。先去翻书页标记几个不会的词，再回来复习。
          </Text>
        </View>
      ) : finished ? (
        // ---------- 结算 ----------
        <ScrollView scrollY style={STYLE.list}>
          <View style={{ paddingTop: `${navH + topGapPx() + rpxToPx(24)}px`, paddingBottom: `${bottomSafePx() + rpxToPx(24)}px` }}>
            <View className="glass glass-card" style={styles.card}>
              <Text style={styles.doneTitle}>这一批复习完了</Text>
              <Text style={styles.doneMeta}>本批一共 {list.length} 个词</Text>

              <Text style={styles.doneLine}>
                认识 {result.pass} 个 —— 等级 −1（累计掌握 {result.mastered} 个）
              </Text>
              <Text style={styles.doneLine}>
                还不认识 {result.mark} 个 —— 等级 +1（封顶 7 级）
              </Text>
              <Text style={styles.doneLine}>跳过 {result.skip} 个</Text>
              {result.undo > 0 ? <Text style={styles.doneLine}>撤销 {result.undo} 次</Text> : null}

              <View {...PRESS} style={styles.donePrimary} onClick={handleBackToVocab}>
                <Text style={styles.donePrimaryText}>返回生词本</Text>
              </View>
              <View
                {...PRESS}
                className="glass glass-pill"
                style={styles.doneSecondary}
                onClick={handleOpenLog}
              >
                <Text style={styles.doneSecondaryText}>看复习记录</Text>
              </View>

              {/* 结算页的后悔药：最后一个词点错了也能退回去（底部动作条此时已经收起） */}
              {history.length > 0 ? (
                <View {...PRESS} style={styles.doneUndo} onClick={handleUndo}>
                  <Text style={styles.doneUndoText}>上一步（撤销「{history[history.length - 1].snap.word}」）</Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      ) : (
        // ---------- 一张卡片一个词 ----------
        <ScrollView scrollY style={STYLE.list}>
          <View
            style={{
              // 卡片在「导航栏下沿 → 底部按钮上沿」这块地方里**垂直居中**：
              // minHeight 先扣掉上下两条悬浮件（再减 padding 自己垫出来的那两块），
              // 剩下的空间交给 justifyContent 居中。释义长的时候这块会撑高、变成可滚，
              // paddingTop 保证滚上去的内容不会被玻璃导航栏糊住看不见。
              minHeight: `${cardAreaHeightPx(navH)}px`,
              paddingTop: `${navH + topGapPx()}px`,
              paddingBottom: `${actionBarHeightPx() + rpxToPx(24)}px`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            {/* 整张卡片可点：点一下才把释义露出来（先考你） */}
            <View
              className="glass glass-card"
              style={{
                ...styles.card,
                animation:
                  nudge === 'yes'
                    ? 'cardNudgeYes 280ms cubic-bezier(.22,.61,.36,1)'
                    : nudge === 'no'
                      ? 'cardNudgeNo 300ms cubic-bezier(.22,.61,.36,1)'
                      : undefined
              }}
              onClick={() => setRevealed(true)}
            >
              {burst ? (
                <Text key={burst.id} style={styles.burst}>
                  {burst.emoji}
                </Text>
              ) : null}
              {/* 分段进度：和首页 / 卡片版同一条语汇 */}
              <SegBar value={index + 1} total={list.length} style={styles.segRow} />
              <Text style={styles.counter}>
                第 {index + 1} / {list.length} 个 · {dueText(current as PoolWord)}
              </Text>
              <View style={styles.wordRow}>
                <Text className="text-break" style={styles.word}>
                  {current?.word}
                </Text>
                <SpeakBtn word={current?.word || ''} />
              </View>

              {revealed ? (
                <>
                  {[current?.phonetic, current?.pos].filter(Boolean).join('  ') ? (
                    <Text style={styles.meta}>
                      {[current?.phonetic, current?.pos].filter(Boolean).join('  ')}
                    </Text>
                  ) : null}
                  <Text className="text-break" style={styles.definition}>
                    {current?.definition}
                  </Text>
                  {/* 例句（R9）：释义下方，比释义小一号（24rpx vs 28rpx）。
                      和翻书页同一份数据、同一个来源标注规则：AI 生成的一律标出来。
                      放在「记忆状态」上面 —— 先看词怎么用，再看它下次什么时候见。 */}
                  {example ? (
                    <View style={styles.example}>
                      <Text className="text-break" style={styles.exampleEn}>
                        {example.en}
                      </Text>
                      <Text className="text-break" style={styles.exampleZh}>
                        {example.zh}
                      </Text>
                      <Text style={styles.exampleFrom}>{exampleSourceLabel(example)}</Text>
                    </View>
                  ) : null}
                  {/* 记忆状态：告诉用户「它现在处在哪一档、下次什么时候见」——
                      没有这行，复习就是「点按钮」，有了它才像在管理记忆。
                      判定之后这句话要说的是**这一下判完的结果**，不再报「间隔 1 天」
                      （判成「我会了」的词不再安排复习，还写「间隔 1 天」是自相矛盾的）。 */}
                  <Text style={styles.schedule}>
                    {judged?.mastered
                      ? '等级归零 · 已掌握，不再安排复习'
                      : judged?.kind === 'pass'
                        ? `等级 ${judged.level + 1} → ${judged.level} · 还差 ${judged.level} 次答对就掌握`
                        : judged?.kind === 'mark'
                          ? `等级升到 ${judged.level}/7 · 明天再来看看`
                        : `${
                            (current?.reviewTimes || 0) > 0
                              ? `复习过 ${current?.reviewTimes} 次 · 上次 ${relativeDay(current?.reviewedAt || 0)}`
                              : `标记于 ${relativeDay(current?.markedAt || 0)}`
                          } · 间隔 ${nextInterval} 天`}
                  </Text>
                </>
              ) : (
                <Text style={styles.tapHint}>点卡片看释义</Text>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ---------- 底部动作（只有复习中才有）---------- */}
      {list.length > 0 && !finished ? (
        <View style={{ ...STYLE.bottomBar, ...styles.actions, paddingBottom: `${bottomSafePx()}px` }}>
          {/*
            外层的药丸负责点，「还不认识」那颗圆圈自己**不接事件**（传 noop）。
            原因是微信里点击会往上冒泡：圆圈和外层都挂 onClick 的话，点一下圆圈
            会 +2。让圆圈当装饰、点击落在整颗药丸上，顺带把点击区域做大了。
          */}
          {/* 按钮分两种状态（2026-11 用户定的全站口径：先判 → 看答案 → 再翻下一个）：
              未作答 = 「还不认识 / 我会了」，点完**停在原地**展开释义；
              已作答 = 「撤销这一步 / 下一个」，下一个才真的换词。 */}
          {judged === null ? (
            <>
              <View style={styles.actionRow}>
                <View {...PRESS} className="glass glass-pill" style={styles.markBtn} onClick={handleForgot}>
                  <MarkCircle markCount={markCount} onIncrement={noop} onDecrement={noop} />
                  <Text style={styles.markBtnText}>还不认识</Text>
                </View>
                <View {...PRESS} style={styles.passBtn} onClick={handleMaster}>
                  <Text style={styles.passBtnText}>我会了</Text>
                </View>
              </View>

              {/* 两个次要操作一行：左边撤销（有历史才出现），右边跳过。
                  两处都补到 88rpx 热区 —— 之前「跳过」只有 50rpx 高，是全站最小的可点区域之一 */}
              <View style={styles.subRow}>
                {history.length > 0 ? (
                  <View {...PRESS} style={styles.subLink} onClick={handleUndo}>
                    <Text style={styles.subLinkText}>上一步</Text>
                  </View>
                ) : (
                  <View style={styles.subLink} />
                )}
                <View {...PRESS} style={styles.subLink} onClick={handleSkip}>
                  <Text style={styles.subLinkText}>跳过这个词</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.actionRow}>
                {/* 撤销：把刚才那一下退回去（词还在眼前，不用去找上一个） */}
                <View {...PRESS} className="glass glass-pill" style={styles.markBtn} onClick={undoCurrent}>
                  <Text style={styles.markBtnText}>撤销这一步</Text>
                </View>
                <View {...PRESS} style={styles.passBtn} onClick={goNext}>
                  <Text style={styles.passBtnText}>
                    {index >= list.length - 1 ? '完成' : '下一个'}
                  </Text>
                </View>
              </View>

              {/* 一句回执：这一下判成了什么、下次什么时候见（不弹 Toast） */}
              <View style={styles.subRow}>
                <Text style={styles.judgedHint}>
                  {judged?.mastered
                    ? '降到底了 · 已进「熟练掌握词汇」，以后不再出现'
                    : judged?.kind === 'pass'
                      ? `等级 −1 · 现在 ${judged.level}/7`
                      : `等级 +1 · 现在 ${judged?.level ?? 7}/7`}
                </Text>
              </View>
            </>
          )}
        </View>
      ) : null}

      <NavBar title={navTitle} back />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 卡片：一屏一个词，居中排、上下各 48rpx —— 内容少，留白就是版面
  card: {
    position: 'relative',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingLeft: '40rpx',
    paddingRight: '40rpx',
    paddingTop: '48rpx',
    paddingBottom: '48rpx',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  segRow: {
    alignSelf: 'stretch',
    marginBottom: '28rpx'
  },
  counter: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  // 飘出来的小 emoji：卡片正中偏上
  burst: {
    position: 'absolute',
    top: '38%',
    left: '50%',
    marginLeft: '-60rpx',
    width: '120rpx',
    textAlign: 'center',
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: '40rpx',
    lineHeight: '52rpx',
    color: COLOR.warm,
    animation: 'burstUp 700ms ease-out',
    pointerEvents: 'none',
    zIndex: 20
  },
  // 单词 + 发音按钮
  wordRow: {
    marginTop: '32rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  word: {
    fontFamily: FONT_STACK.serif,
    fontSize: '64rpx',
    lineHeight: '78rpx',
    fontWeight: '400',
    letterSpacing: '-1rpx',
    color: COLOR.text,
    textAlign: 'center'
  },
  meta: {
    marginTop: '24rpx',
    fontSize: FONT.meta,
    lineHeight: '36rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },
  definition: {
    marginTop: '24rpx',
    fontSize: FONT.definition,
    lineHeight: '44rpx',
    color: COLOR.body,
    textAlign: 'center'
  },
  // ---------- 例句（R9）----------
  // 卡片里所有文字都是居中的，例句也居中（和这一页的排版语言一致）
  example: {
    marginTop: '20rpx',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  exampleEn: {
    fontSize: FONT.meta,
    lineHeight: '38rpx',
    color: COLOR.body,
    textAlign: 'center'
  },
  exampleZh: {
    marginTop: '6rpx',
    fontSize: FONT.pageNo,
    lineHeight: '34rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },
  exampleFrom: {
    marginTop: '8rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },
  // 记忆状态：比释义轻，比「点卡片看释义」重
  schedule: {
    marginTop: '32rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },
  tapHint: {
    marginTop: '32rpx',
    fontSize: FONT.meta,
    color: COLOR.secondary
  },

  // ---------- 结算 ----------
  doneTitle: {
    fontSize: FONT.word,
    fontWeight: '700',
    color: COLOR.text
  },
  doneMeta: {
    marginTop: '12rpx',
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  doneLine: {
    marginTop: '24rpx',
    fontSize: FONT.definition,
    lineHeight: '40rpx',
    color: COLOR.body,
    textAlign: 'center'
  },
  donePrimary: {
    alignSelf: 'stretch',
    marginTop: '48rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    borderRadius: '6rpx',
    backgroundColor: COLOR.black
  },
  donePrimaryText: {
    fontSize: FONT.definition,
    color: COLOR.onDark
  },
  doneSecondary: {
    alignSelf: 'stretch',
    marginTop: '24rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    borderRadius: '6rpx'
  },
  doneSecondaryText: {
    fontSize: FONT.definition,
    color: COLOR.text
  },
  // 结算页的「上一步」：纯文字链接，但热区 88rpx
  doneUndo: {
    alignSelf: 'stretch',
    marginTop: '16rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    marginBottom: '-16rpx'
  },
  doneUndoText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },

  // ---------- 底部动作条（定位来自 STYLE.bottomBar）----------
  actions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '16rpx',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD
  },
  actionRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch'
  },
  // 「还不认识」：玻璃胶囊 + 里面一颗标记圆圈（圆圈显示当前标记次数）
  markBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '20rpx',
    paddingBottom: '20rpx',
    borderRadius: '6rpx'
  },
  markBtnText: {
    marginLeft: '16rpx',
    fontSize: FONT.definition,
    color: COLOR.text
  },
  // 「我会了」：黑底胶囊，主操作不玻璃化
  passBtn: {
    flex: 1,
    marginLeft: '24rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '20rpx',
    paddingBottom: '20rpx',
    borderRadius: '6rpx',
    backgroundColor: COLOR.black
  },
  passBtnText: {
    fontSize: FONT.definition,
    color: COLOR.onDark
  },
  // 「上一步 / 跳过」一行：两端对齐，两个都是 88rpx 热区（上下各 32rpx 内边距）
  subRow: {
    marginTop: '4rpx',
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  subLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    paddingLeft: '8rpx',
    paddingRight: '8rpx'
  },
  subLinkText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  /**
   * 判定回执：和 subLink 同一个高度（上下 32rpx 内边距 → 88rpx 热区），
   * 这样底部动作条在两种状态下高度一致，卡片不会因为按钮换行而跳动。
   * 暖色小字只回答一个问题：「这一下判成什么了」。
   */
  judgedHint: {
    flex: 1,
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.warm,
    animation: 'labelIn 180ms ease both'
  }
}
