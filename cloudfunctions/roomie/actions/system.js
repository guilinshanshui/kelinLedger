/**
 * 运维 / 一次性数据整理接口。
 *
 * 这些接口不改业务数据，只在版本升级后做历史数据规范化，
 * 前端不调用，需要时从开发者工具或控制台手动触发：
 *   /system/resetAllData （一次性清库，执行后自动停用）
 *   /system/migrateIcons
 */

const { requireUser } = require('../lib/context')
const { COLLECTIONS, _, getOne, insert, removeWhere } = require('../lib/db')
const { nextId } = require('../lib/id')
const { badRequest } = require('../lib/errors')
const { migrateIcons } = require('../lib/iconMigration')

const RESET_CONFIRM = 'RESET_ALL_DATA'
const RESET_LOCK_COLLECTION = 'app_meta'
const RESET_LOCK_KEY = 'dataResetAt'

/** 清库顺序：先业务数据，后账号，避免中途报错留下半套脏数据。 */
const RESET_COLLECTIONS = [
  COLLECTIONS.ledgers,
  COLLECTIONS.categories,
  COLLECTIONS.payMethods,
  COLLECTIONS.merchantRules,
  COLLECTIONS.accounts,
  COLLECTIONS.budgets,
  COLLECTIONS.recurrings,
  COLLECTIONS.taskLists,
  COLLECTIONS.tasks,
  COLLECTIONS.schedules,
  COLLECTIONS.feeds,
  COLLECTIONS.notifications,
  COLLECTIONS.invites,
  COLLECTIONS.members,
  COLLECTIONS.rooms,
  COLLECTIONS.users
]

module.exports = {

  /**
   * 一次性「清空全部数据」。
   *
   * 用途：把开发/试用期堆出来的账号、账本、流水清干，让上传到微信后台的版本
   * 从一个空环境开始（新微信号首次打开必须自己登录、自己建窝，看不到开发数据）。
   *
   * 安全护栏：只在未执行过的环境可用，执行后写一条 app_meta 锁，
   * 之后任何调用都会被拒绝，避免线上留下可被滥用的清库入口。
   * 前端永不调用，需要时在开发者工具 Console 手动执行：
   *   wx.cloud.callFunction({ name: 'roomie', data: { action: '/system/resetAllData', payload: { confirm: 'RESET_ALL_DATA' } } })
   */
  resetAllData: async ({ payload }) => {
    const input = payload || {}
    if (input.confirm !== RESET_CONFIRM) {
      throw badRequest(`缺少确认标记：payload.confirm 必须等于 ${RESET_CONFIRM}`)
    }
    const lock = await getOne(RESET_LOCK_COLLECTION, { key: RESET_LOCK_KEY })
    if (lock) throw badRequest('该环境已执行过清库操作，接口已自动停用')

    const removedByCollection = {}
    for (const name of RESET_COLLECTIONS) {
      let removed = 0
      // 单次 remove 有条数上限，循环到删干净为止
      for (let round = 0; round < 50; round += 1) {
        const current = await removeWhere(name, { _id: _.exists(true) })
        removed += current
        if (!current) break
      }
      removedByCollection[name] = removed
    }

    await insert(RESET_LOCK_COLLECTION, {
      _id: nextId('meta'),
      key: RESET_LOCK_KEY,
      value: new Date().toISOString()
    })

    return { removedByCollection, totalCollections: RESET_COLLECTIONS.length }
  },

  /**
   * 把历史数据里的 emoji 图标统一迁移成 mc: 矢量图标名，可重复执行。
   * 云函数超时较短，传 collection 可只迁移单个集合，便于分次执行：
   *   /system/migrateIcons?collection=ledger_categories
   */
  migrateIcons: async ({ openid, payload, query }) => {
    await requireUser(openid)
    const collection = payload.collection || query.collection || ''
    return migrateIcons(collection ? [collection] : undefined)
  }
}
