import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { NavBar } from '../../components/nav-bar'
import { PagerBar, pagerBarHeightPx } from '../../components/pager-bar'
import { TabBar } from '../../components/tab-bar'
import { PAGE_SIZE } from '../../data/words'
import {
  getCurrentPage,
  getMasteredWords,
  MasteredWord,
  setCurrentPage,
  unmasterWord
} from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { navBarHeightPx, rpxToPx, tabBarHeightPx, topGapPx } from '../../utils/metrics'

/**
 * 「熟练掌握词汇」：点过「我会了」的词都在这儿。底部 Tab 栏的第三个 Tab，
 * 和生词本同级（都是 navigateTo 进来的旁支页面，不是一个子页）。
 *
 * 2026-10 新增，顶替被删掉的「我的」。它的来历是那条规则：**词在生词本里时，
 * 点「我会了」会把七级标记清零** —— 清掉的词从生词本消失，总得有个地方去，
 * 就是这里。翻书页和生词本两边的「我会了」都往这里送人。
 *
 * 和生词本的区别（故意的）：
 * - 释义**直接摊开**，不用点。这儿是「已经会了的词」的成果册，不是考场。
 * - 排序按**掌握时间倒序**（最近会的最上面），生词本是按标记次数排。
 * - 撤销是行尾的红色「撤回」文字链接（显式、好找），不是长按绿色药丸 ——
 *   长按在生词本 / 翻书页那边还能用（两边共用 MasterPill），这里不再重复一遍。
 *
 * 翻页、底部悬浮件、内边距和生词本一模一样：一页 10 个，PagerBar + TabBar 都浮在
 * 内容上（高度见 utils/metrics.ts），所以滚动内容要留出上下内边距。
 */

/** 翻到第几页记在这个 key 下（只存本地，不上云） */
const PAGE_KEY = 'mastered'

function clampPage(p: number, totalPages: number): number {
  return Math.min(Math.max(p, 0), Math.max(totalPages - 1, 0))
}

export default function MasteredScreen() {
  const [list, setList] = useState<MasteredWord[]>(() => getMasteredWords())
  const totalPages = Math.ceil(list.length / PAGE_SIZE)
  const [page, setPage] = useState<number>(() => clampPage(getCurrentPage(PAGE_KEY), totalPages))

  /** 重新读一遍。撤回之后词数会变，页码要夹回有效范围（最后一页可能就空了） */
  const refresh = () => {
    const next = getMasteredWords()
    setList(next)
    setPage((p) => clampPage(p, Math.ceil(next.length / PAGE_SIZE)))
  }

  // 从翻书页 / 生词本 / 复习页刚点完「我会了」切过来，要重新读一次
  useDidShow(refresh)

  const turnPage = (next: number) => {
    if (next < 0 || next >= totalPages) return
    setPage(next)
    setCurrentPage(PAGE_KEY, next)
  }

  const handleRevoke = (word: string) => {
    // 撤回 = 这个词回到翻书列表（标记次数不回补，见 storage.masterWord 的说明）
    unmasterWord(word)
    refresh()
    Taro.showToast({ title: '已撤回，这个词回到翻书列表', icon: 'none', duration: 2000 })
  }

  const navH = navBarHeightPx()
  const tabH = tabBarHeightPx()
  const bodyBottom = pagerBarHeightPx() + tabH

  return (
    <View style={STYLE.container}>
      {totalPages === 0 ? (
        // 空状态不进滚动区：靠 STYLE.empty 的 flex:1 在整屏里居中
        <View style={{ ...STYLE.empty, paddingBottom: `${bodyBottom}px` }}>
          <Text style={STYLE.emptyText}>
            还没有「我会了」的词。翻书时看到认识的词，点一下「我会了」，它就会到这里；
            在生词本里点「我会了」，那个词的标记也会清零后挪过来。
          </Text>
        </View>
      ) : (
        <ScrollView scrollY style={STYLE.list}>
          {/* 内容从导航栏底下穿过去，留出导航栏高度 + 24rpx 顶距，底部留出翻页条和 Tab 栏 */}
          <View
            style={{
              paddingTop: `${navH + topGapPx()}px`,
              paddingBottom: `${bodyBottom + rpxToPx(16)}px`
            }}
          >
            <View style={styles.statsBar}>
              <Text style={styles.statsText}>
                第 {page + 1} / {totalPages} 页 · 共 {list.length} 个已掌握单词
              </Text>
              {/* 静态提示，不弹窗：点「我会了」现在完全没有提示音/弹窗了，
                  撤回的入口得写在屏幕上，不然用户不知道长按能撤 */}
              <Text style={styles.hintText}>
                在翻书页或生词本里长按绿色「已掌握」，也能撤回
              </Text>
            </View>

            {list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((item) => {
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
                  </View>

                  {/* 红色文字链接，不带背景不带边框 */}
                  <View {...PRESS} style={styles.revokeLink} onClick={() => handleRevoke(item.word)}>
                    <Text style={styles.revokeLinkText}>撤回</Text>
                  </View>
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}

      {/* 底部悬浮：翻页胶囊 + Tab 栏，词从它们底下滚过去 */}
      {totalPages === 0 ? null : (
        <PagerBar
          canPrev={page > 0}
          canNext={page < totalPages - 1}
          onPrev={() => turnPage(page - 1)}
          onNext={() => turnPage(page + 1)}
        />
      )}
      <NavBar title="熟练掌握词汇" back />
      <TabBar active="mastered" />
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
  revokeLink: {
    flexShrink: 0,
    marginLeft: '24rpx',
    paddingTop: '8rpx',
    paddingBottom: '8rpx'
  },
  revokeLinkText: {
    fontSize: FONT.meta,
    color: COLOR.dangerText
  }
}
