const { AppError } = require('./errors')

/** 成功响应，与前端 ApiResponse<T> 约定一致（code === 0 为成功）。 */
function ok(data = null) {
  return { code: 0, message: 'ok', data }
}

/** 失败响应，未知异常统一降级为 500。 */
function fail(error) {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, data: null }
  }
  const message = (error && error.message) || '服务异常'
  return { code: 500, message, data: null }
}

module.exports = { ok, fail }
