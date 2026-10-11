import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { useDidShow, useRouter } from '@tarojs/taro'
import { NavBar } from '../../components/nav-bar'
import {
  getVocabPool,
  markReviewed,
  masterWord,
  pickRandomByRecency,
  PoolWord
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
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
  const [limit, setLimit] = useState(CHUNK)

  // 从复习页 / 翻书页回来时重新读（掌握、标记都会动这一档）
  useDidShow(() => setWords(levelWords(level)))

  /** 抽一个：每次都用最新的一档词去抽（刚掌握掉的词不该再被抽到） */
  const draw = () => {
    setPick(pickRandomByRecency(levelWords(level)))
    setRevealed(false)
  }

  /** 抽中的词会了：掌握 + 记一次复习 → 它离开生词库、进「熟练掌握词汇」 */
  const handleMaster = () => {
    if (!pick) return
    masterWord(pick.word)
    markReviewed(pick.word)
    setPick(null)
    setRevealed(false)
    setWords(levelWords(level))
  }

  const navH = navBarHeightPx()
  const meta = pick ? [pick.phonetic, pick.pos].filter(Boolean).join('  ') : ''

  return (
    <View style={STYLE.container}>
      <ScrollView scrollY style={STYLE.list}>
        <View
          style={{
            paddingTop: `${navH + topGapPx()}px`,
            paddingBottom: `${bottomSafePx() + rpxToPx(24)}px`
          }}
        >
          {/*
            ① 随机抽查。用户说得很清楚：**这一页主要是「一眼看到这一档的词」，抽查只是辅助**。
            所以没抽的时候它只有一行高（标题 + 说明 + 一个小按钮），不抢版面；
            抽出来了才展开成一张卡。
          */}
          {pick ? (
            <View className="glass glass-card" style={styles.drawCard}>
              <Text style={styles.drawLabel}>随机抽查</Text>
              <Text
                className="text-break"
                style={styles.drawWord}
                onClick={() => setRevealed(true)}
              >
                {pick.word}
              </Text>
              {revealed ? (
                <>
                  {meta ? <Text style={styles.drawMeta}>{meta}</Text> : null}
                  <Text className="text-break" style={styles.drawDefinition}>
                    {pick.definition}
                  </Text>
                </>
              ) : (
                <Text style={styles.drawHintText} onClick={() => setRevealed(true)}>
                  点单词看释义
                </Text>
              )}

              <View style={styles.drawBtns}>
                <View {...PRESS} className="glass glass-pill" style={styles.drawBtn} onClick={draw}>
                  <Text style={styles.drawBtnText}>再抽一个</Text>
                </View>
                <View
                  {...PRESS}
                  style={{ ...styles.drawPrimary, marginLeft: '24rpx' }}
                  onClick={handleMaster}
                >
                  <Text style={styles.drawPrimaryText}>我会了</Text>
                </View>
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

          {words.length === 0 ? (
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
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
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
  drawSmallBtn: {
    flexShrink: 0,
    marginLeft: '24rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '16rpx',
    paddingBottom: '16rpx',
    borderRadius: '32rpx',
    backgroundColor: COLOR.black
  },
  drawSmallBtnText: {
    fontSize: FONT.meta,
    color: COLOR.onDark
  },
  drawWord: {
    marginTop: '20rpx',
    fontSize: '52rpx',
    lineHeight: '68rpx',
    fontWeight: '700',
    color: COLOR.text,
    textAlign: 'center'
  },
  drawMeta: {
    marginTop: '16rpx',
    fontSize: FONT.meta,
    lineHeight: '36rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },
  drawDefinition: {
    marginTop: '16rpx',
    fontSize: FONT.definition,
    lineHeight: '40rpx',
    color: COLOR.body,
    textAlign: 'center'
  },
  drawHintText: {
    marginTop: '20rpx',
    fontSize: FONT.meta,
    lineHeight: '36rpx',
    color: COLOR.secondary,
    textAlign: 'center'
  },
  // 两个按钮并排，整行铺开（卡片自带左右内边距，所以 alignSelf 撑满即可）
  drawBtns: {
    marginTop: '24rpx',
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
    borderRadius: '40rpx'
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
    borderRadius: '40rpx',
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
    fontSize: FONT.word,
    fontWeight: '700',
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
    borderRadius: '44rpx'
  },
  moreBtnText: {
    fontSize: FONT.definition,
    color: COLOR.text
  }
}
