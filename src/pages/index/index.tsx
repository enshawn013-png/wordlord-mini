import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { ListRow } from '../../components/list-row'
import { NavBar } from '../../components/nav-bar'
import { PageHeader } from '../../components/page-header'
import { UPLOAD_GROUP_TITLE } from '../../data/words'
import { allBooks, archivedBooks, BookRef, bookWords, mainBookId, summarize, uploadSummary } from '../../store/books'
import { loadTodayCounts, removeUploadBook, setMainBookId } from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bigNavBarHeightPx, bottomSafePx, topGapPx } from '../../utils/metrics'

/**
 * 第二层：词书管理。「大学六级」+「我的上传」两处词表都在这一页。
 *
 * ⚠️ 2026-10：这一页**不再是启动页**了 —— 主界面（pages/home）成了封面/入口，
 * 这里是「点了背单词之后」进来的地方，所以：
 * - 导航栏改成 **big + back**（大标题「选择词书」+ 上方紧凑栏里的返回箭头）；
 *   品牌名「单词君」跟着主界面走了，这里只说这一页是干什么的；
 * - 顶部内边距用 `bigNavBarHeightPx(true)`（多了那条 88rpx 的返回栏）。
 *
 * ## 2026-11（R10）：这一页从「词书列表」变成「词书管理」
 *
 * 用户报的问题：「大学六级」（高频 323）和「我的上传」（高频 1008）的
 * **高频/中频/低频是两套定义**，两本一起算出来的数字对不上账。改成：
 *
 * 1. 全 app 只有一个**主词书**（`store/books.ts` 的 `mainBookId()`，默认大学六级）；
 *    统计（整体进度 / 三个词频档 / 计划 / 查词范围）只按它算；
 * 2. 其余词书折叠进「归档词书」，**默认收起**（不收起来就又是一屏卡片堆），
 *    展开后能「设为主词书」，上传的书还能删；
 * 3. 「我的上传」不再是列表里的一行书名 —— 它是一本本具体的词书，
 *    所以入口挪到归档区的尾巴上（上传 / 管理那些词表）。
 *
 * 排版照苹果「设置」页来：纯白底、顶部一个大标题、下面分区 + 一行行文字，
 * 每行右边一个灰色箭头——没有卡片、没有渐变、没有阴影、没有分割线、没有图标。
 * （分区标题用 24rpx 灰字，和 data 页同一套 —— 见 theme.ts 的 FONT.section。）
 */
export default function ShelfScreen() {
  const [revision, setRevision] = useState(0)
  /** 归档词书默认折叠（R10：「非主词书折叠进归档词书」） */
  const [archiveOpen, setArchiveOpen] = useState(false)

  // 从翻书页 / 上传页 / 档次页返回时重新读一次本地缓存
  useDidShow(() => setRevision((r) => r + 1))

  const today = loadTodayCounts()
  void revision
  const mainId = mainBookId()
  const main = summarize(bookWords(mainId))
  const mainTitle = allBooks().find((b) => b.main)?.title ?? ''
  const archived: BookRef[] = archivedBooks()
  const upload = uploadSummary()

  const openLevels = (id: string) => Taro.navigateTo({ url: `/pages/levels/index?bookId=${id}` })

  /** 设为主词书：当场说清「统计从此按这一本算」，这是这一页最重要的一次点击 */
  const makeMain = (book: BookRef) => {
    setMainBookId(book.id)
    setRevision((r) => r + 1)
    Taro.showToast({ title: `统计改按《${book.title}》算`, icon: 'none', duration: 2000 })
  }

  const removeBook = (book: BookRef) => {
    Taro.showModal({
      title: '删除这本词表',
      content: `《${book.title}》里的 ${book.count} 个词会被删掉，其它词书和标记进度不受影响。`,
      confirmText: '删除',
      confirmColor: COLOR.danger,
      success: (res) => {
        if (!res.confirm) return
        removeUploadBook(book.id)
        setRevision((r) => r + 1)
      }
    })
  }

  return (
    <View style={STYLE.container}>
      <PageCurtain label="词书" kicker="LIBRARY" />
      {/* 滚动内容从大标题底下穿过去（玻璃才糊得到东西），所以上面留出导航栏的高度 */}
      <ScrollView scrollY style={STYLE.list}>
        <View
          style={{
            // 大标题栏高度（含返回栏）+ 24rpx：顶部内容不许贴着导航栏
            paddingTop: `${bigNavBarHeightPx(true) + topGapPx()}px`,
            // 没有 Tab 栏，直接按底部安全高度收（≥48rpx 且避开 Home 指示条）
            paddingBottom: `${bottomSafePx()}px`
          }}
        >
          <PageHeader kicker="LIBRARY" title="词书" sub="换一本主词书，进度就按它算" />
{/* ---------- 主词书 ---------- */}
          <Text style={styles.section}>主词书</Text>
          <ListRow
            title={mainTitle}
            meta={`共 ${main.total} 词 · 还剩 ${main.remain} 词`}
            onOpen={() => openLevels(mainId)}
          />
          {/* 这句话是 R10 的核心约定，必须写在界面上（不然用户不知道为什么数字变少了） */}
          <Text style={styles.note}>
            高频 / 中频 / 低频、整体进度、计划和查词都只按这一本算。
            {archived.length > 0 ? '要换一本，展开下面的归档词书。' : ''}
          </Text>

          {/* ---------- 归档词书（默认折叠） ---------- */}
          <View {...PRESS} style={styles.archiveHead} onClick={() => setArchiveOpen((v) => !v)}>
            <Text style={styles.section}>
              归档词书{archived.length > 0 ? ` · ${archived.length} 本` : ''}
            </Text>
            <Text style={styles.archiveToggle}>{archiveOpen ? '收起 ⌃' : '展开 ⌄'}</Text>
          </View>

          {archived.length === 0 ? (
            <Text style={styles.note}>没有归档的词书。上传的 CSV 词表会出现在这里。</Text>
          ) : archiveOpen ? (
            <>
              {archived.map((book) => {
                const s = summarize(bookWords(book.id))
                return (
                  <ListRow
                    key={book.id}
                    title={book.title}
                    // 归档词书**只报词数**：它们的词频标签不参与统计，所以不在这里展示档位数字
                    meta={`共 ${s.total} 词 · 还剩 ${s.remain} 词 · 标签不参与统计`}
                    onOpen={() => openLevels(book.id)}
                    actions={[
                      { label: '设为主词书', onTap: () => makeMain(book) },
                      ...(book.builtin ? [] : [{ label: '删除', onTap: () => removeBook(book) }])
                    ]}
                  />
                )
              })}
            </>
          ) : (
            <Text style={styles.note}>已折叠。展开可以设为主词书、或者删掉不要的词表。</Text>
          )}

          {/* ---------- 上传入口（管理归档词书：导入 / 删除） ---------- */}
          <View {...PRESS} style={styles.manageRow} onClick={() => Taro.navigateTo({ url: '/pages/uploads/index' })}>
            <Text style={styles.manageText}>
              {UPLOAD_GROUP_TITLE}
              {upload.count > 0 ? ` · ${upload.count} 本 / ${upload.total} 词` : ' · 暂无'}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>

          {/* 今日统计跟着内容滚（以前钉在屏幕底部，会占掉一屏的留白） */}
          <View style={styles.todayBar}>
            {/*
              2026-10 改口径：把「背了多少词」放在最前面，和翻书页那颗
              「今日已背 N 个词」是同一个数字（storage 的 todayWords，**点过标记或「我会了」**的词，
              去重）—— 同一个词在两个页面上必须是同一个意思。
              后面两项是另两个口径，写清量词免得混：标记是**次数**（同一个词点三下算三下），
              翻页数说的是翻书页翻了几页。
            */}
            <Text style={styles.todayText}>
              今日：背了 {today.wordCount} 个词 · 标记 {today.markCount} 次 · 翻 {today.pageCount} 页
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* 大标题 + 返回（2026-10 起这一页是第二层：主界面 → 这里）。
          自定义导航栏没有系统返回按钮，所以返回箭头必须自己画，见 nav-bar.tsx */}
      <NavBar title="选择词书" big back />
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 分区标题：24rpx 灰字（和数据页同一套；改这里前先读 stats 页的六条纪律）
  section: {
    fontSize: FONT.section,
    color: COLOR.onGroundSoft,
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '48rpx',
    marginBottom: '4rpx'
  },
  /** 分区下面那句说明：22rpx，比分区标题轻一档，左右对齐到行内文字的那条线 */
  note: {
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '12rpx',
    fontSize: FONT.pageNo,
    lineHeight: '34rpx',
    color: COLOR.onGroundSoft
  },
  // 归档词书的折叠开关：整个标题行可点（热区 88rpx 靠上下 padding + 负外边距）
  archiveHead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '20rpx',
    paddingBottom: '20rpx',
    marginTop: '28rpx',
    marginBottom: '-16rpx'
  },
  archiveToggle: {
    marginRight: PAGE_PAD,
    fontSize: FONT.pageNo,
    color: COLOR.onGroundSoft
  },
  // 上传入口：一行文字 + 箭头，和行内文字同一条左基准线
  manageRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: PAGE_PAD,
    marginRight: PAGE_PAD,
    marginTop: '40rpx',
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    borderTopWidth: '1rpx',
    borderStyle: 'solid',
    borderColor: COLOR.track
  },
  manageText: {
    flex: 1,
    fontSize: FONT.meta,
    color: COLOR.onGroundSoft
  },
  chevron: {
    flexShrink: 0,
    marginLeft: '16rpx',
    fontSize: '34rpx',
    lineHeight: '34rpx',
    color: COLOR.chevron
  },
  todayBar: {
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD,
    paddingTop: '32rpx',
    paddingBottom: '32rpx'
  },
  todayText: {
    fontSize: '24rpx',
    color: COLOR.onGroundSoft
  }
}
