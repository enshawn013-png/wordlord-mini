import Taro from '@tarojs/taro'

/**
 * 单词发音。
 *
 * TODO（后续接入）：腾讯云语音合成（TTS）。推荐经「微信云开发」云函数调用，
 * 这样 SecretId/SecretKey 留在服务端，小程序端只拿返回的音频用 InnerAudioContext 播放，
 * 也避免在 mp 后台配置 request 合法域名。
 *
 * 当前为占位实现：点发音按钮只弹一个提示，说明接口待接入。
 */
export function speak(word: string): void {
  // 预留：调用云函数 → 腾讯云 TTS → 返回音频 → InnerAudioContext 播放
  Taro.showToast({ title: `「${word}」发音待接入`, icon: 'none', duration: 1500 })
}
