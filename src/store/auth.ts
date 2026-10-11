import Taro from '@tarojs/taro'

/**
 * 登录态 + 用户资料，存本地缓存。
 *
 * 登录本身没有任何授权弹窗：openid 是云函数里 getWXContext() 直接给的，
 * 用户点不点「登录」都会拿到。所以这里记的其实是「拿到 openid 了没」。
 *
 * 头像和昵称不一样——微信从 2022-10 起**禁止小程序自动获取用户头像昵称**，
 * 只能由用户主动点「选择头像」和填昵称（设置入口原来在「我的」页，那一页 2026-10
 * 已按用户要求删掉，所以这两个字段现在只会从云端同步回来、暂时没有地方改），
 * 所以这两个字段可能一直是空的，UI 要按「没设置」处理。
 */

const AUTH_KEY = 'wordlord_auth_v1'

export interface AuthState {
  /** 云函数返回的用户唯一标识；空字符串 = 还没登录成功 */
  openid: string
  /** 用户头像：云存储 fileID（cloud://…）；没设置是空串 */
  avatar: string
  /** 用户昵称；没设置是空串 */
  nickname: string
  /** 上次同步成功的时间戳，0 = 从没同步过 */
  lastSyncAt: number
}

const EMPTY: AuthState = { openid: '', avatar: '', nickname: '', lastSyncAt: 0 }

export function getAuth(): AuthState {
  try {
    const v = Taro.getStorageSync(AUTH_KEY)
    return v ? { ...EMPTY, ...(v as Partial<AuthState>) } : { ...EMPTY }
  } catch {
    return { ...EMPTY }
  }
}

export function setAuth(patch: Partial<AuthState>): AuthState {
  const next = { ...getAuth(), ...patch }
  try {
    Taro.setStorageSync(AUTH_KEY, next)
  } catch {
    // 写缓存失败不该让 App 崩，顶多这次登录态没留下
  }
  return next
}

export function isLoggedIn(): boolean {
  return getAuth().openid !== ''
}
