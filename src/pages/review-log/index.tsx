import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { MarkBadge } from '../../components/mark-circle'
import { NavBar } from '../../components/nav-bar'
import { PageHeader } from '../../components/page-header'
import { getReviewLog, getVocabPool, PoolWord } from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx } from '../../utils/metrics'

/**
 * 「复习记录」：生词本的子页，**按标记段位分档的目录**（7 → 1 七个子界面）。
 *
 * 2026-10 用户把这页的定位改了：原来是一页平铺「复习过的词」并按等级分组，
 * 现在改成**七个档次各一个子界面**（pages/review-level），这一页只当目录 ——
 * 每一档显示有多少个词，点进去看这一档的**全部单词**，顺带有个随机抽查的辅助功能。
 *
 * 「这一档有多少词」数的是**生词库**（`markCount > 0` 且未掌握），不是「复习过的词」：
 * 用户要的是「一下子看到当前标记段位的单词」，所以档位页列的是全量；
 * 复习过几次、最近复没复习，作为每行的小字显示在档位页里。
 *
 * 顶部的「复习过 N 个」是复习记录（`reviews`）里的规模，用来一眼看出抽查会偏向哪些词。
 *
 * 没有 Tab 栏（子页），底部只留安全区。
 */

/** 七个档次，从 7 到 1 排 */
const LEVELS_DESC = [7, 6, 5, 4, 3, 2, 1]

export default function ReviewLogScreen() {
  const [pool, setPool] = useState<PoolWord[]>(() => getVocabPool())
  const [reviewedCount, setReviewedCount] = useState<number>(() => Object.keys(getReviewLog()).length)

  // 从档位页 / 复习页回来时重新读一次（标记、掌握、复习都会动这两份数据）
  useDidShow(() => {
    setPool(getVocabPool())
    setReviewedCount(Object.keys(getReviewLog()).length)
  })

  const countOf = (level: number) => pool.filter((w) => w.markCount === level).length
  const navH = navBarHeightPx()

  const openLevel = (level: number, empty: boolean) => {
    if (empty) return
    Taro.navigateTo({ url: `/pages/review-level/index?level=${level}` })
  }

  return (
    <View style={STYLE.container}>
      <PageCurtain label="复习记录" kicker="REVIEW LOG" />
      <ScrollView scrollY style={STYLE.list}>
        <View
          style={{
            paddingTop: `${navH + topGapPx()}px`,
            paddingBottom: `${bottomSafePx() + rpxToPx(24)}px`
          }}
        >
          <PageHeader kicker="REVIEW LOG" title="复习记录" sub="按标记等级倒着看，从最不熟的开始" />
<View style={styles.statsBar}>
            <Text style={styles.statsText}>
              生词库共 {pool.length} 个词 · 复习过 {reviewedCount} 个
            </Text>
            <Text style={styles.hintText}>
              点某一档进去看这一档的全部单词；每档都能随机抽查
            </Text>
          </View>

          {LEVELS_DESC.map((level) => {
            const count = countOf(level)
            const empty = count === 0
            return (
              <View
                key={level}
                {...(empty ? {} : PRESS)}
                className="glass glass-card"
                style={{ ...styles.row, ...(empty ? STYLE.disabledBtn : null) }}
                onClick={() => openLevel(level, empty)}
              >
                <MarkBadge markCount={level} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>等级 {level}/7{level === 7 ? ' · 最不熟' : level === 1 ? ' · 差一步' : ''}</Text>
                  <Text style={styles.rowMeta}>
                    {empty ? '这一档还没有词' : `${count} 个词`}
                  </Text>
                </View>
                <View style={styles.chevron}>
                  <Text style={styles.chevronText}>›</Text>
                </View>
              </View>
            )
          })}
        </View>
      </ScrollView>

      <NavBar title="复习记录" back />
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
  // 每一档一行：左边一颗该档的标记圆圈（颜色和所有页面一致），右边灰色箭头
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
    flexDirection: 'column',
    marginLeft: '24rpx'
  },
  rowTitle: {
    fontSize: '32rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  rowMeta: {
    marginTop: '6rpx',
    fontSize: FONT.meta,
    lineHeight: '32rpx',
    color: COLOR.secondary
  },
  chevron: {
    flexShrink: 0,
    marginLeft: '16rpx',
    paddingTop: '16rpx',
    paddingBottom: '16rpx',
    paddingLeft: '8rpx'
  },
  chevronText: {
    fontSize: '36rpx',
    lineHeight: '36rpx',
    color: COLOR.chevron
  }
}
