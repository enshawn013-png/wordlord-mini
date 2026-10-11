import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { NavBar } from '../../components/nav-bar'
import { TabBar } from '../../components/tab-bar'
import { getReviewBatch, getVocabPool, setReviewBatch } from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { navBarHeightPx, rpxToPx, tabBarHeightPx, topGapPx } from '../../utils/metrics'

/**
 * 生词本（底部 Tab 栏第二个）。
 *
 * ⚠️ **2026-10 起这一页不再显示任何单词**（用户明确要求）：它是「复习设置 + 入口」页 ——
 * 生词库是**藏着**的，等用户确定这次复习几个，才在翻开复习页的那一刻从库里挑词。
 * 想看词有两个去处（都在这一页的入口里）：
 * - 「复习记录」：按标记 7~1 分档，点进某一档看这一档的**全部单词**，还带随机抽查（主入口）
 * - 「查看全部生词」：**小字、不显眼**（用户要求），一次性列出整个生词库
 *
 * 「这次复习几个」是**输入框**（用户要求可以填任意个数），旁边给几个常用数字当快捷键。
 * 0 / 留空 = 全部。填的数字存本地（`wordlord_state_v3.reviewBatch`），下次进来还是它。
 *
 * 挑词的规则在 storage.pickReviewBatch()：**优先刚在翻书页标记过的词**。
 */

/** 常用数量的快捷胶囊；「全部」= 0（输入框留空） */
const PRESETS = [10, 20, 50]

export default function VocabSetupScreen() {
  const [total, setTotal] = useState<number>(() => getVocabPool().length)
  const [batch, setBatch] = useState<number>(() => getReviewBatch())
  const [draft, setDraft] = useState<string>(() => {
    const n = getReviewBatch()
    return n > 0 ? String(n) : ''
  })

  // 从翻书页 / 全部生词 / 复习页回来时，词数可能变了（标记、掌握、移除都会动它）
  useDidShow(() => setTotal(getVocabPool().length))

  /** 记住这次填的数（0 = 全部） */
  const applyBatch = (n: number) => {
    setBatch(n)
    setReviewBatch(n)
  }

  const handleInput = (e: { detail: { value: string } }) => {
    const raw = String(e.detail.value || '')
      .replace(/[^\d]/g, '')
      .slice(0, 4)
    setDraft(raw)
    applyBatch(raw === '' ? 0 : Number(raw))
  }

  /** 失焦时把输入框和真实值对齐（比如填了 0 / 空 → 显示成留空 + 占位「全部」） */
  const commitInput = () => {
    if (draft === '' || Number(draft) === 0) {
      setDraft('')
      applyBatch(0)
    }
  }

  const choosePreset = (n: number) => {
    setDraft(n > 0 ? String(n) : '')
    applyBatch(n)
  }

  // 这一批实际会复习几个：填了 50 但库里只剩 8 个，就说 8 个
  const reviewSize = batch === 0 ? total : Math.min(batch, total)

  const startReview = () => {
    Taro.navigateTo({ url: `/pages/review/index?size=${batch}` })
  }

  const openReviewLog = () => {
    Taro.navigateTo({ url: '/pages/review-log/index' })
  }

  const openAllWords = () => {
    Taro.navigateTo({ url: '/pages/vocab-all/index' })
  }

  const navH = navBarHeightPx()
  const tabH = tabBarHeightPx()

  return (
    <View style={STYLE.container}>
      {total === 0 ? (
        // 库里一个词都没有：这一页没有任何可设置的东西，直接给空状态
        <View style={{ ...STYLE.empty, paddingBottom: `${tabH}px` }}>
          <Text style={STYLE.emptyText}>
            生词库还是空的。在翻书页看到不会的词，点右边圆圈标记它，它就会进到这里。
          </Text>
        </View>
      ) : (
        <ScrollView scrollY style={STYLE.list}>
          <View
            style={{
              paddingTop: `${navH + topGapPx()}px`,
              paddingBottom: `${tabH + rpxToPx(24)}px`
            }}
          >
            {/* ---------- 复习设置卡 ---------- */}
            <View className="glass glass-card" style={styles.card}>
              <Text style={styles.cardTitle}>生词库</Text>
              <Text style={styles.cardMeta}>共 {total} 个词</Text>

              <View style={styles.inputRow}>
                <View style={styles.inputBox}>
                  <Input
                    style={styles.input}
                    type="number"
                    value={draft}
                    placeholder="全部"
                    placeholderStyle="color: #C7C7CC"
                    onInput={handleInput}
                    onBlur={commitInput}
                  />
                </View>
                <Text style={styles.inputUnit}>个</Text>
              </View>

              {/* 常用数量：点一下就填进去（输入框还是可以随便改） */}
              <View style={styles.chipRow}>
                {PRESETS.map((n) => {
                  const on = batch === n
                  return (
                    <View
                      key={n}
                      {...PRESS}
                      className={on ? undefined : 'glass glass-pill'}
                      style={{ ...styles.chip, ...(on ? styles.chipOn : null) }}
                      onClick={() => choosePreset(n)}
                    >
                      <Text style={on ? styles.chipOnText : styles.chipText}>{n}</Text>
                    </View>
                  )
                })}
                <View
                  {...PRESS}
                  className={batch === 0 ? undefined : 'glass glass-pill'}
                  style={{ ...styles.chip, ...(batch === 0 ? styles.chipOn : null) }}
                  onClick={() => choosePreset(0)}
                >
                  <Text style={batch === 0 ? styles.chipOnText : styles.chipText}>全部</Text>
                </View>
              </View>

              <View {...PRESS} style={styles.startBtn} onClick={startReview}>
                <Text style={styles.startBtnText}>开始复习 {reviewSize} 个</Text>
              </View>
              <Text style={styles.hint}>优先挑刚标记过的词</Text>
            </View>

            {/* ---------- 主入口：复习记录（按标记分档 + 随机抽查） ---------- */}
            <View {...PRESS} className="glass glass-card" style={styles.row} onClick={openReviewLog}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>复习记录</Text>
                <Text style={styles.rowMeta}>按标记分档 · 可随机抽查</Text>
              </View>
              <View style={styles.chevron}>
                <Text style={styles.chevronText}>›</Text>
              </View>
            </View>

            {/*
              小字入口：一次性看全部生词。用户明确要求「小一点、不那么明显」——
              所以它是灰色小字，不是卡片、不带箭头，摆在最下面。
            */}
            <View {...PRESS} style={styles.allLink} onClick={openAllWords}>
              <Text style={styles.allLinkText}>查看全部生词（{total}）›</Text>
            </View>
          </View>
        </ScrollView>
      )}

      <NavBar title="生词本" back />
      <TabBar active="vocab" />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 复习设置卡：标题 + 词数 + 数量输入 + 快捷胶囊 + 开始按钮 + 一行小字说明
  card: {
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    display: 'flex',
    flexDirection: 'column'
  },
  cardTitle: {
    fontSize: '32rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  cardMeta: {
    marginTop: '8rpx',
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  label: {
    marginTop: '32rpx',
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  // 输入框 +「个」：输入框是浅灰底的小方块，居中留白，方便点
  inputRow: {
    marginTop: '16rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  inputBox: {
    width: '220rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: '16rpx',
    paddingRight: '16rpx',
    paddingTop: '16rpx',
    paddingBottom: '16rpx',
    borderRadius: '24rpx',
    backgroundColor: COLOR.fill
  },
  input: {
    flex: 1,
    height: '40rpx',
    fontSize: '32rpx',
    lineHeight: '40rpx',
    color: COLOR.text,
    textAlign: 'center'
  },
  inputUnit: {
    marginLeft: '16rpx',
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  chipRow: {
    marginTop: '20rpx',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  chip: {
    minWidth: '88rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '16rpx',
    paddingLeft: '24rpx',
    paddingRight: '24rpx',
    paddingTop: '12rpx',
    paddingBottom: '12rpx',
    borderRadius: '26rpx'
  },
  chipOn: {
    backgroundColor: COLOR.black
  },
  chipText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  chipOnText: {
    fontSize: FONT.meta,
    color: COLOR.onDark
  },
  // 主操作：黑底胶囊（和翻页条的「下一页」同一套语气，主操作不玻璃化）
  startBtn: {
    marginTop: '32rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    borderRadius: '44rpx',
    backgroundColor: COLOR.black
  },
  startBtnText: {
    fontSize: FONT.definition,
    color: COLOR.onDark
  },
  hint: {
    marginTop: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary,
    textAlign: 'center'
  },

  // 复习记录那行：普通列表行（玻璃卡片 + 右边灰色箭头）
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
  },

  // 不起眼的小字入口：灰字、居中、没有卡片
  allLink: {
    marginTop: '32rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '16rpx',
    paddingBottom: '16rpx'
  },
  allLinkText: {
    fontSize: FONT.meta,
    color: COLOR.secondary
  }
}
