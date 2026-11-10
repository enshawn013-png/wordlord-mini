import Taro from '@tarojs/taro'
import { allBooks } from '../store/books'
import { setMainBookId } from '../store/storage'

/**
 * 「设置里指定当前主词书」（R10）的两处入口共用这一份选择逻辑：
 * 数据页「本地数据」那一节的主词书行，以及词书管理页的归档词书行。
 * 单独一个文件是为了**不让 store 层碰 UI**（books.ts / storage.ts 都是纯数据层）。
 *
 * ⚠️ `showActionSheet` 的 itemList **最多 6 项**（微信的硬限制，超了直接报错），
 * 所以词书超过 6 本时不再硬塞 ActionSheet，改成把用户送到词书管理页去选
 * ——「少显示几本」比「点了报错」糟得多。
 *
 * 返回值：选中的词书 id；取消 / 没变化 / 走了跳转都是 null。
 */
export async function pickMainBook(): Promise<string | null> {
  const books = allBooks()
  if (!books.length) return null

  if (books.length > 6) {
    Taro.showModal({
      title: '词书比较多',
      content: '在主词书 / 归档词书列表里点「设为主词书」就可以了。',
      confirmText: '去词书管理',
      success: (res) => {
        if (res.confirm) Taro.navigateTo({ url: '/pages/index/index' })
      }
    })
    return null
  }

  try {
    const res = await Taro.showActionSheet({
      itemList: books.map((b) => `${b.title}${b.main ? '（当前主词书）' : ''}`)
    })
    const chosen = books[res.tapIndex]
    if (!chosen || chosen.main) return null
    setMainBookId(chosen.id)
    return chosen.id
  } catch {
    // 取消：什么都不做
    return null
  }
}
