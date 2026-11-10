import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { Chip } from '../../components/chip'
import { NavBar } from '../../components/nav-bar'
import { TabBar } from '../../components/tab-bar'
import { PageHeader } from '../../components/page-header'
import { getLevelSpread } from '../../store/storage'
import { BigAction } from '../../components/big-action'
import { Stripe } from '../../components/stripe'
import { getReviewBatch, getReviewDue, getVocabPool, REVIEW_BATCH_DEFAULT, ReviewDue, setReviewBatch, shortDate } from '../../store/storage'
import { COLOR, FONT, FONT_STACK, PAGE_PAD, PRESS, STYLE } from '../../theme'
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
 * 挑词的规则在 `storage.pickReviewBatch()`：**先到期的（间隔重复算出来的），
 * 没到期的沿用老规矩「最近标记过的优先」**。
 *
 * 2026-10 第七轮补了两件事：
 * 1. 卡片上直接写清**今天有几个词到期**（逾期几个），并给一颗「到期 N」快捷键 ——
 *    以前这一页只有「共 45 个词」，用户不知道该复习多少；现在默认答案就在手边；
 * 2. 三处输入框的 `placeholderStyle` 原来是硬编码的 `#C7C7CC`（在浅灰底上 **1.51:1**，
 *    几乎看不见），换成 `COLOR.secondary`（4.49:1）—— 这是全站唯一低于 4.5:1 的文字。
 */

/**
 * 常用数量的快捷胶囊；「全部」= 0（输入框留空）。
 *
 * ⚠️ 2026-11（R7）：原来第一项是 10。现在**默认一批 20**（`REVIEW_BATCH_DEFAULT`），
 * 所以快捷数字从 20 起，少的那些用输入框自己填 —— 快捷胶囊是「常用值」，
 * 不该把已经不作默认的 10 摆在最顺手的位置。
 */
const PRESETS = [20, 30, 50]

export default function VocabSetupScreen() {
  const [total, setTotal] = useState<number>(() => getVocabPool().length)
  const [due, setDue] = useState<ReviewDue>(() => getReviewDue())
  const [batch, setBatch] = useState<number>(() => getReviewBatch())
  const [draft, setDraft] = useState<string>(() => {
    const n = getReviewBatch()
    return n > 0 ? String(n) : ''
  })

  // 从翻书页 / 全部生词 / 复习页回来时，词数和到期数都可能变了
  useDidShow(() => {
    setTotal(getVocabPool().length)
    setDue(getReviewDue())
  })

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

  /**
   * 这一批实际会复习几个（R7 的一处修正）：**有到期的词就先按到期数收敛**。
   *
   * 原来只按 `total` 收敛，于是「今天只有 15 个到期」时按钮写「开始复习 20 个」，
   * 点进去却只有 15 个 —— 数字和事实对不上。现在到期数 > 0 时以到期数为准；
   * 没有到期的词时按库里的词数兜底（那正是「随便复习几个」的用法）。
   */
  const dueBatch = Math.min(batch > 0 ? batch : REVIEW_BATCH_DEFAULT, due.due)
  const reviewSize = due.due > 0 ? dueBatch : batch === 0 ? total : Math.min(batch, total)

  /**
   * 真的开考时用的 size。
   *
   * ⚠️ 「全部」(`batch === 0`) 在这一页仍然要能走通（用户明确要求可以填任意个数 / 全部），
   * 所以有到期词时把 size 收敛到这一批（免得复习页又变成「一次推 62 个」的旧行为），
   * 没到期词时才把 0 原样传下去（复习页收到 0 = 全部）。
   */
  const startSize = due.due > 0 ? reviewSize : batch

  const startReview = () => {
    Taro.navigateTo({ url: `/pages/review/index?size=${startSize}` })
  }

  /**
   * 点「今日复习 N」：在**已有的快捷胶囊里**选一颗 —— 不小于今天的到期数、但最省力的那颗。
   *
   * 为什么不直接把 batch 设成到期数（比如 15）：那样会选出一颗界面里根本不存在的胶囊，
   * 所有胶囊都不高亮，用户看不出「现在选中了什么」。全部预设都盖不住时选「全部」。
   */
  const chooseDueBatch = () => {
    const cover = PRESETS.filter((n) => n >= dueBatch)[0]
    choosePreset(cover === undefined ? 0 : cover)
  }

  const openReviewLog = () => {
    Taro.navigateTo({ url: '/pages/review-log/index' })
  }

  const spread = getLevelSpread()
  const spreadMax = Math.max(1, ...spread)
  const levelColors = ['#F0B23F', '#E9A03A', '#E08A34', '#D9732C', '#D25B24', '#CE4A1E', '#B8340F']
  const openLevel = (lv: number) => {
    if (spread[lv - 1] === 0) return
    Taro.navigateTo({ url: `/pages/review-level/index?level=${lv}` })
  }
  const openAllWords = () => {
    Taro.navigateTo({ url: '/pages/vocab-all/index' })
  }

  const navH = navBarHeightPx()
  const tabH = tabBarHeightPx()

  return (
    <View style={STYLE.container}>
      <PageCurtain label="生词本" kicker="VOCABULARY" />
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
            <PageHeader kicker="VOCABULARY" title="生词本" sub="标记过的词都收在这里，按到期顺序复习" />

            {/* ---------- 今天到期：巨数字当版面主角 ---------- */}
            <View style={styles.hero}>
              <View style={styles.heroHead}>
                <Text style={styles.heroLabel}>今天到期</Text>
                <Text style={styles.heroAside}>DUE TODAY</Text>
              </View>
              <View style={styles.heroNumRow}>
                <Text style={styles.heroNum}>{due.due}</Text>
                <View style={styles.heroUnitCol}>
                  <Text style={styles.heroUnit}>个词</Text>
                  <Text style={styles.heroSub}>约 {Math.max(1, Math.round(due.due / 5))} 分钟背完</Text>
                </View>
              </View>
              <View style={styles.heroRule} />
            </View>
{/* ---------- 复习设置卡 ---------- */}
            <View className="glass glass-card" style={styles.card}>
              <Text style={styles.cardTitle}>复习设置</Text>
              <Text style={styles.cardMeta}>
                共 {total} 个词
                {due.due > 0
                  ? ` · 今天 ${due.due} 个到期，先复习 ${dueBatch} 个`
                  : due.nextDate
                    ? ` · 下次 ${shortDate(due.nextDate)} 有 ${due.nextCount} 个到期`
                    : ''}
              </Text>

              <View style={styles.inputRow}>
                <View style={styles.inputBox}>
                  <Input
                    style={styles.input}
                    type="number"
                    value={draft}
                    placeholder="全部"
                    // 占位符的灰色原来写死 #C7C7CC：在 COLOR.fill 的浅灰底上只有 **1.51:1**，
                    // 几乎等于没写（小字要求 ≥4.5:1）。换成次要文字色，实测 4.49:1。
                    placeholderStyle={`color: ${COLOR.secondary}`}
                    onInput={handleInput}
                    onBlur={commitInput}
                  />
                </View>
                <Text style={styles.inputUnit}>个</Text>
              </View>

              {/* 常用数量：点一下就填进去（输入框还是可以随便改）。
                  第一颗是**今日优先**（R7）：把这一批定成到期词里最该复习的 Top N，
                  点它不会把今天全部到期的词一次性推给复习页。
                  热区由 components/chip.tsx 保证 88rpx（原来是 50rpx，只有 25pt） */}
              <View style={styles.chipRow}>
                {due.due > 0 ? (
                  <Chip
                    label={`今日复习 ${dueBatch}`}
                    // 高亮的是「这一次够不够覆盖今天的到期词」：填 20 而今天只有 15 个到期时
                    // 也点亮 —— 用户一眼看出「今天的量已经排在这一次里了」
                    on={batch === 0 || batch >= dueBatch}
                    onClick={chooseDueBatch}
                    style={styles.chip}
                  />
                ) : null}
                {PRESETS.map((n) => (
                  <Chip
                    key={n}
                    label={String(n)}
                    on={batch === n}
                    onClick={() => choosePreset(n)}
                    style={styles.chip}
                  />
                ))}
                <Chip label="全部" on={batch === 0} onClick={() => choosePreset(0)} style={styles.chip} />
              </View>

              <Text style={styles.hint}>
                先出今天到期的词；到期里按等级从低到高，1 级最接近掌握、先考它。点一次「认识」降一级，降到 0 级就进「熟练掌握词汇」
              </Text>
            </View>

            {/* ---------- 主入口：复习记录（按标记分档 + 随机抽查） ---------- */}
            <View {...PRESS} className="glass glass-card" style={styles.row} onClick={openReviewLog}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>复习记录</Text>
                <Text style={styles.rowMeta}>7 级 → 1 级 · 可随机抽查</Text>
              </View>
              <View style={styles.chevron}>
                <Text style={styles.chevronText}>›</Text>
              </View>
            </View>

            {/* ---------- 等级尺：1 级（快掌握）到 7 级（完全不认识）---------- */}
            <View style={styles.levels}>
              <View style={styles.levelsHead}>
                <Text style={styles.levelsTitle}>等级分布</Text>
                <Text style={styles.levelsHint}>
                  {spread[6] > 0 ? `${spread[6]} 个在 7 级 · 明天还会再来` : '1 级快掌握 · 7 级完全不认识'}
                </Text>
              </View>
              <View style={styles.levelBars}>
                {spread.map((n, i) => {
                  const lv = i + 1
                  const h = n > 0 ? Math.max(Math.round((n / spreadMax) * 116), 8) : 6
                  return (
                    <View key={lv} style={styles.levelCol} onClick={() => openLevel(lv)}>
                      <Text style={styles.levelCount}>{n > 0 ? n : ''}</Text>
                      <View
                        style={{
                          ...styles.levelBar,
                          height: `${h}rpx`,
                          backgroundColor: n > 0 ? levelColors[i] : 'rgba(18, 49, 45, 0.12)',
                          transformOrigin: 'bottom center',
                          animation: `barGrow 560ms cubic-bezier(.22,1,.36,1) ${240 + i * 55}ms backwards`
                        }}
                      />
                      <Text style={lv <= 2 ? { ...styles.levelLabel, ...styles.levelLabelHot } : styles.levelLabel}>{lv}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            <Stripe tone="red" height={22} style={{ marginTop: '16rpx' }} />

            {/* ---------- 两块纯色：把下半屏填满，数字当图形 ---------- */}
            <View style={styles.blocks}>
              <View style={styles.blockYellow}>
                <Text style={styles.blockLabelDark}>库里的词</Text>
                <Text style={styles.blockNumDark}>{total}</Text>
              </View>
              <View style={styles.blockRed}>
                <Text style={styles.blockLabelLight}>今天到期</Text>
                <Text style={styles.blockNumLight}>{due.due}</Text>
              </View>
            </View>

            {/*
              小字入口：一次性看全部生词。用户明确要求「小一点、不那么明显」——
              所以它是灰色小字，不是卡片、不带箭头，摆在最下面。
            */}
            <View {...PRESS} style={styles.allLink} onClick={openAllWords}>
              <Text style={styles.allLinkText}>查看全部生词（{total}）›</Text>
            </View>

            {/* ---------- 主操作：贴底、跟手、叶形 ---------- */}
            <BigAction label="开始复习" meta={`${reviewSize} 个词`} onTap={startReview} />
          </View>
        </ScrollView>
      )}

      <NavBar title="生词本" back />
      <TabBar active="vocab" />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  levels: {
    marginTop: '16rpx',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingLeft: '24rpx',
    paddingRight: '24rpx',
    paddingTop: '20rpx',
    paddingBottom: '16rpx',
    backgroundColor: '#FBFAF3'
  },
  levelsHead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between'
  },
  levelsTitle: {
    fontFamily: FONT_STACK.cn,
    fontSize: '30rpx',
    fontWeight: '700',
    letterSpacing: '1rpx',
    color: COLOR.text
  },
  levelsHint: {
    fontSize: '18rpx',
    letterSpacing: '1rpx',
    color: COLOR.secondary
  },
  levelBars: {
    marginTop: '18rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  levelCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  levelCount: {
    fontSize: '18rpx',
    lineHeight: '24rpx',
    color: COLOR.secondary
  },
  levelBar: {
    width: '60%',
    marginTop: '4rpx'
  },
  levelLabel: {
    marginTop: '8rpx',
    fontSize: '18rpx',
    color: COLOR.secondary
  },
  levelLabelHot: {
    color: COLOR.warm,
    fontWeight: '700'
  },

  hero: {
    position: 'relative',
    overflow: 'hidden',
    marginLeft: '36rpx',
    marginRight: '36rpx',
    marginTop: '18rpx',
    paddingLeft: '32rpx',
    paddingTop: '22rpx',
    paddingBottom: '26rpx',
    borderBottom: '2rpx solid rgba(255, 243, 228, 0.22)'
  },
  heroHead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  heroLabel: {
    fontSize: '20rpx',
    letterSpacing: '6rpx',
    color: COLOR.onGroundSoft
  },
  heroAside: {
    fontSize: '14rpx',
    letterSpacing: '2rpx',
    color: 'rgba(255, 243, 228, 0.34)'
  },
  heroNumRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  heroNum: {
    marginLeft: '-12rpx',
    fontSize: '188rpx',
    lineHeight: '176rpx',
    fontWeight: '800',
    letterSpacing: '-10rpx',
    color: COLOR.marigold
  },
  heroUnitCol: {
    marginLeft: '14rpx',
    marginBottom: '16rpx',
    display: 'flex',
    flexDirection: 'column'
  },
  heroUnit: {
    fontSize: '30rpx',
    lineHeight: '40rpx',
    fontWeight: '600',
    letterSpacing: '4rpx',
    color: COLOR.onDark
  },
  heroSub: {
    marginTop: '4rpx',
    fontSize: '19rpx',
    color: COLOR.onGroundSoft
  },
  heroRule: {
    marginTop: '18rpx',
    height: '1rpx',
    backgroundColor: 'rgba(255, 243, 228, 0.16)'
  },

  blocks: {
    marginTop: '16rpx',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    display: 'flex',
    flexDirection: 'row'
  },
  blockYellow: {
    flex: 1,
    height: '188rpx',
    marginRight: '4rpx',
    paddingLeft: '24rpx',
    paddingTop: '18rpx',
    backgroundColor: COLOR.marigold,
    display: 'flex',
    flexDirection: 'column'
  },
  blockRed: {
    flex: 1,
    height: '188rpx',
    paddingLeft: '24rpx',
    paddingTop: '18rpx',
    backgroundColor: COLOR.warm,
    display: 'flex',
    flexDirection: 'column'
  },
  blockLabelDark: {
    fontSize: '18rpx',
    letterSpacing: '4rpx',
    color: 'rgba(23, 21, 15, 0.6)'
  },
  blockNumDark: {
    marginTop: '16rpx',
    fontSize: '86rpx',
    lineHeight: '88rpx',
    fontWeight: '800',
    letterSpacing: '-4rpx',
    color: COLOR.text
  },
  blockLabelLight: {
    fontSize: '18rpx',
    letterSpacing: '4rpx',
    color: 'rgba(255, 249, 240, 0.68)'
  },
  blockNumLight: {
    marginTop: '16rpx',
    fontSize: '86rpx',
    lineHeight: '88rpx',
    fontWeight: '800',
    letterSpacing: '-4rpx',
    color: '#FFF9F0'
  },

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
    borderRadius: '8rpx',
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
  // 胶囊之间的间距（视觉与热区都在 components/chip.tsx 里定死）
  chip: {
    marginRight: '16rpx'
  },
  // 主操作：黑底胶囊（和翻页条的「下一页」同一套语气，主操作不玻璃化）
  // 斜切的硬边按钮：和首页那个平行四边形箭头同一个语汇
  startBtn: {
    marginTop: '30rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '36rpx',
    paddingBottom: '36rpx',
    borderRadius: '0rpx',
    backgroundColor: COLOR.ink,
    transform: 'skewX(-9deg)'
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

  // 不起眼的小字入口：灰字、居中、没有卡片。
  // 热区 88rpx（上下各 32rpx 内边距 + 负外边距还回布局）—— 视觉还是那行小字
  allLink: {
    marginTop: '16rpx',
    marginBottom: '-16rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '32rpx',
    paddingBottom: '32rpx'
  },
  allLinkText: {
    fontSize: FONT.meta,
    color: COLOR.onGroundSoft,
    textDecorationLine: 'underline'
  }
}
