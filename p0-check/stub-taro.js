/*
 * P0 断言脚本用的 Taro 替身（不进小程序产物，放在 p0-check/ 里）。
 * 只实现 storage.ts 真正用到的缓存接口 + 存储信息（配额提示）。
 */
const store = new Map()

function getStorageSync(key) {
  return store.has(key) ? store.get(key) : ''
}
function setStorageSync(key, value) {
  store.set(key, value)
}
function removeStorageSync(key) {
  store.delete(key)
}
function getStorageInfoSync() {
  return { keys: Array.from(store.keys()), currentSize: 0, limitSize: 10240 }
}

module.exports = {
  __store: store,
  getStorageSync,
  setStorageSync,
  removeStorageSync,
  getStorageInfoSync,
  showToast: () => undefined,
  showModal: () => Promise.resolve({ confirm: false }),
  showActionSheet: () => Promise.resolve({ tapIndex: -1 }),
  navigateTo: () => undefined,
  default: {
    getStorageSync,
    setStorageSync,
    removeStorageSync,
    getStorageInfoSync,
    showToast: () => undefined,
    showModal: () => Promise.resolve({ confirm: false }),
    showActionSheet: () => Promise.resolve({ tapIndex: -1 }),
    navigateTo: () => undefined
  }
}
