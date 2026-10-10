/**
 * 金额一律以「分」为整数存储，避免浮点误差。
 * 展示层再除 100，服务端所有运算使用整数。
 */
function toMinor(value) {
  if (value === null || value === undefined || value === '') return 0
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[,¥￥\s]/g, ''))
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100)
}

function toYuan(minor) {
  const num = Number(minor) || 0
  return Math.round(num) / 100
}

/** 均摊并处理尾差，保证各份之和严格等于总额。 */
function splitEvenly(totalMinor, weights) {
  const count = weights.length
  if (!count) return []
  const base = Math.floor(totalMinor / count)
  const remainder = totalMinor - base * count
  return weights.map((_, index) => base + (index < remainder ? 1 : 0))
}

module.exports = { toMinor, toYuan, splitEvenly }
