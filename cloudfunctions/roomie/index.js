/**
 * Roomie 云函数入口。
 *
 * 前端以 `模块.方法` 的形式调用，例如：
 *   /room/createRoom      -> room.createRoom
 *   /ledger/import/preview -> ledger.importPreview
 *   /task/allStatus        -> task.allStatus
 *
 * 路由规则见 resolveRoute()，新增接口只需在对应 actions/ 模块里挂一个方法。
 */
const cloud = require('wx-server-sdk')
const { ok, fail } = require('./lib/response')
const { AppError } = require('./lib/errors')
const { resolveRoute } = require('./lib/route')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const modules = {
  user: require('./actions/user'),
  room: require('./actions/room'),
  member: require('./actions/member'),
  ledger: require('./actions/ledger'),
  ledgerImport: require('./actions/ledgerImport'),
  task: require('./actions/task'),
  schedule: require('./actions/schedule'),
  feed: require('./actions/feed'),
  notification: require('./actions/notification'),
  upload: require('./actions/upload'),
  system: require('./actions/system'),
  type: require('./actions/type'),
  dashboard: require('./actions/dashboard')
}

exports.main = async (event = {}) => {
  // 定时触发器：日程 / 生日到点提醒。
  // 必须先于周期账单判断，否则两个 timer 触发器会都走进周期账单分支。
  if (event.triggerName === 'reminderTick') {
    try {
      const reminders = require('./lib/reminders')
      const result = await reminders.generateDue()
      console.log('[roomie] 提醒派发完成', result)
      return ok(result)
    } catch (error) {
      console.error('[roomie] 提醒派发失败', error)
      return fail(error)
    }
  }

  // 定时触发器：周期账单入账
  if (event.triggerName === 'dailyRecurring') {
    try {
      const recurring = require('./lib/recurring')
      const result = await recurring.generateDue()
      console.log('[roomie] 周期账单任务完成', result)
      return ok(result)
    } catch (error) {
      console.error('[roomie] 周期账单任务失败', error)
      return fail(error)
    }
  }

  const { action, payload = {}, query = {} } = event
  const { OPENID, APPID, UNIONID } = cloud.getWXContext()

  if (!action) {
    return fail(new AppError(400, '缺少 action 参数'))
  }

  let route
  try {
    route = resolveRoute(action)
  } catch (error) {
    return fail(error)
  }

  const handler = modules[route.module] && modules[route.module][route.method]
  if (typeof handler !== 'function') {
    // 未实现的接口返回可读错误，而不是抛异常，便于前端降级
    return fail(new AppError(404, `接口未实现: ${route.module}.${route.method}`))
  }

  try {
    const result = await handler({
      openid: OPENID,
      appid: APPID,
      unionid: UNIONID,
      payload,
      query,
      params: route.params || [],
      event
    })
    // 少数接口需要自带业务码（如登录资料未完善返回 333），用 __raw 标记原样透传，
    // 避免被 ok() 统一包成 code 0。
    if (result && result.__raw === true) {
      const { __raw, ...raw } = result
      return raw
    }
    return ok(result === undefined ? null : result)
  } catch (error) {
    console.error(`[roomie] ${route.module}.${route.method} 失败`, error)
    return fail(error)
  }
}
