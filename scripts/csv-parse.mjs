/**
 * 极简 RFC4180 CSV 解析器（流式，支持字段内换行 / 双引号转义）。
 * ECDICT 的 ecdict.csv 有 65MB，且部分字段内含真实换行，必须流式解析。
 */
import { createReadStream } from 'node:fs'

/** 逐条产出 CSV 记录（string[]）。 */
export async function* parseCsvFile(path) {
  const stream = createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 })

  let field = ''
  let record = []
  let inQuotes = false
  let pendingQuote = false // 遇到 "" 时先记下，看下一个字符是否还是引号

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]

      if (inQuotes) {
        if (pendingQuote) {
          // 上一个字符是引号：本字符仍是引号 => 转义引号，否则引号区结束
          if (ch === '"') {
            field += '"'
            pendingQuote = false
            continue
          }
          inQuotes = false
          pendingQuote = false
          // 落到下面按普通字符处理
        } else if (ch === '"') {
          pendingQuote = true
          continue
        } else {
          field += ch
          continue
        }
      }

      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        record.push(field)
        field = ''
      } else if (ch === '\n') {
        record.push(field)
        field = ''
        if (record.length > 1 || record[0] !== '') yield record
        record = []
      } else if (ch !== '\r') {
        field += ch
      }
    }
  }

  if (field !== '' || record.length > 0) {
    record.push(field)
    if (record.length > 1 || record[0] !== '') yield record
  }
}
