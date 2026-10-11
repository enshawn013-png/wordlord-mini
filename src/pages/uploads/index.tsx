import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ListRow } from '../../components/list-row'
import { NavBar } from '../../components/nav-bar'
import { UPLOAD_GROUP_TITLE } from '../../data/words'
import { bookWords, summarize } from '../../store/books'
import { getUploadBooks, getMastered, removeUploadBook, UploadBookMeta } from '../../store/storage'
import { COLOR, FONT, PAGE_PAD, PRESS, STYLE } from '../../theme'
import { bottomSafePx, navBarHeightPx, rpxToPx, topGapPx } from '../../utils/metrics'
import { importCsvFromChat, importPastedText } from '../../utils/csv'

/**
 * 「我的上传」：自己导入的那几本词书。两种导入方式——
 * 1. 从微信聊天记录里选 CSV 文件；
 * 2. 手动粘贴（一词一行，逗号分隔 word,phonetic,pos,definition）。
 * 导入成功后留在本页，让新词书出现在列表里，并提示「导入成功，共 N 个词」。
 */
export default function UploadsScreen() {
  const [books, setBooks] = useState<UploadBookMeta[]>(() => getUploadBooks())
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const mastered = getMastered()

  // 悬浮元素的高度，用来给内容留内边距（玻璃要能糊到滚过去的内容，就得让内容从底下穿）
  const navH = navBarHeightPx()
  // 底部玻璃条：上内边距 16rpx + 两个按钮各 104rpx（32 + 40 + 32）+ 中间 16rpx
  // + 底部安全高度（≥48rpx，全面屏还要盖住 Home 指示条）
  const footerH = rpxToPx(16 + 104 + 16 + 104) + bottomSafePx()
  const bodyBottom = footerH + rpxToPx(16)

  const handleUpload = async () => {
    const result = await importCsvFromChat()
    if (!result) return
    setBooks(getUploadBooks())
  }

  const handlePasteImport = () => {
    const text = pasteText.trim()
    if (!text) {
      Taro.showToast({ title: '先把词表粘贴进来', icon: 'none' })
      return
    }
    const result = importPastedText(text)
    if (!result) return
    setPasteText('')
    setPasteMode(false)
    setBooks(getUploadBooks())
  }

  const handleDelete = (book: UploadBookMeta) => {
    Taro.showModal({
      title: '删除这本词表',
      content: `《${book.title}》里的 ${book.count} 个词会被删掉，内置词库和标记进度不受影响。`,
      confirmText: '删除',
      confirmColor: COLOR.danger,
      success: (res) => {
        if (res.confirm) {
          removeUploadBook(book.id)
          setBooks(getUploadBooks())
        }
      }
    })
  }

  const body = pasteMode ? (
    <View
      style={{
        ...styles.pasteWrap,
        paddingTop: `${navH + topGapPx()}px`,
        paddingBottom: `${bodyBottom}px`
      }}
    >
      <Text style={styles.pasteHint}>一词一行，逗号分隔，格式：word,phonetic,pos,definition</Text>
      <View className="glass glass-card" style={styles.pasteBox}>
        <Textarea
          style={styles.pasteTextarea}
          value={pasteText}
          onInput={(e) => setPasteText(e.detail.value)}
          maxlength={-1}
          placeholder={'abandon,/əˈbændən/,v.,放弃；抛弃\naccommodate,/əˈkɒmədeɪt/,v.,容纳；适应'}
          placeholderStyle="color: #C7C7CC"
        />
      </View>
    </View>
  ) : books.length === 0 ? null : (
    <ScrollView scrollY style={STYLE.list}>
      <View style={{ paddingTop: `${navH}px`, paddingBottom: `${bodyBottom}px` }}>
        {books.map((book) => {
          const { total, remain } = summarize(bookWords(book.id), mastered)
          return (
            <ListRow
              key={book.id}
              title={book.title}
              meta={`共 ${total} 词 · 还剩 ${remain} 词`}
              onOpen={() => Taro.navigateTo({ url: `/pages/levels/index?bookId=${book.id}` })}
              action={{ label: '删除', onTap: () => handleDelete(book) }}
            />
          )
        })}
      </View>
    </ScrollView>
  )

  return (
    <View style={STYLE.container}>
      {books.length === 0 && !pasteMode ? (
        // 空状态不进滚动区：靠 STYLE.empty 的 flex:1 在整屏里居中
        <View style={{ ...STYLE.empty, paddingBottom: `${footerH}px` }}>
          <Text style={STYLE.emptyText}>
            暂无上传。CSV 的列顺序是 word,phonetic,pos,definition，导入后会自动分好高频 / 中频 / 低频。
          </Text>
        </View>
      ) : (
        body
      )}

      <NavBar title={UPLOAD_GROUP_TITLE} back />

      {/* 底部两个按钮浮在内容上面，做成一条玻璃：单词表会从它底下滚过去 */}
      <View className="glass glass-bar-bottom" style={STYLE.bottomBar}>
        {/* 底部内边距换成安全高度：≥48rpx，全面屏上还要盖住 Home 指示条 */}
        <View style={{ ...STYLE.footerBar, paddingBottom: `${bottomSafePx()}px` }}>
          {pasteMode ? (
            <>
              <View {...PRESS} style={STYLE.primaryBtn} onClick={handlePasteImport}>
                <Text style={STYLE.primaryBtnText}>导入</Text>
              </View>
              <View
                {...PRESS}
                style={{ ...STYLE.secondaryBtn, marginTop: '16rpx' }}
                onClick={() => setPasteMode(false)}
              >
                <Text style={STYLE.secondaryBtnText}>取消</Text>
              </View>
            </>
          ) : (
            <>
              <View {...PRESS} style={STYLE.primaryBtn} onClick={handleUpload}>
                <Text style={STYLE.primaryBtnText}>上传 CSV 词表</Text>
              </View>
              <View
                {...PRESS}
                style={{ ...STYLE.secondaryBtn, marginTop: '16rpx' }}
                onClick={() => setPasteMode(true)}
              >
                <Text style={STYLE.secondaryBtnText}>手动粘贴词表</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  // 上下内边距是算出来的（避开悬浮的导航栏和底部按钮条），写在 JSX 里
  pasteWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: PAGE_PAD,
    paddingRight: PAGE_PAD
  },
  pasteHint: {
    fontSize: FONT.meta,
    lineHeight: '36rpx',
    color: COLOR.secondary
  },
  // 输入框：**不写行内边框/底色**——行内样式会盖掉 .glass-card 的边框和半透明底，
  // 圆角、细边、投影都由 class 给
  pasteBox: {
    marginTop: '16rpx',
    flex: 1,
    padding: '24rpx'
  },
  pasteTextarea: {
    width: '100%',
    height: '100%',
    fontSize: FONT.definition,
    lineHeight: '44rpx',
    color: COLOR.text
  }
}
