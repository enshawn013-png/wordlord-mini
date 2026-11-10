import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { useDidShow, useRouter } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { NavBar } from '../../components/nav-bar'
import { PageHeader } from '../../components/page-header'
import {
  getVocabPool,
  markReviewed,
  masterWord,
  pickRandomByRecency,
  PoolWord
} from '../../store/storage'
import { COLOR, FONT, FONT_STACK, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx } from '../../utils/metrics'

/**
 * 某一个标记档位的子界面（`?level=1..7`），从「复习记录」的七行里点进来。
 *
 * 用户对这一页的要求（2026-10）：**主要功能是一下子看到当前标记段位的单词，很明了**；
 * 「随机抽查」只是个辅助功能。所以版面是：
 *
 *   ① 顶部一张抽查卡 —— 点「抽一个」从这一档里随机抽一个词，先只给英文，点词看释义；
 *      抽中概率按「最近标记 / 复习过」加权（storage.pickRandomByRecency，最多 1.5 倍，
 *      用户要的是「大一点点」，不是「只抽新词」）。抽出来还能直接「我会了」。
 *   ② 下面就是这一档的**全部单词**（词 + 音标词性 + 释义，全摊开），
 *      每行右边写「复习 N 次」（复习记录里有数据才写）。
 *
 * 列表是**只读**的：标记、掌握这些动作回翻书页 / 全部生词 / 复习页做 ——
 * 这一页的职责是把这一档看明白，不在这里制造分叉的操作入口。
 *
 * 排序：**最近标记的排前面**（markedAt 倒序），这样在翻书页刚标的词一进来就在眼前。
 *
 * 没有 Tab 栏（生词本的孙页），底部只留安全区。
 */

/** 把 ?level= 收进 1..7；非法值当 1 */
function clampLevel(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(Math.max(Math.round(n), 1), 7)
}

/**
 * 一次渲染多少个词。ScrollView 不虚拟化，一档几百个词全铺出来会卡，
 * 所以先放 80 个，底部一颗「显示更多」再放 80 个 —— 「一眼看到这一档」的诉求保留。
 */
const CHUNK = 80

/** 这一档的全部词，最近标记的在前 */
function levelWords(level: number): PoolWord[] {
  return getVocabPool()
    .filter((w) => w.markCount === level)
    .sort((a, b) => b.markedAt - a.markedAt || a.word.localeCompare(b.word))
}

export default function ReviewLevelScreen() {
  const { params } = useRouter()
  const level = clampLevel(params.level)

  const [words, setWords] = useState<PoolWord[]>(() => levelWords(level))
  const [pick, setPick] = useState<PoolWord | null>(null)
  const [revealed, setRevealed] = useState(false)
  /**
   * 抽中的这个词已经「我会了」（2026-11 全站口径：先记录 → 展开答案 → 再翻下一个）。
   * 以前点完当场把卡片收起来，用户没机会看清自己刚判的是什么、也没机会后悔；
   * 现在卡片留着、释义摊开，按钮只剩「下一个」。
   */
  const [masteredPick, setMasteredPick] = useState(false)
  /**
   * 同上，但要一份同步的 ref：`masteredPick` 是 state，同一个 tick 里连点两下时
   * 第二下读到的还是 false —— 会 masterWord + markReviewed 记两遍。
   * 守卫一律读 ref（和卡片版 / 复习页同一套做法）。
   */
  const masteredPickRef = useRef(false)
  /** 点按钮时飘出来的小 emoji（抽查 🎲 / 我会了 ✨），和卡片版同一套 */
  const [burst, setBurst] = useState<{ id: number; emoji: string } | null>(null)

  /** 飘一下：700ms 后自动清掉（动画长度见 app.css 的 burstUp） */
  const fireBurst = (emoji: string) => {
    setBurst({ id: Date.now(), emoji })
    setTimeout(() => setBurst(null), 720)
  }
  const [limit, setLimit] = useState(CHUNK)

  // 从复习页 / 翻书页回来时重新读（掌握、标记都会动这一档）
  useDidShow(() => setWords(levelWords(level)))

  /** 抽一个：每次都用最新的一档词去抽（刚掌握掉的词不该再被抽到） */
  const draw = () => {
    setPick(pickRandomByRecency(levelWords(level)))
    setRevealed(false)
    masteredPickRef.current = false
    setMasteredPick(false)
    fireBurst('§')
  }

  /** 抽中的词会了：掌握 + 记一次复习 → 它离开生词库、进「熟练掌握词汇」。
   *  记录完**停在原地**（释义摊开、按钮变「下一个」），给用户看一眼的机会。 */
  const handleMaster = () => {
    if (!pick || masteredPickRef.current) return
    masteredPickRef.current = true
    fireBurst('✓')
    masterWord(pick.word)
    markReviewed(pick.word)
    setRevealed(true)
    setMasteredPick(true)
    setWords(levelWords(level))
  }

  const navH = navBarHeightPx()
  const meta = pick ? [pick.phonetic, pick.pos].filter(Boolean).join('  ') : ''

  return (
    <View style={STYLE.container}>
      <PageCurtain label="标记档位" kicker="MARK LEVEL" />
      <ScrollView scrollY style={STYLE.list}>
        <View
          style={{
            paddingTop: `${navH + topGapPx()}px`,
            paddingBottom: `${bottomSafePx() + rpxToPx(24)}px`
          }}
        >
          <PageHeader kicker="MARK LEVEL" title="标记档位" sub="这一档的词全在这儿，可以抽查" ghost="档" />
          {/*
            ① 随机抽查。用户说得很清楚：**这一页主要是「一眼看到这一档的词」，抽查只是辅助**。
            所以没抽的时候它只有一行高（标题 + 说明 + 一个小按钮），不抢版面；
            抽出来了才展开成一张卡。
          */}
          {pick ? (
            <View
              className="glass glass-card"
              style={styles.drawCard}
              onClick={() => setRevealed(true)}
            >
              {burst ? (
                <Text key={burst.id} style={styles.burst}>
                  {burst.emoji}
                </Text>
              ) : null}

              {/* 芯片行：和卡片版同一个位置、同一种小标签 */}
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>抽查 · 第 {level} 档</Text>
                </View>
                <Text style={styles.chipSide}>本档 {words.length} 个</Text>
              </View>

              {/* 词：整张卡唯一的大字 */}
              <Text className="text-break" style={styles.drawWord}>
                {pick.word}
              </Text>
              {revealed && meta ? <Text style={styles.drawMeta}>{meta}</Text> : null}

              {revealed ? (
                <View style={styles.answer}>
                  <View style={styles.divider} />
                  <Text className="text-break" style={styles.drawDefinition}>
                    {pick.definition}
                  </Text>
                  {/* 判定回执：只回答「这一下判成什么了」 */}
                  {masteredPick ? (
                    <Text style={styles.masteredHint}>已进「熟练掌握词汇」 · 以后不再出现</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.drawHintText}>轻点卡片看释义</Text>
              )}

              {/* 未作答：换一个 / 我会了；已作答：只剩「下一个」（全站统一口径，见卡片版注释） */}
              <View style={styles.drawBtns}>
                {masteredPick ? (
                  <View
                    hoverClass="press"
                    style={{ ...styles.btn, ...styles.btnPrimary, flex: 1 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      draw()
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>下一个</Text>
                  </View>
                ) : (
                  <>
                    <View
                      hoverClass="press"
                      style={{ ...styles.btn, ...styles.btnGhost }}
                      onClick={(e) => {
                        e.stopPropagation()
                        draw()
                      }}
                    >
                      <Text style={styles.btnGhostText}>换一个</Text>
                    </View>
                    <View
                      hoverClass="press"
                      style={{ ...styles.btn, ...styles.btnPrimary }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMaster()
                      }}
                    >
                      <Text style={styles.btnPrimaryText}>我会了</Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          ) : (
            <View className="glass glass-card" style={styles.drawBar}>
              <View style={styles.drawBarText}>
                <Text style={styles.drawTitle}>随机抽查</Text>
                <Text style={styles.drawBarHint}>
                  从这一档的 {words.length} 个词里随机抽一个；最近标记 / 复习过的稍微容易抽中
                </Text>
              </View>
              <View {...PRESS} style={styles.drawSmallBtn} onClick={draw}>
                <Text style={styles.drawSmallBtnText}>抽一个</Text>
              </View>
            </View>
          )}

          {/* ---------- ② 这一档的全部单词 ---------- */}
          <View style={styles.statsBar}>
            <Text style={styles.statsText}>
              标记 {level} 次 · 共 {words.length} 个词
            </Text>
            <Text style={styles.hintText}>最近在翻书页标记的排在最前面</Text>
          </View>

          {words.length === 0 && !pick ? (
            <View style={styles.emptyBox}>
              <Text style={STYLE.emptyText}>
                这一档暂时没有词。回复习记录看看别的档，或者在翻书页多标几个词。
              </Text>
            </View>
          ) : (
            <>
              {words.slice(0, limit).map((item) => {
                const rowMeta = [item.phonetic, item.pos].filter(Boolean).join('  ')
                return (
                  <View key={item.word} className="glass glass-card" style={styles.row}>
                    <View style={styles.rowText}>
                      {/* text-break：自传词表的词条/释义可能是没有空格的长串，不许顶出卡片 */}
                      <Text className="text-break" style={styles.word}>
                        {item.word}
                      </Text>
                      {rowMeta ? <Text style={styles.meta}>{rowMeta}</Text> : null}
                      <Text className="text-break" style={styles.definition}>
                        {item.definition}
                      </Text>
                    </View>
                    <View style={styles.rowSide}>
                      <Text style={styles.sideText}>
                        {item.reviewTimes > 0 ? `复习 ${item.reviewTimes} 次` : '未复习'}
                      </Text>
                    </View>
                  </View>
                )
              })}

              {/* 还没放完的：一次再放一批（见文件头关于节点数的说明） */}
              {words.length > limit ? (
                <View
                  {...PRESS}
                  className="glass glass-pill"
                  style={styles.moreBtn}
                  onClick={() => setLimit((n) => n + CHUNK)}
                >
                  <Text style={styles.moreBtnText}>
                    显示更多（还剩 {words.length - limit} 个）
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      <NavBar title={`标记 ${level} 次`} back />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 抽查卡：居中排，比普通行宽松一点，但比卡片式复习页「轻」
  drawCard: {
    position: 'relative',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingLeft: '44rpx',
    paddingRight: '44rpx',
    paddingTop: '34rpx',
    paddingBottom: '38rpx',
    borderRadius: '12rpx',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  drawLabel: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  // 没抽之前：一行高的辅助条（标题 + 说明 + 小按钮），不抢「看这一档的词」的版面
  drawBar: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '24rpx',
    paddingBottom: '24rpx'
  },
  drawBarText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  drawTitle: {
    fontSize: FONT.definition,
    fontWeight: '700',
    color: COLOR.text
  },
  drawBarHint: {
    marginTop: '6rpx',
    fontSize: FONT.pageNo,
    lineHeight: '30rpx',
    color: COLOR.secondary
  },
  // 黑底小按钮：视觉 64rpx，热区靠上下各 12rpx 内边距 + 负外边距补到 88rpx
  drawSmallBtn: {
    flexShrink: 0,
    marginLeft: '24rpx',
    marginTop: '-12rpx',
    marginBottom: '-12rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '12rpx',
    paddingBottom: '12rpx',
    borderRadius: '6rpx',
    backgroundColor: COLOR.black
  },
  drawSmallBtnText: {
    fontSize: FONT.meta,
    color: COLOR.onDark
  },
  drawWord: {
    marginTop: '28rpx',
    fontSize: '68rpx',
    lineHeight: '86rpx',
    fontWeight: '600',
    color: COLOR.text
  },
  drawMeta: {
    marginTop: '10rpx',
    fontSize: '24rpx',
    lineHeight: '34rpx',
    color: COLOR.secondary
  },
  drawDefinition: {
    fontSize: '34rpx',
    lineHeight: '52rpx',
    color: COLOR.text
  },
  drawHintText: {
    marginTop: '24rpx',
    fontSize: FONT.pageNo,
    lineHeight: '36rpx',
    color: COLOR.secondary
  },
  /** 判定回执：22rpx 暖色小字（和卡片版的 verdictLine 同一条语言） */
  masteredHint: {
    marginTop: '16rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    fontWeight: '600',
    color: COLOR.warm,
    animation: 'labelIn 180ms ease both'
  },
  // 芯片行：和卡片版同一个位置与语言
  chipRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  chip: {
    height: '40rpx',
    paddingLeft: '16rpx',
    paddingRight: '16rpx',
    borderRadius: '4rpx',
    backgroundColor: COLOR.warmSoft,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chipText: {
    fontSize: '20rpx',
    lineHeight: '40rpx',
    letterSpacing: '1rpx',
    color: COLOR.warm
  },
  chipSide: {
    fontSize: '20rpx',
    color: COLOR.secondary
  },
  answer: {
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeUp 320ms cubic-bezier(.22,.61,.36,1) both'
  },
  divider: {
    marginTop: '26rpx',
    marginBottom: '22rpx',
    height: '1rpx',
    backgroundColor: COLOR.track
  },
  // 两个等宽按钮：左描边（换一个）右实心（我会了），和卡片版一致
  btn: {
    flex: 1,
    height: '100rpx',
    borderRadius: '6rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnGhost: {
    marginRight: '20rpx',
    border: `1rpx solid ${COLOR.track}`,
    backgroundColor: COLOR.paperRaised
  },
  btnGhostText: {
    fontSize: '30rpx',
    color: COLOR.body
  },
  btnPrimary: {
    backgroundColor: COLOR.black
  },
  btnPrimaryText: {
    fontSize: '30rpx',
    fontWeight: '600',
    color: COLOR.onDark
  },
  // 飘出来的小 emoji
  burst: {
    position: 'absolute',
    top: '34%',
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
  // 两个按钮并排，整行铺开（卡片自带左右内边距，所以 alignSelf 撑满即可）
  drawBtns: {
    marginTop: '32rpx',
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  drawBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '20rpx',
    paddingBottom: '20rpx',
    borderRadius: '6rpx'
  },
  drawBtnText: {
    fontSize: FONT.definition,
    color: COLOR.text
  },
  // 主操作：黑底胶囊。**不写 marginTop**——它在 drawBtns 那一行里和「再抽一个」并排，
  // 自己带外边距会把两个按钮错开（外边距统一由 drawBtns 给）
  drawPrimary: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '20rpx',
    paddingBottom: '20rpx',
    borderRadius: '6rpx',
    backgroundColor: COLOR.black
  },
  drawPrimaryText: {
    fontSize: FONT.definition,
    color: COLOR.onDark
  },

  statsBar: {
    marginTop: '32rpx',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingBottom: '16rpx'
  },
  statsText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  hintText: {
    marginTop: '8rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  emptyBox: {
    paddingTop: '48rpx',
    paddingLeft: '48rpx',
    paddingRight: '48rpx'
  },
  // 和生词本的行同一套：玻璃卡片、左右各 32rpx 边、行间 16rpx 缝、卡片内边距上下各 32rpx
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '16rpx',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '32rpx',
    paddingBottom: '32rpx'
  },
  rowText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  word: {
    fontFamily: FONT_STACK.serif,
    fontSize: '40rpx',
    lineHeight: '50rpx',
    fontWeight: '400',
    color: COLOR.text
  },
  meta: {
    marginTop: '10rpx',
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  definition: {
    marginTop: '10rpx',
    fontSize: FONT.definition,
    color: COLOR.body
  },
  rowSide: {
    flexShrink: 0,
    marginLeft: '24rpx'
  },
  sideText: {
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  // 「显示更多」：和卡片同宽的一颗玻璃胶囊（父级不是 flex，左右外边距对齐）
  moreBtn: {
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '32rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '88rpx',
    borderRadius: '6rpx'
  },
  moreBtnText: {
    fontSize: FONT.definition,
    color: COLOR.text
  }
}
