import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { PageCurtain } from '../../components/page-curtain'
import { NavBar } from '../../components/nav-bar'
import { Stripe } from '../../components/stripe'
import { Input } from '@tarojs/components'
import { BigAction } from '../../components/big-action'
import { getReviewBatch, getUiPrefs, importBackup, inspectBackup, setReviewBatch, setUiPrefs, UiPrefs } from '../../store/storage'
import { describeBackupResult, exportBackupFile, pickBackupFile } from '../../utils/backup-file'
import { importAnyFile } from '../../utils/docimport'
import { COLOR, FONT_STACK, PRESS, RADIUS, SHADOW } from '../../theme'
import { bigNavBarHeightPx, bottomSafePx, rpxToPx } from '../../utils/metrics'

/**
 * 设置 · 操作
 *
 * 只放「怎么用手」，不放学习数据：
 * 惯用手决定主按钮落在哪个下角，字号影响卡片上的单词大小，震动只是手感。
 * 三项都即时写入本地缓存，回到翻卡页就生效。
 */
export default function SettingsScreen() {
  const [prefs, setPrefs] = useState<UiPrefs>(getUiPrefs)
  const [batchDraft, setBatchDraft] = useState<string>(() => String(getReviewBatch() || ''))
  const [importing, setImporting] = useState(false)
  /** 导出数据文件：进行中状态 + 结果文案（成功/失败都写这一行，不做 Toast） */
  const [exporting, setExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  /** 从文件导入恢复：进行中状态 */
  const [importingBackup, setImportingBackup] = useState(false)

  /**
   * 一键导出：把进度 / 生词 / 掌握 / 每日记录全部打成一个 JSON 文件。
   * 手机走「发到聊天」，PC 走「另存为」，都不行就退回剪贴板 —— 总之不能点了没反应。
   */
  const doExport = async () => {
    if (exporting) return
    setExporting(true)
    setExportNotice('正在打包…')
    const r = await exportBackupFile()
    setExporting(false)
    setExportNotice(describeBackupResult(r))
  }

  /**
   * 从文件导入（和导出配对）：从聊天记录里挑一份导出的 JSON，**覆盖式**恢复。
   * 先 `inspectBackup` 看清「这份里有什么」再问一次，避免手滑把当前进度洗掉。
   */
  const doImportFile = async () => {
    if (importingBackup) return
    setImportingBackup(true)
    const picked = await pickBackupFile()
    setImportingBackup(false)
    if (!picked) {
      setExportNotice('没选到文件（或这份文件读不出来）')
      return
    }
    const info = inspectBackup(picked.json)
    if (!info.ok) {
      setExportNotice(`导入失败：${info.message}`)
      return
    }
    Taro.showModal({
      title: '确认恢复',
      content: `${picked.name}\n${info.message}。恢复会覆盖当前的学习数据，确定吗？`,
      confirmText: '覆盖恢复',
      success: (r) => {
        if (!r.confirm) return
        const out = importBackup(picked.json)
        setExportNotice(out.ok ? `${out.message}，回到各页面就是恢复后的进度。` : `导入失败：${out.message}`)
      }
    })
  }

  /** 从聊天记录选文件导入词书；成功后直接跳到「我的上传」看结果 */
  const startImport = async () => {
    if (importing) return
    setImporting(true)
    const res = await importAnyFile()
    setImporting(false)
    if (res) Taro.navigateTo({ url: '/pages/uploads/index' })
  }

  const save = (patch: Partial<UiPrefs>) => {
    const next = setUiPrefs(patch)
    setPrefs(next)
    if (next.haptics) {
      try {
        Taro.vibrateShort({ type: 'light' })
      } catch {
        // 系统关掉了震动就静默跳过
      }
    }
  }

  /** 复习批次数：0 = 全部；非法输入退回原值 */
  const commitBatch = () => {
    const n = Math.max(0, Math.floor(Number(batchDraft) || 0))
    setReviewBatch(n)
    setBatchDraft(n > 0 ? String(n) : '全部')
  }

  const top = bigNavBarHeightPx(true) + rpxToPx(16)

  return (
    <View style={styles.container}>
      <PageCurtain label="设置" kicker="SETTINGS" />
      <NavBar title="设置" back big />
      <ScrollView scrollY style={styles.list}>
        <View style={{ paddingTop: `${top}px`, paddingBottom: `${bottomSafePx() + rpxToPx(32)}px` }}>
          {/* ── 头部：一句话说清这页管什么 ── */}
          <View style={{ ...styles.hero, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '60ms' }}>
            <Text style={styles.heroKicker}>OPERATION</Text>
            <Text style={styles.heroTitle}>怎么用更顺手</Text>
            <Text style={styles.heroSub}>这里只改操作方式，学习数据一个都不动。</Text>
            <Stripe tone="yellow" height={20} style={styles.heroStripe} />
          </View>

          {/* ── 惯用手 ── */}
          <View style={{ ...styles.section, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '150ms' }}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>惯用手</Text>
              <Text style={styles.sectionHint}>主按钮会换到这一侧的下角</Text>
            </View>
            <View style={styles.optionRow}>
              <View
                {...PRESS}
                style={{ ...styles.option, ...styles.optionGap, ...(prefs.hand === 'right' ? styles.optionOn : null) }}
                onClick={() => save({ hand: 'right' })}
              >
                <View style={{ ...styles.diagram, ...(prefs.hand === 'right' ? styles.diagramOn : null) }}>
                  <View style={{ ...styles.diagramDot, right: '8rpx' }} />
                </View>
                <Text style={prefs.hand === 'right' ? styles.optionTextOn : styles.optionText}>右手</Text>
              </View>
              <View
                {...PRESS}
                style={{ ...styles.option, ...(prefs.hand === 'left' ? styles.optionOn : null) }}
                onClick={() => save({ hand: 'left' })}
              >
                <View style={{ ...styles.diagram, ...(prefs.hand === 'left' ? styles.diagramOn : null) }}>
                  <View style={{ ...styles.diagramDot, left: '8rpx' }} />
                </View>
                <Text style={prefs.hand === 'left' ? styles.optionTextOn : styles.optionText}>左手</Text>
              </View>
            </View>
          </View>

          {/* ── 字号 ── */}
          <View style={{ ...styles.card, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '240ms' }}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>卡片字号</Text>
              <Text style={styles.sectionHint}>单词和释义一起变大</Text>
            </View>
            <View style={styles.preview}>
              <Text
                style={{
                  ...styles.previewWord,
                  ...(prefs.font === 'large' ? { fontSize: '96rpx', lineHeight: '108rpx' } : null)
                }}
              >
                penalty
              </Text>
              <Text style={styles.previewMeta}>/ ˈpenəlti / n. 罚款</Text>
            </View>
            <View style={styles.segRow}>
              <View
                {...PRESS}
                style={{ ...styles.segItem, ...styles.optionGap, ...(prefs.font === 'normal' ? styles.segOn : null) }}
                onClick={() => save({ font: 'normal' })}
              >
                <Text style={prefs.font === 'normal' ? styles.segTextOn : styles.segText}>标准</Text>
              </View>
              <View
                {...PRESS}
                style={{ ...styles.segItem, ...(prefs.font === 'large' ? styles.segOn : null) }}
                onClick={() => save({ font: 'large' })}
              >
                <Text style={prefs.font === 'large' ? styles.segTextOn : styles.segText}>大</Text>
              </View>
            </View>
          </View>

          {/* ── 震动 ── */}
          <View style={{ ...styles.card, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '320ms' }}>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.sectionTitle}>震动反馈</Text>
                <Text style={styles.switchHint}>每次判定轻轻震一下，关掉更安静</Text>
              </View>
              <View
                {...PRESS}
                style={prefs.haptics ? styles.switchOn : styles.switchOff}
                onClick={() => save({ haptics: !prefs.haptics })}
              >
                <View style={prefs.haptics ? styles.knobOn : styles.knobOff} />
              </View>
            </View>
          </View>

          {/* ── 自动发音 ── */}
          <View style={{ ...styles.card, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '380ms' }}>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.sectionTitle}>自动发音</Text>
                <Text style={styles.switchHint}>新卡出现就读一遍单词（需要联网）</Text>
              </View>
              <View
                {...PRESS}
                style={prefs.autoSpeak ? styles.switchOn : styles.switchOff}
                onClick={() => save({ autoSpeak: !prefs.autoSpeak })}
              >
                <View style={prefs.autoSpeak ? styles.knobOn : styles.knobOff} />
              </View>
            </View>
          </View>

          {/* ── 每次复习个数 ── */}
          <View style={{ ...styles.card, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '440ms' }}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>每次复习个数</Text>
              <Text style={styles.sectionHint}>填 0 = 一次全复习完</Text>
            </View>
            <View style={styles.batchRow}>
              <View style={styles.batchInput}>
                <Input
                  style={styles.batchInputInner}
                  type="number"
                  value={batchDraft}
                  placeholder="20"
                  placeholderStyle={`color: ${COLOR.secondary}`}
                  onInput={(e) => setBatchDraft(String(e.detail.value || ''))}
                  onBlur={commitBatch}
                />
                <Text style={styles.batchUnit}>个</Text>
              </View>
              {[10, 20, 30, 50].map((n) => (
                <View
                  key={n}
                  {...PRESS}
                  style={String(n) === batchDraft ? { ...styles.batchChip, ...styles.batchChipOn } : styles.batchChip}
                  onClick={() => {
                    setReviewBatch(n)
                    setBatchDraft(String(n))
                    if (prefs.haptics) {
                      try {
                        Taro.vibrateShort({ type: 'light' })
                      } catch {
                        // 忽略
                      }
                    }
                  }}
                >
                  <Text style={String(n) === batchDraft ? styles.batchChipTextOn : styles.batchChipText}>{n}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── 词书导入 ── */}
          <View style={{ ...styles.card, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '470ms' }}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>导入词书</Text>
              <Text style={styles.sectionHint}>docx / txt / csv / md · PDF 尽力提取</Text>
            </View>
            <View style={{ marginTop: '6rpx' }}>
              <BigAction
                label={importing ? '正在解析' : '从聊天记录选文件'}
                meta="选完自动建一本词书"
                onTap={startImport}
              />
            </View>
            <View
              {...PRESS}
              style={styles.manageRow}
              onClick={() => Taro.navigateTo({ url: '/pages/uploads/index' })}
            >
              <Text style={styles.manageText}>管理我的上传（粘贴导入 / 删除）→</Text>
            </View>
          </View>

          {/* ── 导出数据（2026-11 用户要求：一键导出进度和全部数据成文件）── */}
          <View style={{ ...styles.card, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '485ms' }}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>导出数据</Text>
              <Text style={styles.sectionHint}>JSON · 进度 / 生词 / 掌握 / 每日记录</Text>
            </View>
            <View style={{ marginTop: '6rpx' }}>
              <BigAction
                label={exporting ? '正在打包' : '一键导出数据文件'}
                meta="发到「文件传输助手」即可存到电脑"
                onTap={doExport}
              />
            </View>
            <View
              {...PRESS}
              style={styles.manageRow}
              onClick={doImportFile}
            >
              <Text style={styles.manageText}>{importingBackup ? '正在读取文件…' : '从文件导入恢复（选导出的 JSON）→'}</Text>
            </View>
            {exportNotice ? (
              <Text style={styles.exportNotice}>{exportNotice}</Text>
            ) : (
              <Text style={styles.exportNoticeQuiet}>
                换手机、清缓存、重装之前先导一次；文件里是这台手机上全部学习数据。
              </Text>
            )}
          </View>

          {/* ── 关于 ── */}
          <View style={{ ...styles.card, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '500ms' }}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>关于</Text>
              <Text style={styles.sectionHint}>单词君 v1.0</Text>
            </View>
            <Text style={styles.aboutText}>
              学习数据全部保存在本机，换手机前先到「学习数据」页导出备份。发音来自有道词典，需要联网。
            </Text>
          </View>

          <Text style={{ ...styles.foot, animation: 'riseIn 620ms cubic-bezier(.22,1,.36,1) backwards', animationDelay: '560ms' }}>设置即时保存，回到翻卡页就按新的来。</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles: Record<string, CSSProperties> = {
  container: {
    height: '100vh',
    backgroundColor: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: FONT_STACK.sans
  },
  list: {
    flex: 1,
    height: '100%'
  },

  hero: {
    marginLeft: '36rpx',
    marginRight: '36rpx',
    paddingLeft: '30rpx',
    paddingRight: '30rpx',
    paddingTop: '28rpx',
    paddingBottom: '42rpx',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '0rpx',
    backgroundColor: COLOR.teal,
    display: 'flex',
    flexDirection: 'column',
  },
  heroStripe: {
    position: 'absolute',
    left: '0rpx',
    right: '0rpx',
    bottom: '0rpx'
  },
  heroKicker: {
    fontSize: '18rpx',
    letterSpacing: '4rpx',
    color: 'rgba(251, 247, 236, 0.5)'
  },
  heroTitle: {
    marginTop: '12rpx',
    fontSize: '44rpx',
    lineHeight: '58rpx',
    fontWeight: '600',
    letterSpacing: '2rpx',
    color: COLOR.onDark
  },
  heroSub: {
    marginTop: '10rpx',
    fontSize: '21rpx',
    lineHeight: '32rpx',
    color: 'rgba(251, 247, 236, 0.55)'
  },

  section: {
    marginTop: '26rpx',
    marginLeft: '36rpx',
    marginRight: '36rpx',
    paddingLeft: '26rpx',
    paddingRight: '26rpx',
    paddingTop: '24rpx',
    paddingBottom: '26rpx',
    borderRadius: RADIUS.lg,
    backgroundColor: '#FBFAF3',
  },
  card: {
    marginTop: '18rpx',
    marginLeft: '36rpx',
    marginRight: '36rpx',
    paddingLeft: '26rpx',
    paddingRight: '26rpx',
    paddingTop: '24rpx',
    paddingBottom: '26rpx',
    borderRadius: RADIUS.lg,
    backgroundColor: '#FBFAF3',
    boxShadow: '0 10rpx 26rpx rgba(28, 56, 48, 0.06)'
  },
  sectionHead: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    fontSize: '30rpx',
    fontWeight: '600',
    letterSpacing: '1rpx',
    color: COLOR.text
  },
  sectionHint: {
    marginLeft: '18rpx',
    fontSize: '19rpx',
    color: COLOR.secondary
  },

  optionRow: {
    marginTop: '20rpx',
    display: 'flex',
    flexDirection: 'row'
  },
  option: {
    flex: 1,
    paddingTop: '20rpx',
    paddingBottom: '20rpx',
    borderRadius: '0rpx',
    backgroundColor: 'rgba(18, 49, 45, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  optionGap: {
    marginRight: '14rpx'
  },
  optionOn: {
    backgroundColor: COLOR.teal
  },
  optionText: {
    marginTop: '12rpx',
    fontSize: '26rpx',
    letterSpacing: '2rpx',
    color: COLOR.text
  },
  optionTextOn: {
    marginTop: '12rpx',
    fontSize: '26rpx',
    letterSpacing: '2rpx',
    fontWeight: '600',
    color: COLOR.onDark
  },
  // 小示意图：一块「屏幕」，右下 / 左下各放一颗圆点代表主按钮
  diagram: {
    position: 'relative',
    width: '88rpx',
    height: '60rpx',
    borderRadius: '12rpx',
    backgroundColor: 'rgba(18, 49, 45, 0.10)'
  },
  diagramOn: {
    backgroundColor: 'rgba(251, 247, 236, 0.22)'
  },
  diagramDot: {
    position: 'absolute',
    bottom: '8rpx',
    width: '22rpx',
    height: '22rpx',
    borderRadius: '11rpx',
    backgroundColor: COLOR.warm
  },

  preview: {
    marginTop: '20rpx',
    paddingTop: '10rpx',
    paddingBottom: '12rpx',
    display: 'flex',
    flexDirection: 'column'
  },
  previewWord: {
    fontFamily: FONT_STACK.serif,
    fontSize: '76rpx',
    lineHeight: '88rpx',
    letterSpacing: '-2rpx',
    color: COLOR.text
  },
  previewMeta: {
    marginTop: '6rpx',
    fontSize: '21rpx',
    color: COLOR.secondary
  },
  segRow: {
    marginTop: '16rpx',
    display: 'flex',
    flexDirection: 'row'
  },
  segItem: {
    flex: 1,
    height: '84rpx',
    borderRadius: '22rpx 22rpx 22rpx 6rpx',
    backgroundColor: 'rgba(18, 49, 45, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  segOn: {
    backgroundColor: COLOR.warm,
    boxShadow: '0 10rpx 22rpx rgba(210, 65, 29, 0.26)'
  },
  segText: {
    fontSize: '26rpx',
    letterSpacing: '2rpx',
    color: COLOR.text
  },
  segTextOn: {
    fontSize: '28rpx',
    letterSpacing: '3rpx',
    fontWeight: '700',
    color: '#FFF9F0'
  },

  switchRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  switchCopy: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  switchHint: {
    marginTop: '8rpx',
    fontSize: '20rpx',
    lineHeight: '30rpx',
    color: COLOR.secondary
  },
  switchOn: {
    width: '96rpx',
    height: '56rpx',
    borderRadius: '28rpx',
    backgroundColor: COLOR.teal,
    paddingLeft: '4rpx',
    paddingRight: '4rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  switchOff: {
    width: '96rpx',
    height: '56rpx',
    borderRadius: '28rpx',
    backgroundColor: 'rgba(18, 49, 45, 0.16)',
    paddingLeft: '4rpx',
    paddingRight: '4rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  knobOn: {
    width: '44rpx',
    height: '44rpx',
    borderRadius: '22rpx',
    backgroundColor: COLOR.marigold,
    boxShadow: SHADOW.float
  },
  knobOff: {
    width: '44rpx',
    height: '44rpx',
    borderRadius: '22rpx',
    backgroundColor: '#FBFAF3',
    boxShadow: SHADOW.float
  },

  batchRow: {
    marginTop: '18rpx',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  batchInput: {
    width: '150rpx',
    height: '72rpx',
    marginRight: '14rpx',
    paddingLeft: '18rpx',
    paddingRight: '12rpx',
    backgroundColor: 'rgba(18, 49, 45, 0.05)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center'
  },
  batchInputInner: {
    flex: 1,
    fontSize: '28rpx',
    fontWeight: '600',
    color: COLOR.text
  },
  batchUnit: {
    marginLeft: '6rpx',
    fontSize: '20rpx',
    color: COLOR.secondary
  },
  batchChip: {
    height: '64rpx',
    minWidth: '64rpx',
    marginRight: '10rpx',
    paddingLeft: '14rpx',
    paddingRight: '14rpx',
    borderRadius: '0rpx',
    backgroundColor: 'rgba(18, 49, 45, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  batchChipOn: {
    backgroundColor: COLOR.teal
  },
  batchChipText: {
    fontSize: '24rpx',
    color: COLOR.text
  },
  batchChipTextOn: {
    fontSize: '24rpx',
    fontWeight: '700',
    color: COLOR.onDark
  },
  manageRow: {
    marginTop: '4rpx',
    paddingTop: '18rpx',
    paddingBottom: '4rpx',
    display: 'flex',
    justifyContent: 'center'
  },
  manageText: {
    fontSize: '21rpx',
    letterSpacing: '1rpx',
    color: COLOR.secondary,
    textDecorationLine: 'underline'
  },
  aboutText: {
    marginTop: '14rpx',
    fontSize: '21rpx',
    lineHeight: '34rpx',
    color: COLOR.secondary
  },
  /** 导出结果那一行（成功也是它，失败也是它）—— 比说明文字重一档，用户能一眼看到「刚才发生了什么」 */
  exportNotice: {
    marginTop: '16rpx',
    fontSize: '22rpx',
    lineHeight: '34rpx',
    color: COLOR.text
  },
  /** 还没导出时的常驻说明 */
  exportNoticeQuiet: {
    marginTop: '16rpx',
    fontSize: '21rpx',
    lineHeight: '34rpx',
    color: COLOR.secondary
  },
  foot: {
    marginTop: '22rpx',
    marginLeft: '36rpx',
    marginRight: '36rpx',
    fontSize: '19rpx',
    lineHeight: '30rpx',
    color: COLOR.onGroundSoft
  }
}
