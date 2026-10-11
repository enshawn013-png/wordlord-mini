/**
 * 本地改动的小广播站。
 *
 * 存在的原因只有一个：**避免循环引用**。
 * storage.ts 是纯粹的本地存储层，不该 import 同步层（sync.ts 反过来要 import 它，
 * 直接互相引用就成环了）。所以这里放一个谁都不依赖的空壳，
 * storage.ts 改完数据往这里喊一嗓子，sync.ts 在启动时注册回调接住。
 *
 * 谁在喊：store/storage.ts 里所有会改数据的函数
 * 谁在听：services/sync.ts（收到就标脏，安静一会儿后批量推给云端）
 */

/** 改动类型：单词标记 / 词书新增 / 词书删除 / 阅读位置 */
export type ChangeKind = 'word' | 'book' | 'book-removed' | 'state'

type Listener = (kind: ChangeKind, key: string) => void

let listener: Listener | null = null

/** 注册唯一的监听者（sync.ts 在启动时调用） */
export function onChange(fn: Listener): void {
  listener = fn
}

/** 广播一次改动。没人在听（云没开通）时什么也不做。 */
export function emitChange(kind: ChangeKind, key: string): void {
  if (listener) listener(kind, key)
}
