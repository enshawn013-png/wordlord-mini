import { Text, View } from '@tarojs/components'
import { STYLE } from '../theme'

/**
 * 列表行：左边标题 + 次要说明，右边灰色箭头（苹果设置页那种），
 * 箭头左边可以再塞一个红色文字操作（「删除」）。
 *
 * 不画分割线，靠上下留白分行；行高约 100rpx。
 * 可点的是文字区/箭头而不是整行——「删除」是它们的兄弟节点而不是子节点，
 * 这样点删除不会顺带把行也点开，不依赖 stopPropagation。
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
    <View style={STYLE.row}>
      <View style={STYLE.rowText} onClick={onOpen}>
        <Text style={STYLE.rowTitle}>{title}</Text>
        {meta ? <Text style={STYLE.rowMeta}>{meta}</Text> : null}
      </View>
      {action ? (
        <View style={STYLE.rowAction} onClick={action.onTap}>
          <Text style={STYLE.rowActionText}>{action.label}</Text>
        </View>
      ) : null}
      <View style={STYLE.rowChevron} onClick={onOpen}>
        <Text style={STYLE.rowChevronText}>›</Text>
      </View>
    </View>
  )
}
