import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { NavBar } from '../../components/nav-bar'
import { PageHeader } from '../../components/page-header'
import { bookTitle, bookWords, mainBookId } from '../../store/books'
import { addUploadBook, getReviewDue, incrementMark, ReviewDue } from '../../store/storage'
import { Band, bandOf, Word } from '../../data/words'
import { COLOR, FONT, FONT_STACK, PAGE_PAD, PRESS, STYLE } from '../../theme'

/** 最近搜索的本地存储 key */
const RECENT_KEY = 'wordlord_recent_searches'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx } from '../../utils/metrics'

/**
 * 查词（R5）：**从首页一行「查词」进来，一次点击就开始打字**。
 *
 * ## 为什么是独立一页，而不是首页上直接摆一个输入框
 *
 * 首页的规矩是「一屏不滚动、只留要动手的事」（见 pages/home 的文件头），顶部已经要放
 * 总进度 + 倒计时 + 今日待办（R8）——再塞一个输入框，封面就变成工具页了。
 * 而「从首页到开始搜索不超过 1 次点击」这条要求，一个可点的行就能满足：
 * 点进来输入框**自动聚焦**，键盘直接弹起来，用户不需要再点一下输入框。
 *
 * ## 搜索顺序（需求原文）
 *
 * 1. **先在当前主词书（内置六级 1824 词）里精确匹配** → 命中就把那张词卡亮出来（`hit`）；
 * 2. 没精确命中就列**前缀/包含匹配**（最多 `LIST_MAX` 条，先按「开头是它」再按字母序）；
 * 3. 一个都没有 → 给建词入口：英文 + 中文释义，点「加入生词本」直接进生词本
 *    （自建词条落在「我的上传」下的一本《查词建词》里，所以生词本/复习页/闪卡都能反查到它）。
 *
 * ⚠️ 自建词**不复制**已有的六级词条：表内词直接标记（不建），否则生词本里会出现两条同名记录。
 */

/** 结果列表最多列几条：Taro 的 ScrollView 不虚拟化，一屏挂太多节点会卡（和 vocab-all 的分批同理） */
const LIST_MAX = 20

/**
 * 自建词条落在哪本书里。
 *
 * 为什么不新加一个「自建词」存储：`wordIndex()`（storage.ts）只认**内置词表 + 上传词书**
 * 两个来源，另起一份存储就得改所有反查路径。挂进「我的上传」是最小改动，
 * 而且语义也对得上 —— 用户自己造的词本来就是他自己的词表。
 */
export const SEARCH_BOOK_TITLE = '查词建词'

/** 要不要在搜索框下方显示「上一次进来的」到期复习数（和首页/数据页同一口径） */
type Mode = 'result' | 'form'

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const [hit, setHit] = useState<Word | null>(null)
  const [mode, setMode] = useState<Mode>('result')
  /** 建词表单：英文用 draft 的当前输入（用户多半就是搜不到才来的），释义手填 */
  const [draftWord, setDraftWord] = useState('')
  const [draftDef, setDraftDef] = useState('')
  const [created, setCreated] = useState<Word | null>(null)
  const [notice, setNotice] = useState('')
  /** 最近查过的词：最多 6 个，存本地（不进云同步） */
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const v = Taro.getStorageSync(RECENT_KEY)
      return Array.isArray(v) ? v.slice(0, 6) : []
    } catch {
      return []
    }
  })
  /** 复习到期（和首页/数据页同一个来源，只用来在这页顶部给一句上下文） */
  const [due, setDue] = useState<ReviewDue>(() => getReviewDue())

  // 从生词本/复习页回来，到期数可能变了
  useDidShow(() => setDue(getReviewDue()))

  const keyword = query.trim()
  const lower = keyword.toLowerCase()

  /**
   * 在**当前主词书**里匹配（R10）：整本，不限档次 ——
   * 用户说「先在当前主词书内匹配」，指的是设置里那一本（默认是 1824 词的大学六级），
   * 不是他上次翻到的那一档。换过主词书之后，这里查的就是换过的那本。
   */
  const mainId = mainBookId()
  const book = bookWords(mainId)
  const exact = lower ? book.find((w) => w.word.toLowerCase() === lower) ?? null : null
  const rest = lower
    ? book
        .filter((w) => {
          if (w.word.toLowerCase() === lower) return false
          return w.word.toLowerCase().includes(lower)
        })
        .sort((a, b) => {
          const sa = a.word.toLowerCase().startsWith(lower) ? 0 : 1
          const sb = b.word.toLowerCase().startsWith(lower) ? 0 : 1
          return sa - sb || a.word.localeCompare(b.word)
        })
        .slice(0, LIST_MAX)
    : []

  const pool = [exact, ...rest].filter(Boolean) as Word[]
  /** 用户点过某一行 → 把那一行升成「命中的词卡」（列表还在，词卡在最上面） */
  const shown = hit ?? exact

  // 查到词就记一笔「最近搜索」：去重、最新的在最前、最多留 6 个
  useEffect(() => {
    if (!shown?.word) return
    setRecent((prev) => {
      const next = [shown.word, ...prev.filter((w) => w.toLowerCase() !== shown.word.toLowerCase())].slice(0, 6)
      try {
        Taro.setStorageSync(RECENT_KEY, next)
      } catch {
        // 写不进去只影响这个列表，不影响查词
      }
      return next
    })
  }, [shown?.word])

  const openForm = () => {
    setMode('form')
    setDraftWord(keyword)
    setDraftDef('')
    setNotice('')
  }

  const submit = () => {
    const w = draftWord.trim()
    const d = draftDef.trim()
    if (!w) return
    // 已经在词表里（用户可能手打了一个表内词）：不建，直接给他那张卡
    const existed = book.find((x) => x.word.toLowerCase() === w.toLowerCase())
    if (existed) {
      setMode('result')
      setQuery(existed.word)
      setHit(existed)
      return
    }
    const added = addUploadBook(SEARCH_BOOK_TITLE, [{ word: w, phonetic: '', pos: '', definition: d }])
    if (!added) {
      setNotice('写入失败：本地缓存可能满了。先去数据页做一次备份，再删掉几本不用的上传词书。')
      return
    }
    // 加入生词本 = 标记一次（生词本的定义就是 markCount > 0）
    incrementMark(w)
    setCreated({ word: w, phonetic: '', pos: '', definition: d })
    setMode('result')
    setQuery(w)
    setNotice('')
  }

  const openVocab = () => Taro.navigateTo({ url: '/pages/vocab/index' })

  const navH = navBarHeightPx()
  const barH = rpxToPx(112) + bottomSafePx()

  return (
    <View style={STYLE.container}>
      <PageCurtain label="查词" kicker="LOOK UP" />
      <ScrollView scrollY style={STYLE.list}>
        <View
          style={{
            paddingTop: `${navH + topGapPx()}px`,
            paddingBottom: `${mode === 'form' ? barH : bottomSafePx() + rpxToPx(24)}px`
          }}
        >
          <PageHeader kicker="LOOK UP" title="查词" sub="输入英文就开始匹配，词表里没有的可以自己建一条" />
{/* ---------- 搜索框：autofocus，进来就能打字（= 「不超过 1 次点击」） ---------- */}
          <View style={styles.searchWrap}>
            <View style={styles.inputBox}>
              <Text style={styles.inputIcon}>⌕</Text>
              <Input
                style={styles.input}
                value={query}
                placeholder="输入英文单词"
                placeholderStyle={`color: ${COLOR.secondary}`}
                confirmType="search"
                // 进来就弹键盘：从首页「查词」那一行点进来，落地即可打字
                focus
                onInput={(e) => {
                  setQuery(String(e.detail.value || ''))
                  setHit(null)
                  setCreated(null)
                  if (mode !== 'result') setMode('result')
                }}
              />
            </View>
            <Text style={styles.scope}>在主词书「{bookTitle(mainId)}」里查</Text>

            {!query && recent.length > 0 ? (
              <View style={styles.recentWrap}>
                <Text style={styles.recentLabel}>最近查过</Text>
                <View style={styles.recentChips}>
                  {recent.map((w) => (
                    <View
                      key={w}
                      {...PRESS}
                      style={styles.recentChip}
                      onClick={() => {
                        setQuery(w)
                        setMode('result')
                        const found = book.find((x) => x.word.toLowerCase() === w.toLowerCase())
                        setHit(found ?? null)
                        setCreated(null)
                      }}
                    >
                      <Text style={styles.recentChipText}>{w}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {/* ---------- 命中：一张词卡（释义是主角，和「先考你」的列表相反） ---------- */}
          {mode === 'result' && shown ? (
            <View className="glass glass-card" style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardLabel}>{created ? '已加入生词本' : '词表里有这个'}</Text>
                <Text style={styles.band}>{bandLabel(bandOf(shown.word))}</Text>
              </View>
              <Text className="text-break" style={styles.word}>
                {shown.word}
              </Text>
              {[shown.phonetic, shown.pos].filter(Boolean).length ? (
                <Text style={styles.meta}>{[shown.phonetic, shown.pos].filter(Boolean).join('  ')}</Text>
              ) : null}
              <Text className="text-break" style={styles.definition}>
                {shown.definition}
              </Text>
              {/* 建词成功后就地给一条去生词本的路（反馈长在界面里，不弹 Toast） */}
              {created ? (
                <View {...PRESS} style={styles.secondaryBtn} onClick={openVocab}>
                  <Text style={styles.secondaryBtnText}>去生词本看它</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* ---------- 表外词：建词入口 ---------- */}
          {mode === 'result' && keyword && !pool.length && !created ? (
            <View className="glass glass-card" style={styles.card}>
              <Text style={styles.cardLabel}>词表里没有「{keyword}」</Text>
              <Text style={styles.meta}>
                自建一条：填英文和中文释义，存下来就直接进生词本，复习页也能考它。
              </Text>
              <View {...PRESS} style={styles.secondaryBtn} onClick={openForm}>
                <Text style={styles.secondaryBtnText}>建这个词</Text>
              </View>
            </View>
          ) : null}

          {/* ---------- 模糊匹配列表 ---------- */}
          {mode === 'result' && rest.length ? (
            <>
              <Text style={styles.listTitle}>
                {exact ? `还有 ${rest.length} 个相近的` : `匹配到 ${rest.length} 个`}
              </Text>
              {rest.map((w) => (
                <View
                  key={w.word}
                  {...PRESS}
                  className="glass glass-card"
                  style={styles.row}
                  onClick={() => setHit(w)}
                >
                  <View style={styles.rowText}>
                    <Text className="text-break" style={styles.rowWord}>
                      {w.word}
                    </Text>
                    {[w.phonetic, w.pos].filter(Boolean).length ? (
                      <Text style={styles.rowMeta}>{[w.phonetic, w.pos].filter(Boolean).join('  ')}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
              ))}
            </>
          ) : null}

          {/* ---------- 空态：还没输入时的一句引导，不抒情 ---------- */}
          {mode === 'result' && !keyword ? (
            <View style={styles.intro}>
              <Text style={styles.introKicker}>WORD / SEARCH</Text>
              <Text style={styles.introTitle}>Look it up.</Text>
              <Text style={styles.introText}>
                输入英文就开始匹配。词表里没有的词可以自己建一条，建完直接进生词本。
              </Text>
              {due.due > 0 ? (
                <Text style={styles.introText}>今天还有 {due.due} 个词到期要复习。</Text>
              ) : null}
            </View>
          ) : null}

          {/* ---------- 建词表单 ---------- */}
          {mode === 'form' ? (
            <View className="glass glass-card" style={styles.card}>
              <Text style={styles.cardTitle}>新建词条</Text>
              <Text style={styles.fieldLabel}>英文</Text>
              <View style={styles.fieldBox}>
                <Input
                  style={styles.fieldInput}
                  value={draftWord}
                  placeholder="例如 meticulous"
                  placeholderStyle={`color: ${COLOR.secondary}`}
                  onInput={(e) => setDraftWord(String(e.detail.value || ''))}
                />
              </View>
              <Text style={styles.fieldLabel}>中文释义</Text>
              <View style={{ ...styles.fieldBox, ...styles.fieldBoxTall }}>
                <Textarea
                  style={styles.fieldTextarea}
                  value={draftDef}
                  placeholder="例如 一丝不苟的；极仔细的"
                  placeholderStyle={`color: ${COLOR.secondary}`}
                  maxlength={120}
                  onInput={(e) => setDraftDef(String(e.detail.value || ''))}
                />
              </View>
              {/* 反馈长在界面里，不用 Toast（微信 Toast 超过 7 个汉字就折行） */}
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* 表单的底部操作条：玻璃条 + 黑底主按钮（和上传页同一套语气） */}
      {mode === 'form' ? (
        <View
          className="glass glass-bar-bottom"
          style={{ ...STYLE.bottomBar, paddingBottom: `${bottomSafePx()}px` }}
        >
          <View style={styles.barInner}>
            <View
              {...PRESS}
              style={{ ...styles.barBtn, ...styles.barBtnGhost }}
              onClick={() => setMode('result')}
            >
              <Text style={styles.barBtnText}>取消</Text>
            </View>
            <View
              {...PRESS}
              style={{
                ...styles.barBtn,
                ...styles.barBtnMain,
                ...(draftWord.trim() ? null : STYLE.disabledBtn)
              }}
              onClick={submit}
            >
              <Text style={{ ...styles.barBtnText, color: COLOR.onDark }}>加入生词本</Text>
            </View>
          </View>
        </View>
      ) : null}

      <NavBar title="查词" back />
    </View>
  )
}

/** 词频档的中文名（数据页用的是 LEVELS 的 label，这里只要档位这一个词） */
function bandLabel(b: Band): string {
  if (b === 'high') return '高频'
  if (b === 'mid') return '中频'
  return '低频'
}

const styles: Record<string, CSSProperties> = {
  // ---------- 搜索框 ----------
  searchWrap: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD
  },
  // 编辑排版：不画框，只有一条奶油色下划线
  inputBox: {
    background: 'transparent',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: '96rpx',
    paddingLeft: '4rpx',
    paddingRight: '4rpx',
    borderRadius: '0rpx',
    borderBottomWidth: '3rpx',
    borderBottomStyle: 'solid',
    borderBottomColor: 'rgba(255, 243, 228, 0.4)'
  },
  inputIcon: {
    flexShrink: 0,
    marginRight: '12rpx',
    fontSize: '32rpx',
    lineHeight: '36rpx',
    color: COLOR.secondary
  },
  input: {
    flex: 1,
    height: '48rpx',
    fontSize: FONT.definition,
    lineHeight: '48rpx',
    color: COLOR.text
  },
  recentWrap: {
    marginTop: '20rpx'
  },
  recentLabel: {
    fontSize: '18rpx',
    letterSpacing: '3rpx',
    color: COLOR.onGroundSoft
  },
  recentChips: {
    marginTop: '12rpx',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  recentChip: {
    marginRight: '12rpx',
    marginBottom: '12rpx',
    paddingLeft: '22rpx',
    paddingRight: '22rpx',
    paddingTop: '12rpx',
    paddingBottom: '12rpx',
    borderRadius: '0rpx 24rpx 0rpx 24rpx',
    backgroundColor: 'rgba(255, 243, 228, 0.12)'
  },
  recentChipText: {
    fontFamily: FONT_STACK.serif,
    fontSize: '24rpx',
    color: COLOR.onGround
  },
  scope: {
    marginTop: '12rpx',
    fontSize: FONT.pageNo,
    color: COLOR.onGroundSoft,
  },

  // ---------- 词卡 ----------
  card: {
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '24rpx',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    paddingTop: '32rpx',
    paddingBottom: '32rpx',
    display: 'flex',
    flexDirection: 'column'
  },
  cardHead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardLabel: {
    flex: 1,
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  band: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: FONT.pageNo,
    color: COLOR.secondary
  },
  word: {
    marginTop: '12rpx',
    fontFamily: FONT_STACK.serif,
    fontSize: '56rpx',
    lineHeight: '68rpx',
    fontWeight: '400',
    letterSpacing: '-1rpx',
    color: COLOR.text
  },
  meta: {
    marginTop: '8rpx',
    fontSize: FONT.meta,
    lineHeight: '34rpx',
    color: COLOR.secondary
  },
  definition: {
    marginTop: '16rpx',
    fontSize: FONT.definition,
    lineHeight: '44rpx',
    color: COLOR.body
  },
  // ---------- 模糊匹配列表 ----------
  listTitle: {
    marginTop: '32rpx',
    marginBottom: '4rpx',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    fontSize: FONT.section,
    color: COLOR.secondary
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '16rpx',
    paddingLeft: '32rpx',
    paddingRight: '32rpx',
    // 一行 ≥88rpx 热区（上下各 28rpx + 文字行高）
    paddingTop: '28rpx',
    paddingBottom: '28rpx'
  },
  rowText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  rowWord: {
    fontSize: FONT.word,
    fontWeight: '600',
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
    fontSize: '36rpx',
    lineHeight: '36rpx',
    color: COLOR.chevron
  },

  // ---------- 空态引导 ----------
  intro: {
    marginTop: '52rpx',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    paddingTop: '28rpx',
    borderTop: `2rpx solid ${COLOR.text}`,
    display: 'flex',
    flexDirection: 'column'
  },
  introKicker: {
    fontSize: '18rpx',
    lineHeight: '26rpx',
    letterSpacing: '3rpx',
    color: COLOR.marigold,
  },
  introTitle: {
    marginTop: '12rpx',
    fontFamily: FONT_STACK.serif,
    fontSize: '72rpx',
    lineHeight: '82rpx',
    fontWeight: '400',
    letterSpacing: '-2rpx',
    color: COLOR.onGround,
  },
  introText: {
    marginTop: '16rpx',
    marginBottom: '8rpx',
    fontSize: FONT.meta,
    lineHeight: '38rpx',
    color: COLOR.onGroundSoft,
  },

  // ---------- 建词表单 ----------
  cardTitle: {
    fontSize: '32rpx',
    fontWeight: '700',
    color: COLOR.text
  },
  fieldLabel: {
    marginTop: '24rpx',
    fontSize: FONT.meta,
    color: COLOR.secondary
  },
  fieldBox: {
    marginTop: '12rpx',
    paddingLeft: '20rpx',
    paddingRight: '20rpx',
    paddingTop: '16rpx',
    paddingBottom: '16rpx',
    borderRadius: '8rpx',
    backgroundColor: COLOR.fill
  },
  fieldBoxTall: {
    paddingTop: '20rpx',
    paddingBottom: '20rpx'
  },
  fieldInput: {
    height: '44rpx',
    fontSize: FONT.definition,
    lineHeight: '44rpx',
    color: COLOR.text
  },
  fieldTextarea: {
    width: '100%',
    height: '120rpx',
    fontSize: FONT.definition,
    lineHeight: '44rpx',
    color: COLOR.text
  },
  notice: {
    marginTop: '16rpx',
    fontSize: FONT.pageNo,
    lineHeight: '32rpx',
    color: COLOR.dangerText
  },
  // 建词入口的次要按钮（浅灰底黑字，和上传页的次要按钮同款）
  secondaryBtn: {
    marginTop: '24rpx',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '24rpx',
    paddingBottom: '24rpx',
    borderRadius: '8rpx',
    backgroundColor: COLOR.fill
  },
  secondaryBtnText: {
    fontSize: FONT.definition,
    color: COLOR.text
  },

  // ---------- 底部操作条 ----------
  barInner: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '16rpx'
  },
  barBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    borderRadius: '8rpx'
  },
  barBtnGhost: {
    marginRight: '16rpx',
    backgroundColor: COLOR.fill
  },
  barBtnMain: {
    backgroundColor: COLOR.black
  },
  barBtnText: {
    fontSize: FONT.definition,
    color: COLOR.text
  }
}
