import { Text, View } from '@tarojs/components'
import { PRESS, STYLE } from '../theme'

/**
 * 列表行：左边标题 + 次要说明，右边灰色箭头（苹果设置页那种），
 * 箭头左边可以再塞一个红色文字操作（「删除」）。
 *
 * 2026-09-28 起每行是一张**玻璃卡片**（app.css 的 `.glass .glass-card`）：
 * 半透明白底 + 圆角 24rpx + 极细的白色高光边 + 极淡投影，行与行之间留 16rpx 的缝。
 * 卡片里没有分割线。
 *
 * 可点的是文字区/箭头而不是整行——「删除」是它们的兄弟节点而不是子节点，
 * 这样点删除不会顺带把行也点开，不依赖 stopPropagation。
 *
 * 2026-10 复核补了两件事：
 * - **按下态**（PRESS）：原来整页点什么都毫无反馈，触屏上这是最明显的「塑料感」来源；
 * - **热区**：文字区原来只有 70rpx 高、箭头 68rpx、删除链接 48rpx，都不到 88rpx。
 *   做法是给它们加垂直 padding，再用**同样大小的负外边距**还回布局 ——
 *   卡片高度一点没变，热区都到了 88rpx。
 */
export function ListRow({
  title,
  meta,
  onOpen,
  action
}: {
  title: string
  meta: string
  onOpen: () => void
  action?: { label: string; onTap: () => void }
}) {
  return (
    <View className="glass glass-card" style={STYLE.row}>
      <View {...PRESS} style={styles.rowText} onClick={onOpen}>
        {/* text-break：书名可能是用户传的文件名，长串不许冲出卡片（见 app.css） */}
        <Text className="text-break" style={STYLE.rowTitle}>
          {title}
        </Text>
        {meta ? <Text style={STYLE.rowMeta}>{meta}</Text> : null}
      </View>
      {action ? (
        <View {...PRESS} style={styles.rowAction} onClick={action.onTap}>
          <Text style={STYLE.rowActionText}>{action.label}</Text>
        </View>
      ) : null}
      <View {...PRESS} style={styles.rowChevron} onClick={onOpen}>
        <Text style={STYLE.rowChevronText}>›</Text>
      </View>
    </View>
  )
}

const styles = {
  // STYLE.rowText 只给了 flex 布局，这里把热区补到 88rpx（多出来的 18rpx 用负外边距还回去）
  rowText: {
    ...STYLE.rowText,
    paddingTop: '9rpx',
    paddingBottom: '9rpx',
    marginTop: '-9rpx',
    marginBottom: '-9rpx'
  },
  rowAction: {
    ...STYLE.rowAction,
    paddingTop: '28rpx',
    paddingBottom: '28rpx',
    marginTop: '-20rpx',
    marginBottom: '-20rpx'
  },
  rowChevron: {
    ...STYLE.rowChevron,
    paddingTop: '26rpx',
    paddingBottom: '26rpx',
    marginTop: '-10rpx',
    marginBottom: '-10rpx'
  }
}
