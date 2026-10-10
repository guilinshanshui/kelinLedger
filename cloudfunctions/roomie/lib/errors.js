/** 业务错误：带 HTTP 语义的业务码，前端按 code 判断。 */
class AppError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

/** 常用错误快捷构造 */
const badRequest = (message = '参数错误') => new AppError(400, message)
const unauthorized = (message = '未登录') => new AppError(401, message)
const forbidden = (message = '权限不足') => new AppError(403, message)
const notFound = (message = '资源不存在') => new AppError(404, message)
const conflict = (message = '操作冲突') => new AppError(409, message)

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict
}
