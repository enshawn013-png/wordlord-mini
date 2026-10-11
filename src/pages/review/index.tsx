import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { MarkCircle } from '../../components/mark-circle'
import { NavBar, goBack } from '../../components/nav-bar'
import {
  getProgress,
  getReviewBatch,
  incrementMark,
  markReviewed,
  masterWord,
  pickReviewBatch,
  PoolWord
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx, windowHeightPx } from '../../utils/metrics'

/**
 * 卡片式复习页：**一屏一个词**，生词本的子页（从生词本工具条的「开始复习 N 个」进来）。
 *
 * 一次只给英文，中文释义藏在卡片后面（点卡片露出来）。两个动作：
 *   「我会了」  → masterWord()：七级标记清零 + 标为掌握 → 这个词离开生词本，
 *                 进「熟练掌握词汇」。
 *   「还不认识」→ 标记次数 +1，留在生词本里（下次复习还会碰上它）。
 * 外加一个「跳过」：**不判、不记**，纯粹往前走（复习记录里不会出现它）。
 *
 * 判过的词当场写进复习记录（storage.markReviewed），所以「复习记录」子页永远是最新的；
 * 半路退出去也不会白复习。整批走完是结算页：我会了 X / 还不认识 Y / 跳过 Z。
 *
 * 「每次复习几个」不在这一页选，是生词本那一页填好了用 `?size=` 传进来的；size=0 表示全部。
 * 具体挑哪几个由 storage.pickReviewBatch() 定：**优先刚在翻书页标记过的词**（用户 2026-10 的要求）。
 *
 * 版式：没有 Tab 栏（它是生词本的子页，不是 Tab 页），所以底部那两个按钮的
 * 定位用的是 STYLE.bottomBar + bottomSafePx()，内容留出 actionBarHeightPx() 的内边距。
 */

/** 「还不认识」那颗圆圈的处理函数：点击交给外层药丸（见下面 markup 的注释） */
const noop = () => {}

/**
 * 底部按钮块的高度：16rpx 上距 + 96rpx 药丸 + 16rpx + 48rpx 跳过 + 底部安全区。
 *
 * 2026-10：药丸从 80rpx 变成 96rpx —— 「还不认识」那颗药丸里装着标记圆圈，
 * 而圆圈的可点区域按新规格长到了 56rpx（视觉），药丸跟着高了 16rpx。
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

/** 按 size 取这一批：0 = 全部。**优先挑刚在翻书页标记过的词**（见 storage.pickReviewBatch） */
function loadBatch(size: number): PoolWord[] {
  return pickReviewBatch(size)
}

export default function ReviewScreen() {
  const { params } = useRouter()
  const size = Math.max(Number(params.size ?? getReviewBatch()) || 0, 0)

  // 这一批是**进页面时算好的快照**：复习过程中词会离开生词本（点「我会了」），
  // 但这一屏不该跟着变，不然用户眼前的词会凭空少掉、进度也会乱。
  const [list] = useState<PoolWord[]>(() => loadBatch(size))
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [progress, setProgress] = useState<Record<string, number>>(() => getProgress())
  const [result, setResult] = useState({ pass: 0, mark: 0, skip: 0 })

  const finished = index >= list.length
  const current: PoolWord | null = finished ? null : list[index]

  const goNext = () => {
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  /** 「还不认识」：标记 +1（到 7 就加不上去了）并记一笔复习。判过就算复习过 */
  const handleMark = () => {
    if (!current) return
    incrementMark(current.word)
    setProgress(getProgress())
    markReviewed(current.word)
    setResult((r) => ({ ...r, mark: r.mark + 1 }))
    goNext()
  }

  /** 「我会了」：掌握 + 标记清零（masterWord 里做的），词从此在「熟练掌握词汇」里 */
  const handleMaster = () => {
    if (!current) return
    masterWord(current.word)
    setProgress(getProgress())
    markReviewed(current.word)
    setResult((r) => ({ ...r, pass: r.pass + 1 }))
    goNext()
  }

  /** 「跳过」：不判也不记，复习记录里不会出现它 */
  const handleSkip = () => {
    if (!current) return
    setResult((r) => ({ ...r, skip: r.skip + 1 }))
    goNext()
  }

  const handleBackToVocab = () => {
    goBack()
  }

  const handleOpenLog = () => {
    // redirectTo：把这页换掉，从「复习记录」返回时回到的是生词本，而不是结算页
    Taro.redirectTo({ url: '/pages/review-log/index' })
  }

  const navH = navBarHeightPx()
  const navTitle = finished ? '复习完成' : `复习 · ${index + 1}/${list.length}`
  const markCount = current ? progress[current.word] ?? current.markCount : 0

  return (
    <View style={STYLE.container}>
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
                我会了 {result.pass} 个 —— 已进「熟练掌握词汇」，标记清零
              </Text>
              <Text style={styles.doneLine}>
                还不认识 {result.mark} 个 —— 标记 +1，留在生词本
              </Text>
              <Text style={styles.doneLine}>跳过 {result.skip} 个</Text>

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
            <View className="glass glass-card" style={styles.card} onClick={() => setRevealed(true)}>
              <Text style={styles.counter}>
                第 {index + 1} / {list.length} 个
              </Text>
              <Text className="text-break" style={styles.word}>
                {current?.word}
              </Text>

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
                </>
              ) : (
                <Text style={styles.tapHint}>点卡片看释义</Text>
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ---------- 底部两个动作（只有复习中才有）---------- */}
      {list.length > 0 && !finished ? (
        <View style={{ ...STYLE.bottomBar, ...styles.actions, paddingBottom: `${bottomSafePx()}px` }}>
          {/*
            外层的药丸负责点，「还不认识」那颗圆圈自己**不接事件**（传 noop）。
            原因是微信里点击会往上冒泡：圆圈和外层都挂 onClick 的话，点一下圆圈
            会 +2。让圆圈当装饰、点击落在整颗药丸上，顺带把点击区域做大了。
          */}
          <View style={styles.actionRow}>
            <View {...PRESS} className="glass glass-pill" style={styles.markBtn} onClick={handleMark}>
              <MarkCircle markCount={markCount} onIncrement={noop} onDecrement={noop} />
              <Text style={styles.markBtnText}>还不认识</Text>
            </View>
            <View {...PRESS} style={styles.passBtn} onClick={handleMaster}>
              <Text style={styles.passBtnText}>我会了</Text>
            </View>
          </View>
          <View {...PRESS} style={styles.skipLink} onClick={handleSkip}>
            <Text style={styles.skipLinkText}>跳过这个词</Text>
          </View>
        </View>
      ) : null}

      <NavBar title={navTitle} back />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 卡片：一屏一个词，居中排、上下各 48rpx —— 内容少，留白就是版面
  card: {
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
  counter: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  word: {
    marginTop: '32rpx',
    fontSize: '60rpx',
    lineHeight: '76rpx',
    fontWeight: '700',
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
    borderRadius: '44rpx',
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
    borderRadius: '44rpx'
  },
  doneSecondaryText: {
    fontSize: FONT.definition,
    color: COLOR.text
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
  // 「还不认识」：玻璃胶囊 + 里面一颗标记圆圈（圆圈显示当前标记次数，点一下 +1）
  markBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '20rpx',
    paddingBottom: '20rpx',
    borderRadius: '44rpx'
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
    borderRadius: '44rpx',
    backgroundColor: COLOR.black
  },
  passBtnText: {
    fontSize: FONT.definition,
    color: COLOR.onDark
  },
  skipLink: {
    marginTop: '16rpx',
    paddingTop: '8rpx',
    paddingBottom: '8rpx'
  },
  skipLinkText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  }
}
