/**
 * 云开发的配置。
 *
 * ★ 唯一需要你手动改的地方：把 CLOUD_ENV_ID 填成你自己的云环境 ID ★
 *
 * 环境 ID 在哪拿：微信开发者工具 → 顶部「云开发」按钮 → 云开发控制台
 * → 左上角环境名旁边那一串（形如 `wordlord-3gxxxxxxxxxxxx`）
 * → 或者「设置」→「环境设置」→「环境 ID」复制。
 *
 * **留空 = 云功能整个关掉**：App 照常能用，标记/生词本/上传词书全部只存本地，
 * 「我的」页会显示「云同步未开通」并给出提示。所以没开通之前也不会白屏。
 */
export const CLOUD_ENV_ID = ''

/** 云函数名（cloudfunctions/ 下只有一个，所有云端读写都走它） */
export const CLOUD_FUNCTION = 'wordlord'

/** 云环境 ID 填了没 */
export function isCloudConfigured(): boolean {
  return CLOUD_ENV_ID.trim().length > 0
}
