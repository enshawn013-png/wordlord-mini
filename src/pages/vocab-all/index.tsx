import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ErrorBox, RowBoundary, detailOf, rememberError } from '../../components/error-box'
import { MarkCircle } from '../../components/mark-circle'
import { MasterPill } from '../../components/master-pill'
import { NavBar } from '../../components/nav-bar'
import {
  decrementMark,
  getProgress,
  getVocabPool,
  incrementMark,
  incrementTodayMarkCount,
  masterWord,
  PoolWord,
  removeVocabWord
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
 * 和 2026-09-28 老生词本的区别只有一处：**释义直接摊开**。原来的「先考你、点了才露」
 * 现在归卡片式复习页（pages/review）管 —— 那是考场，这里是看词的地方。
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
    // 到 7 就加不上去了：这时不弹「已掌握」那种提示，只说明白为什么没反应
    // （也和翻书页一致：加不上就 return，不计今日标记次数）
    if (!incrementMark(item.word)) {
      Taro.showToast({ title: '这个词已经标到 7 次了', icon: 'none' })
      return
    }
    incrementTodayMarkCount()
    setProgress(getProgress())
  }

  const handleDecrement = (item: PoolWord) => {
    decrementMark(item.word)
    setProgress(getProgress())
  }

  const handleMaster = (item: PoolWord) => {
    // masterWord 顺手把七级标记清零 → 这个词离开生词库，出现在「熟练掌握词汇」里
    masterWord(item.word)
    refresh()
  }

  const handleRemove = (word: string) => {
    removeVocabWord(word)
    refresh()
  }

  const navH = navBarHeightPx()

  return (
    <View style={STYLE.container}>
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
            <View style={styles.statsBar}>
              <Text style={styles.statsText}>共 {pool.length} 个生词 · 按标记次数从多到少</Text>
              <Text style={styles.hintText}>
                圆圈单击 +1、长按 −1；「我会了」会把标记清零，这个词就进「熟练掌握词汇」
              </Text>
            </View>

            <RowBoundary where="全部生词·渲染">
              {pool.slice(0, limit).map((item) => {
                const markCount = progress[item.word] ?? item.markCount
                const meta = [item.phonetic, item.pos].filter(Boolean).join('  ')
                return (
                  <View key={item.word} className="glass glass-card" style={styles.row}>
                    <View style={styles.rowText}>
                      {/* text-break：自传词表的词条/释义可能是没有空格的长串，不许顶出卡片 */}
                      <Text className="text-break" style={styles.word}>
                        {item.word}
                      </Text>
                      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                      <Text className="text-break" style={styles.definition}>
                        {item.definition}
                      </Text>

                      {/* 圆圈 +「我会了」，和翻书页一样：单击标记 +1、长按 −1 */}
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
                    </View>

                    {/* 红色文字链接，不带背景不带边框 */}
                    <View {...PRESS} style={styles.removeLink} onClick={() => handleRemove(item.word)}>
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
    color: COLOR.secondary
  },
  hintText: {
    marginTop: '8rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  // 和生词本老列表同一套：玻璃卡片、左右各 32rpx 边、行间 16rpx 缝、卡片内边距上下各 32rpx
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
  controls: {
    marginTop: '24rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
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
    borderRadius: '44rpx'
  },
  moreBtnText: {
    fontSize: FONT.definition,
    color: COLOR.text
  }
}
