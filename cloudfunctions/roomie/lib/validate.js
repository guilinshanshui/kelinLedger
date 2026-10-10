const { badRequest } = require('./errors')

/** 必填字符串，自动 trim。 */
function requireString(value, field, options = {}) {
  const { max = 200, min = 1 } = options
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length < min) throw badRequest(`${field}不能为空`)
  if (text.length > max) throw badRequest(`${field}不能超过 ${max} 个字符`)
  return text
}

function optionalString(value, max = 2000) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return text.length > max ? text.slice(0, max) : text
}

function requireOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw badRequest(`${field}取值不合法`)
  }
  return value
}

function toInt(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value === 'false' || value === 0 || value === '0') return false
  return fallback
}

function requireArray(value, field) {
  if (!Array.isArray(value)) throw badRequest(`${field}必须是数组`)
  return value
}

module.exports = {
  requireString,
  optionalString,
  requireOneOf,
  toInt,
  toBool,
  requireArray
}
