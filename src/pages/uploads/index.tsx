import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ListRow } from '../../components/list-row'
import { NavBar } from '../../components/nav-bar'
import { UPLOAD_GROUP_TITLE } from '../../data/words'
import { bookWords, summarize } from '../../store/books'
import { getUploadBooks, getMastered, removeUploadBook, UploadBookMeta } from '../../store/storage'
import { COLOR, STYLE } from '../../theme'
import { importCsvFromChat } from '../../utils/csv'

/** 点「我的上传」进来：自己导入的那几本词书 */
export default function UploadsScreen() {
  const [books, setBooks] = useState<UploadBookMeta[]>(() => getUploadBooks())
  const mastered = getMastered()

  const handleUpload = async () => {
    const result = await importCsvFromChat()
    if (!result) return
    setBooks(getUploadBooks())
    Taro.navigateTo({ url: `/pages/levels/index?bookId=${result.book.id}` })
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

  return (
    <View style={STYLE.container}>
      <NavBar title={UPLOAD_GROUP_TITLE} back />

      {books.length === 0 ? (
        <View style={STYLE.empty}>
          <Text style={STYLE.emptyText}>
            暂无上传。CSV 的列顺序是 word,phonetic,pos,definition，导入后会自动分好高频 / 中频 / 低频。
          </Text>
        </View>
      ) : (
        <ScrollView scrollY style={STYLE.list}>
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
        </ScrollView>
      )}

      <View style={STYLE.footerBar}>
        <View style={STYLE.primaryBtn} onClick={handleUpload}>
          <Text style={STYLE.primaryBtnText}>上传 CSV 词表</Text>
        </View>
      </View>
    </View>
  )
}
