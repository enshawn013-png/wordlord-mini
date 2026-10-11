import Taro from '@tarojs/taro'
import { CLOUD_ENV_ID, isCloudConfigured } from './config'

/**
 * wx.cloud.init 只生效一次（重复调用只有第一次算数），所以这里也只放行一次。
 *
 * 注意：**不传 env 时微信会用「第一个创建的云环境」**，这个行为官方已经废弃，
 * 环境一多就会连错库，所以这里坚持把环境 ID 显式传进去。
 */

let inited = false

/** 初始化云开发。没配环境 ID / 基础库太老时返回 false（不抛错，让 App 继续跑）。 */
export function initCloud(): boolean {
  if (inited) return true
  if (!isCloudConfigured()) return false

  const cloud = (Taro as unknown as { cloud?: { init?: (c: unknown) => void } }).cloud
  if (!cloud || typeof cloud.init !== 'function') {
    console.warn('[单词君] 当前基础库不支持云开发（需要 2.2.3 以上）')
    return false
  }

  try {
    cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
    inited = true
    return true
  } catch (e) {
    console.warn('[单词君] wx.cloud.init 失败', e)
    return false
  }
}

/** 云开发是否已经初始化好（没配环境 ID 时永远是 false） */
export function cloudReady(): boolean {
  return inited
}
