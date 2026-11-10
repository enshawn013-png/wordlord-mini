import Taro from '@tarojs/taro'

/**
 * 统一的「选一个文件 + 读内容」入口，微信小程序和 H5 / iOS 壳都能用。
 *
 * 为什么需要：微信里选文件只能从聊天记录挑（`chooseMessageFile`），
 * 而在 H5 / Capacitor 壳里那个 API 不存在 —— 直接用就永远弹不出选择器，
 * 用户看到的是「点了没反应」。H5 侧改用浏览器的 `<input type="file">`，
 * 走系统文件选择器（iOS 上是「照片 / 文件」那套面板）。
 *
 * 对上层的接口保持平台无关：拿到的是 `readText()` / `readArrayBuffer()`，
 * 调用方不需要知道自己跑在哪个端。
 */
export type PickedFile = {
  name: string
  /** 微信端的临时路径；H5 是空串（内容在 File 对象里） */
  path: string
  readText: () => Promise<string>
  readArrayBuffer: () => Promise<ArrayBuffer>
}

const IS_H5 = process.env.TARO_ENV === 'h5'

/** 浏览器端：造一个隐藏 input，点它，等 change */
function pickInBrowser(accept: string): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;opacity:0;'
    let settled = false

    const done = (v: PickedFile | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(v)
    }

    input.addEventListener('change', () => {
      const file = input.files && input.files[0]
      if (!file) return done(null)
      done({
        name: file.name || 'file',
        path: '',
        readText: () =>
          new Promise<string>((res, rej) => {
            const fr = new FileReader()
            fr.onload = () => res(String(fr.result ?? ''))
            fr.onerror = () => rej(new Error('读取文件失败'))
            fr.readAsText(file, 'utf-8')
          }),
        readArrayBuffer: () =>
          new Promise<ArrayBuffer>((res, rej) => {
            const fr = new FileReader()
            fr.onload = () => res(fr.result as ArrayBuffer)
            fr.onerror = () => rej(new Error('读取文件失败'))
            fr.readAsArrayBuffer(file)
          })
      })
    })

    // 用户取消时 change 不会触发；iOS 上 focus 回到页面就算结束
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!input.files || !input.files.length) done(null)
        }, 800)
      },
      { once: true }
    )

    document.body.appendChild(input)
    input.click()
  })
}

/** 微信端：从聊天记录选 */
async function pickInWeapp(extensions: string[]): Promise<PickedFile | null> {
  let file: { path: string; name?: string } | null = null
  try {
    const res = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: extensions })
    const f = res.tempFiles?.[0]
    if (!f) return null
    file = { path: f.path, name: f.name }
  } catch {
    return null
  }
  const path = file.path
  return {
    name: file.name || 'file',
    path,
    readText: () =>
      new Promise<string>((resolve, reject) => {
        Taro.getFileSystemManager().readFile({
          filePath: path,
          encoding: 'utf8',
          success: (r) => resolve(String(r.data)),
          fail: (e) => reject(new Error(e.errMsg || '读取文件失败'))
        })
      }),
    readArrayBuffer: () =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        Taro.getFileSystemManager().readFile({
          filePath: path,
          success: (r) => resolve(r.data as ArrayBuffer),
          fail: (e) => reject(new Error(e.errMsg || '读取文件失败'))
        })
      })
  }
}

/**
 * @param accept  浏览器用的 accept 串（如 '.json,application/json'）
 * @param extensions 微信端 chooseMessageFile 的扩展名过滤（不带点）
 */
export async function pickFile(accept: string, extensions: string[]): Promise<PickedFile | null> {
  if (IS_H5) return pickInBrowser(accept)
  return pickInWeapp(extensions)
}
