import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { ErrorBox, RowBoundary, detailOf, rememberError } from '../../components/error-box'
import { MarkCircle } from '../../components/mark-circle'
import { MasterPill } from '../../components/master-pill'
import { NavBar } from '../../components/nav-bar'
import { PageHeader } from '../../components/page-header'
import {
  decrementMark,
  getProgress,
  getVocabPool,
  incrementMark,
  incrementTodayMarkCount,
  masterWord,
  PoolWord,
  removeVocabWord,
  restoreWord,
  snapshotWord,
  WordSnapshot
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx } from '../../utils/metrics'

/**
 * 「全部生词」：生词库**一次性全列出来**，从生词本页最下面那行灰色小字进来。
 *
 * 2026-10 这场改动的来龙去脉：用户要求生词本首页不出现单词，词藏起来，
 * 「可以看到所有生词」的入口要**小一点、不那么明显** —— 所以它成了生词本页底部的
 * 一行灰字，列表搬到了这里。
 *
 * ⚠️ **2026-11（R6）反过来改了一次**：这一页原来把中文释义**直接摊开**，
 * 理由是「这里是看词的地方，考场在复习页」。但实际用下来，一屏全是中文释义＝
 * 眼睛在背单词（用户原话「容易眼睛背单词」）：中文一眼扫过去，就没有回想这一步了。
 * 现在的规矩是：
 *
 * | 页面 | 释义默认 | 为什么 |
 * | --- | --- | --- |
 * | 全部生词（这一页） | **藏着**，点卡片才展开 | 列表是「过一遍」，得先自己回想 |
 * | 复习闪卡（`pages/review`） | 卡片背面，点一下才露 | **复习的主入口**，一屏一词、先考再判 |
 * | 翻书页 | 标过 / 会了 / 点过这行才露 | 背新词的场子 |
 *
 * 展开状态只活在这一页（`open`）：它是个浏览动作，不该被记住 —— 下次进来
 * 仍然应该先考自己一遍。词卡上的圆圈和「我会了」照旧（它们不是「看释义」的入口）。
 *
 * 交互还是老三样：圆圈单击 +1 / 长按 −1、「我会了」掌握（顺手把标记清零、这个词离开本页）、
 * 行尾红色「移除」。
 *
 * ⚠️ **一次渲染多少个**：ScrollView 不虚拟化，一屏挂上千个节点微信会卡，
 * 所以这里按 `CHUNK` 分批展开 —— 第一批 80 个，底部一颗「显示更多」按钮，
 * 点一次再放 80 个。「一次性看全部」的诉求还在（多点几下就到底），
 * 但不会在开屏那一刻就把整库存渲染出来。
 *
 * 没有 Tab 栏（它是生词本的子页），所以底部只留安全区。
 */

/** 一次渲染多少个词；见上面关于节点数的说明 */
const CHUNK = 80

export default function VocabAllScreen() {
  const [pool, setPool] = useState<PoolWord[]>(() => getVocabPool())
  const [progress, setProgress] = useState<Record<string, number>>(() => getProgress())
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(CHUNK)
  /**
   * 这一页里**被点开释义**的词（R6）：默认全都不展开 —— 列表先考你。
   * 只活在这一页，不落存储（见文件头）。
   */
  const [open, setOpen] = useState<Record<string, boolean>>({})
  /** 刚移除的那个词（含它当时的标记次数），用来做撤销 */
  const [removed, setRemoved] = useState<WordSnapshot | null>(null)
  /** 标到 7 次加不上去的词（就地说明原因，不弹 Toast） */
  const [capped, setCapped] = useState<Record<string, boolean>>({})
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 卸载时把撤销条的超时清掉，不然会对着已经销毁的页面 setState
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current)
    },
    []
  )

  /** 重新读一遍（标记、掌握、移除都会动数据） */
  const refresh = () => {
    try {
      setPool(getVocabPool())
      setProgress(getProgress())
      setError('')
    } catch (e) {
      const detail = detailOf(e)
      rememberError('全部生词·读取列表', detail)
      setPool([])
      setError(detail)
    }
  }

  // 从翻书页刚标完就切过来（或从下钻的页面返回），要重新读一次
  useDidShow(refresh)

  const handleIncrement = (item: PoolWord) => {
    // 到 7 就加不上去了：**就地说明为什么没反应**，不用 Toast。
    // Toast 会把这句话挤成两行、还在屏幕中间飘一下就没（用户截图反馈过「点了没反应」）。
    if (!incrementMark(item.word)) {
      setCapped((prev) => (prev[item.word] ? prev : { ...prev, [item.word]: true }))
      return
    }
    incrementTodayMarkCount()
    setProgress(getProgress())
  }

  const handleDecrement = (item: PoolWord) => {
    decrementMark(item.word)
    setCapped((prev) => {
      if (!prev[item.word]) return prev
      const next = { ...prev }
      delete next[item.word]
      return next
    })
    setProgress(getProgress())
  }

  const handleMaster = (item: PoolWord) => {
    // masterWord 顺手把七级标记清零 → 这个词离开生词库，出现在「熟练掌握词汇」里
    masterWord(item.word)
    refresh()
  }

  /** 点卡片展开 / 收起释义（R6）。卡片本身不是「标记」，看词义不等于「这个我不会」 */
  const toggleDefinition = (word: string) => {
    setOpen((prev) => ({ ...prev, [word]: !prev[word] }))
  }

  /**
   * 移除：**可撤销**。
   *
   * 这是「可逆的操作给撤销、不给二次确认」那条规矩的落地：移除只是把进度记录删掉，
   * 完全能原样放回去，所以不该弹一个 Modal 让用户先确认（那是给不可逆操作留的）。
   * 现在点下去立刻生效（列表马上少一行，反馈明确），底部浮出一条「撤销」，6 秒后自己消失。
   */
  const handleRemove = (item: PoolWord) => {
    const snap = snapshotWord(item.word)
    removeVocabWord(item.word)
    setRemoved(snap)
    refresh()
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = setTimeout(() => setRemoved(null), 6000)
  }

  const handleUndoRemove = () => {
    if (!removed) return
    restoreWord(removed)
    setRemoved(null)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    refresh()
  }

  const navH = navBarHeightPx()

  return (
    <View style={STYLE.container}>
      <PageCurtain label="全部生词" kicker="ALL WORDS" />
      {error ? (
        // 读数据就失败了：把原文摊在屏幕上（见 error-box.tsx 的说明）
        <View style={{ ...STYLE.empty, paddingBottom: `${bottomSafePx()}px` }}>
          <ErrorBox title="全部生词读取失败" detail={error} />
        </View>
      ) : pool.length === 0 ? (
        <View style={{ ...STYLE.empty, paddingBottom: `${bottomSafePx()}px` }}>
          <Text style={STYLE.emptyText}>
            生词库是空的。在翻书页看到不会的词，点右边圆圈标记它，它就会出现在这里。
          </Text>
        </View>
      ) : (
        <ScrollView scrollY style={STYLE.list}>
          <View
            style={{
              paddingTop: `${navH + topGapPx()}px`,
              paddingBottom: `${bottomSafePx() + rpxToPx(24)}px`
            }}
          >
            <PageHeader kicker="ALL WORDS" title="全部生词" sub="标记过的词都在这里，按标记次数排" />
<View style={styles.statsBar}>
              <Text style={styles.statsText}>共 {pool.length} 个生词 · 按标记次数从多到少</Text>
              <Text style={styles.hintText}>
                点卡片看释义，再点收起；圆圈单击 +1、长按 −1；「我会了」会把标记清零，这个词就进「熟练掌握词汇」
              </Text>
            </View>

            <RowBoundary where="全部生词·渲染">
              {pool.slice(0, limit).map((item) => {
                const markCount = progress[item.word] ?? item.markCount
                const meta = [item.phonetic, item.pos].filter(Boolean).join('  ')
                /** 这一次展开释义了吗（R6：默认 false） */
                const isOpen = Boolean(open[item.word])
                return (
                  <View
                    key={item.word}
                    {...PRESS}
                    aria-role="button"
                    aria-label={`${item.word} ${isOpen ? '收起释义' : '展开释义'}`}
                    style={styles.row}
                    onClick={() => toggleDefinition(item.word)}
                  >
                    <View style={styles.rowText}>
                      {/* text-break：自传词表的词条/释义可能是没有空格的长串，不许顶出卡片 */}
                      <Text className="text-break" style={styles.word}>
                        {item.word}
                      </Text>
                      {meta ? <Text style={styles.meta}>{meta}</Text> : null}

                      {/* ---------- 释义（R6）：默认藏着，点卡片才展开 ---------- */}
                      {isOpen ? (
                        <Text className="text-break" style={styles.definition}>
                          {item.definition}
                        </Text>
                      ) : (
                        <Text style={styles.revealHint}>点卡片看释义</Text>
                      )}

                      {/* 圆圈 +「我会了」，和翻书页一样：单击标记 +1、长按 −1。
                          ⚠️ 这两个是**兄弟节点**（不嵌在可点区域里），它们只改标记 / 掌握，
                          不会顺带把释义摊开 —— 想看一眼意思用卡片本身，不用先假装不会 */}
                      <View style={styles.controls}>
                        <MarkCircle
                          markCount={markCount}
                          onIncrement={() => handleIncrement(item)}
                          onDecrement={() => handleDecrement(item)}
                        />
                        <MasterPill
                          mastered={false}
                          onMaster={() => handleMaster(item)}
                          onUnmaster={() => undefined}
                        />
                      </View>

                      {/* 标到顶了就当场说清楚（替代原来那个会把点击吞掉的 Toast） */}
                      {capped[item.word] ? (
                        <Text style={styles.capHint}>已标满 7 次 · 长按圆圈可以减一</Text>
                      ) : null}
                    </View>

                    {/* 红色文字链接，不带背景不带边框 */}
                    <View {...PRESS} style={styles.removeLink} onClick={() => handleRemove(item)}>
                      <Text style={styles.removeLinkText}>移除</Text>
                    </View>
                  </View>
                )
              })}

              {/* 还没放完的：一次再放一批（见文件头关于节点数的说明） */}
              {pool.length > limit ? (
                <View
                  {...PRESS}
                  className="glass glass-pill"
                  style={styles.moreBtn}
                  onClick={() => setLimit((n) => n + CHUNK)}
                >
                  <Text style={styles.moreBtnText}>
                    显示更多（还剩 {pool.length - limit} 个）
                  </Text>
                </View>
              ) : null}
            </RowBoundary>
          </View>
        </ScrollView>
      )}

      <NavBar title="全部生词" back />

      {/* 撤销条：移除是可逆操作，所以给「撤销」而不是二次确认（大厂通行做法） */}
      {removed ? (
        <View className="glass glass-bar-bottom" style={{ ...STYLE.bottomBar, paddingBottom: `${bottomSafePx()}px` }}>
          <View style={styles.undoBar}>
            <Text className="text-break" style={styles.undoText}>
              已移除 {removed.word}
            </Text>
            <View {...PRESS} style={styles.undoBtn} onClick={handleUndoRemove}>
              <Text style={styles.undoBtnText}>撤销</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  statsBar: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingBottom: '16rpx'
  },
  statsText: {
    fontSize: FONT.meta,
    color: COLOR.onGroundSoft
  },
  hintText: {
    marginTop: '8rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.onGroundSoft
  },
  // 和生词本老列表同一套：玻璃卡片、左右各 32rpx 边、行间 16rpx 缝、卡片内边距上下各 32rpx
  // 和「已掌握」同一套：词直接排在橙底上，细线分隔，不套白框
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: '0rpx',
    marginRight: '0rpx',
    marginTop: '0rpx',
    paddingLeft: '36rpx',
    paddingRight: '36rpx',
    paddingTop: '24rpx',
    paddingBottom: '24rpx',
    borderBottom: '2rpx solid rgba(23, 21, 15, 0.16)'
  },
  rowText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  word: {
    fontSize: FONT.word,
    fontWeight: '700',
    color: COLOR.onGround
  },
  meta: {
    marginTop: '10rpx',
    fontSize: FONT.meta,
    color: COLOR.onGroundSoft
  },
  definition: {
    marginTop: '10rpx',
    fontSize: FONT.definition,
    color: COLOR.onGroundSoft
  },
  // 收起状态下的那一句提示（R6）：22rpx 次要色，是「这里可以点」的**文字**提示，
  // 不靠颜色或图标单独传达（对比度 5.07:1，见 theme.ts 的 secondary）
  revealHint: {
    marginTop: '10rpx',
    fontSize: FONT.pageNo,
    lineHeight: '30rpx',
    color: COLOR.onGroundSoft
  },
  controls: {
    marginTop: '24rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  // 标满 7 次的就地提示
  capHint: {
    marginTop: '12rpx',
    fontSize: FONT.pageNo,
    lineHeight: '30rpx',
    color: COLOR.onGroundSoft
  },
  // ---------- 撤销条（底部悬浮，和导航栏同一套玻璃） ----------
  undoBar: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '20rpx'
  },
  undoText: {
    flex: 1,
    fontSize: FONT.meta,
    color: COLOR.onGroundSoft
  },
  // 「撤销」= 88rpx 热区（负外边距还回布局）
  undoBtn: {
    flexShrink: 0,
    marginLeft: '16rpx',
    marginTop: '-24rpx',
    marginBottom: '-24rpx',
    paddingTop: '24rpx',
    paddingBottom: '24rpx',
    paddingLeft: '16rpx'
  },
  undoBtnText: {
    fontSize: FONT.meta,
    fontWeight: '600',
    color: COLOR.progress
  },
  removeLink: {
    flexShrink: 0,
    marginLeft: '24rpx',
    // 热区补到 88rpx：多出来的 20rpx 用负外边距还回去，卡片高度不变
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    marginTop: '-20rpx',
    marginBottom: '-20rpx'
  },
  removeLinkText: {
    fontSize: FONT.meta,
    color: COLOR.dangerText
  },
  // 「显示更多」：和卡片同宽的一颗玻璃胶囊（父级不是 flex，所以用左右外边距对齐，
  // 别写 alignSelf —— 在块级父元素里它不生效）
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
    color: COLOR.onGround
  }
}
