import { Text, View } from '@tarojs/components'
import { COLOR, FONT, FONT_STACK, PRESS, STYLE } from '../theme'

/** 行内小字的统一字号（避免直接依赖调用方的 FONT 值） */
const FONT_PAGE_META = FONT.meta

/**
 * 列表行：左边标题 + 次要说明，右边灰色箭头（苹果设置页那种），
 * 箭头左边可以再塞一个或多个红色文字操作（「设为主词书」「删除」）。
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
  action,
  actions
}: {
  title: string
  meta: string
  onOpen: () => void
  action?: { label: string; onTap: () => void }
  /**
   * 行尾可以有**多个**文字操作（R10 的归档词书行要「设为主词书 + 删除」两个）。
   * 它们和 `action` 一样是文字区的兄弟节点，所以点操作不会顺带把行点开。
   */
  actions?: { label: string; onTap: () => void }[]
}) {
  const ops = actions && actions.length ? actions : action ? [action] : []
  return (
    <View className="rise" style={styles.row}>
      <View {...PRESS} style={styles.rowText} onClick={onOpen}>
        {/* text-break：书名可能是用户传的文件名，长串不许冲出卡片（见 app.css） */}
        <Text className="text-break" style={styles.rowTitle}>
          {title}
        </Text>
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      {ops.map((op) => (
        <View key={op.label} {...PRESS} style={styles.rowAction} onClick={op.onTap}>
          <Text style={styles.rowActionText}>{op.label}</Text>
        </View>
      ))}
      <View {...PRESS} style={styles.rowChevron} onClick={onOpen}>
        <Text style={styles.rowChevronText}>→</Text>
      </View>
    </View>
  )
}

const styles = {
  // 海报化的行：不再套白卡，直接排在底色上，一条细线分隔
  row: {
    ...STYLE.row,
    marginLeft: '0rpx',
    marginRight: '0rpx',
    marginTop: '0rpx',
    paddingLeft: '36rpx',
    paddingRight: '36rpx',
    paddingTop: '26rpx',
    paddingBottom: '26rpx',
    borderBottom: '2rpx solid rgba(255, 243, 228, 0.16)'
  },
  rowTitle: {
    fontFamily: FONT_STACK.cn,
    fontSize: '40rpx',
    lineHeight: '52rpx',
    fontWeight: '700',
    letterSpacing: '1rpx',
    color: COLOR.onGround
  },
  rowMeta: {
    marginTop: '6rpx',
    fontSize: FONT_PAGE_META,
    lineHeight: '32rpx',
    letterSpacing: '1rpx',
    color: COLOR.onGroundSoft
  },
  rowActionText: {
    fontSize: FONT_PAGE_META,
    color: COLOR.marigold,
    textDecorationLine: 'underline'
  },
  rowChevronText: {
    fontSize: '30rpx',
    color: COLOR.marigold
  },
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
