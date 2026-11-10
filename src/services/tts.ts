import Taro from '@tarojs/taro'

/**
 * 单词发音。
 *
 * ## 为什么是「在线音频」而不是 TTS SDK
 *
 * 原计划是接腾讯云语音合成（经云开发云函数，密钥留服务端）—— 那条路要开云环境、
 * 部署云函数、配密钥，成本和门槛都高，而**这个 App 的云同步默认就是关着的**，
 * 不该把一个「点一下听个响」的功能绑在一整套后端上。
 *
 * 现在用的是一条公开的词典发音音频地址（有道词典的 dictvoice，英式 / 美式各一条）。
 * 关键点：**`InnerAudioContext` 播放音频不受「request 合法域名」限制**
 * （域名白名单管的是 wx.request / downloadFile 这类接口，媒体播放不在其中），
 * 所以不需要在 mp 后台配任何东西，装上就能用。
 *
 * ⚠️ 它需要**联网**。断网 / 地址被拒时 `onError` 会走到，这里只给一句短提示
 * （Toast 超过 7 个汉字就会被挤），不会静默失败。
 *
 * 留了退路：以后真接了云函数 TTS，只要把这个文件里的 `VOICE_URL` 换掉，
 * 调用方（翻书页 / 复习页的发音按钮）一行都不用动。
 */

/** 复用一个播放器：每点一次 new 一个 InnerAudioContext 会漏内存（小程序里是真实存在的坑） */
let player: Taro.InnerAudioContext | null = null
/** 当前正在播的词（用来做「再点一次 = 停」的开关） */
let playing = ''

/** 有道发音：type 1 = 英式，2 = 美式。四六级按美式给（用户群里更常见） */
function voiceUrl(word: string): string {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`
}

function ensurePlayer(): Taro.InnerAudioContext | null {
  if (player) return player
  try {
    player = Taro.createInnerAudioContext()
    // 静音键下也要出声：背单词时用户按了静音键自己往往没意识到，
    // 点了发音没声音会被当成「坏了」。这是背单词类 App 的通行做法。
    player.obeyMuteSwitch = false
    player.onEnded(() => {
      playing = ''
    })
    player.onError(() => {
      playing = ''
      Taro.showToast({ title: '发音加载失败', icon: 'none' })
    })
    return player
  } catch {
    // H5 / 老基础库取不到播放器：给一句提示，不要抛到页面上
    return null
  }
}

/** 发音。**同一个词再点一次 = 停止**（用户常见的「点错了想让它停」） */
export function speak(word: string): void {
  const w = (word || '').trim()
  if (!w) return
  const p = ensurePlayer()
  if (!p) {
    Taro.showToast({ title: '这台设备不支持发音', icon: 'none' })
    return
  }
  if (playing === w) {
    stopSpeak()
    return
  }
  try {
    p.stop()
    p.src = voiceUrl(w)
    playing = w
    p.play()
  } catch {
    playing = ''
    Taro.showToast({ title: '发音加载失败', icon: 'none' })
  }
}

/** 停止播放（离开页面时调一次，别让声音跟着用户走到别的页） */
export function stopSpeak(): void {
  playing = ''
  try {
    player?.stop()
  } catch {
    // 没在播的时候 stop 会抛，忽略
  }
}

/** 这个词是不是正在播（按钮据此显示「停止」态） */
export function isSpeaking(word: string): boolean {
  return Boolean(word) && playing === word
}
