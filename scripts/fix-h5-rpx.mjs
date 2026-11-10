/**
 * H5 构建后处理：把**内联样式里的 rpx** 换算成 rem。
 *
 * 为什么需要：Taro 的 postcss-pxtransform 只处理 `.css` 文件里的 rpx，
 * 组件里的内联样式（`style={{ fontSize: '224rpx' }}`）原样进包。
 * 小程序里 WXSS 认 rpx，H5 里 `224rpx` 是**非法单位**，浏览器直接丢弃该属性，
 * 于是所有字号/间距退回继承值 —— 在 iPhone 壳里看到的就是「整页放大 2 倍、左边被切」。
 *
 * 换算比：Taro 的 rem 脚本把根字号设成 `width * 40 / 750`，
 * 所以 750rpx = 屏幕宽 = 18.75rem → **1rpx = 1/40 rem**（和 `.kicker:20rpx → .5rem` 完全一致）。
 *
 * 用法：node scripts/fix-h5-rpx.mjs   （在 build:h5 之后跑）
 */
import fs from 'node:fs'
import path from 'node:path'

const DIST = path.resolve('dist')
const REM_PER_RPX = 1 / 40

const RX = /(-?\d+(?:\.\d+)?)rpx/g

function toRem(n) {
  const v = Number(n) * REM_PER_RPX
  // 去掉多余的小数尾巴：0.3500 → 0.35，5.600 → 5.6
  const s = v.toFixed(5).replace(/0+$/, '').replace(/\.$/, '')
  return (s === '-0' ? '0' : s) + 'rem'
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(js|wxs)$/i.test(ent.name)) out.push(p)
  }
  return out
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ 不存在，先跑 npm run build:h5')
  process.exit(1)
}

let files = 0
let hits = 0
for (const file of walk(DIST)) {
  const src = fs.readFileSync(file, 'utf8')
  if (!src.includes('rpx')) continue
  const before = src
  const after = src.replace(RX, (_, n) => {
    hits += 1
    return toRem(n)
  })
  if (after !== before) {
    fs.writeFileSync(file, after)
    files += 1
  }
}

console.log(`✅ 内联 rpx → rem：改了 ${files} 个 js 文件，共 ${hits} 处`)

// 自检：不该再有 rpx 留在 js 里（CSS 已由 postcss 处理成 rem）
const leftover = []
for (const file of walk(DIST)) {
  const src = fs.readFileSync(file, 'utf8')
  const m = src.match(/['"][^'"]*\d(?:\.\d+)?rpx[^'"]*['"]/g)
  if (m) leftover.push(path.relative(DIST, file) + ' → ' + m.slice(0, 2).join(' , '))
}
if (leftover.length) {
  console.warn('⚠️ 仍有 rpx 字面量：')
  leftover.slice(0, 5).forEach((l) => console.warn('   ' + l))
} else {
  console.log('✅ 没有残留的 rpx 字面量')
}
