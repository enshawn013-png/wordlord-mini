import Taro from '@tarojs/taro'
import { exportBackup, inspectBackup } from '../store/storage'

/**
 * 一键导出「进度 + 全部学习数据」成一个 JSON 文件。
 *
 * 为什么要有这一层：`exportBackup()` 只返回字符串，原来只能复制到剪贴板——
 * 手机上粘来粘去很别扭，也没法直接存到电脑。这里把同一份内容写成**文件**，
 * 然后按环境依次尝试三种落地方式：
 *
 *   1. `shareFileMessage` —— 发到聊天（文件传输助手 / 自己的小号），手机和电脑都能收；
 *   2. `saveFileToDisk`   —— PC 端微信直接弹「另存为」；
 *   3. 写盘或分享失败      —— 退回剪贴板，保证拿得到东西（不能点了没反应）。
 *
 * 备份内容的格式和「复制到剪贴板」那条路径**完全一致**（`format: 1`），
 * 所以两种方式导出的东西可以互相恢复，不需要区分。
 */
export type BackupFileResult =
  | {
      ok: true
      path: string
      kb: number
      words: number
      mastered: number
      days: number
      how: 'share' | 'saved' | 'clipboard'
    }
  | { ok: false; message: string }

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export async function exportBackupFile(): Promise<BackupFileResult> {
  let json = ''
  try {
    json = exportBackup()
  } catch {
    return { ok: false, message: '读不到本地数据，退出重进再试' }
  }

  const info = inspectBackup(json)
  if (!info.ok) return { ok: false, message: info.message }

  const base = {
    kb: Math.max(1, Math.round(json.length / 1024)),
    words: info.words,
    mastered: info.mastered,
    days: info.days
  }

  const fileName = `wordlord-backup-${stamp()}.json`
  const path = `${Taro.env.USER_DATA_PATH}/${fileName}`

  try {
    Taro.getFileSystemManager().writeFileSync(path, json, 'utf8')
  } catch {
    // 写盘失败（存储满 / 权限）→ 剪贴板兜底
    return (await viaClipboard(json, base)) || { ok: false, message: '写文件和复制都失败了' }
  }

  // ① 发到聊天：手机上这是最顺手的一条（电脑微信也能收到同一个文件）
  const share = (Taro as unknown as { shareFileMessage?: (o: Record<string, unknown>) => void }).shareFileMessage
  if (typeof share === 'function') {
    try {
      await new Promise<void>((resolve, reject) => {
        share({ filePath: path, fileName, success: () => resolve(), fail: (e: unknown) => reject(e) })
      })
      return { ok: true, path, ...base, how: 'share' }
    } catch {
      // 用户取消 / 不支持就不算失败，继续往下走
    }
  }

  // ② PC 端直接另存为
  const save = (Taro as unknown as { saveFileToDisk?: (o: Record<string, unknown>) => void }).saveFileToDisk
  if (typeof save === 'function') {
    try {
      await new Promise<void>((resolve, reject) => {
        save({ filePath: path, success: () => resolve(), fail: (e: unknown) => reject(e) })
      })
      return { ok: true, path, ...base, how: 'saved' }
    } catch {
      // 同上
    }
  }

  // ③ 兜底：文件已经写好了（在本地沙箱里），再复制一份到剪贴板
  const fallback = await viaClipboard(json, base)
  if (fallback && fallback.ok) return { ok: true, path, ...base, how: 'clipboard' }
  return { ok: false, message: '文件已生成，但既发不出去也复制不了，请在电脑微信里重试' }
}

async function viaClipboard(
  json: string,
  base: { kb: number; words: number; mastered: number; days: number }
): Promise<BackupFileResult | null> {
  try {
    await Taro.setClipboardData({ data: json })
    return { ok: true, path: '', ...base, how: 'clipboard' }
  } catch {
    return null
  }
}

/** 给 UI 用的一句话结论 */
export function describeBackupResult(r: BackupFileResult): string {
  if (!r.ok) return `导出失败：${r.message}`
  const size = `${r.kb} KB`
  const what = `${r.words} 个生词 · ${r.mastered} 个已掌握 · ${r.days} 天记录`
  if (r.how === 'share') return `已生成 ${size} 的备份文件，发给「文件传输助手」就能存到电脑。（${what}）`
  if (r.how === 'saved') return `已保存 ${size} 的备份文件到你选的文件夹。（${what}）`
  return `已生成 ${size} 的备份内容并复制到剪贴板，粘到备忘录或微信收藏里存好。（${what}）`
}

/**
 * 从聊天记录里选一份导出的 JSON 备份，读回文本。
 *
 * 和导出严格配对：导出用 `shareFileMessage` 发到聊天，这里用 `chooseMessageFile`
 * 从聊天里挑回来，中间不需要数据线、不需要中转站。
 * 只挑 `.json`（`extension` 只是筛选建议，真伪仍由 `inspectBackup` 判定）。
 */
export async function pickBackupFile(): Promise<{ json: string; name: string } | null> {
  let picked: { path: string; name: string } | null = null
  try {
    const res = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['json'] })
    const f = res.tempFiles?.[0]
    if (!f) return null
    picked = { path: f.path, name: f.name || 'wordlord-backup.json' }
  } catch {
    // 用户点了取消 / 基础库不支持：都按"没选"处理，不要弹错误
    return null
  }
  try {
    const json = Taro.getFileSystemManager().readFileSync(picked.path, 'utf8')
    return { json: String(json), name: picked.name }
  } catch {
    return null
  }
}
