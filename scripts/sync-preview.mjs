/**
 * 把 dist/ 同步到一个「纯净预览目录」，专门喂微信开发者工具。
 *
 * 为什么需要它：devtools 2.02 在 `miniprogramRoot: "dist/"` 下算「源码包」体积时
 * 会把项目根目录的 src / p0-check / design / .swc 一起算进去（实测 dist 只有 1.45MB，
 * 它报 4121KB ≈ dist+src+p0-check+design），于是「预览」被 2MB 上限挡住。
 * 把产物单独复制到项目外的一个目录，devtools 就只能看到真正的小程序包。
 *
 * 用法：npm run preview:pkg   （先构建，再同步）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const src = path.resolve('dist')
const dest = path.join(os.homedir(), 'wordlord-preview')

if (!fs.existsSync(path.join(src, 'app.json'))) {
  console.error('dist/ 里没有 app.json —— 先跑 npm run build:weapp')
  process.exit(1)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(src, dest, { recursive: true })

let bytes = 0
let files = 0
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else {
      bytes += fs.statSync(p).size
      files += 1
    }
  }
}
walk(dest)

console.log(`✅ 预览目录已同步：${dest}`)
console.log(`   ${files} 个文件，${(bytes / 1024).toFixed(0)} KB（上限 2048 KB）`)
if (bytes > 2 * 1024 * 1024) {
  console.error('⚠️ 仍然超过 2MB，需要拆分包')
  process.exit(1)
}
