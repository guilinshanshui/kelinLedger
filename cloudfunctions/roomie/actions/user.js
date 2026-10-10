const crypto = require('crypto')
const { COLLECTIONS, insert, update, getOne, count, listAll, _ } = require('../lib/db')
const { nextId } = require('../lib/id')
const { publicUser, requireUser } = require('../lib/context')
const { optionalString, requireString } = require('../lib/validate')
const { badRequest } = require('../lib/errors')
const { cnParts, monthRange } = require('../lib/dates')

const APP_VERSION = '2.1.9'

const base64url = (buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** 生成会话 token。云函数以 openid 为准，token 仅用于前端登录态标记。 */
function issueToken(user) {
  const payload = base64url(Buffer.from(JSON.stringify({ uid: user.id, openid: user.openid })))
  const signature = base64url(crypto.createHmac('sha256', user.openid).update(payload).digest())
  return `${payload}.${signature}`
}

function toClientUser(user) {
  // 前端历史代码使用 userId / roomCount 命名，这里做字段兼容，
  // 避免为了统一命名而改动十几个页面。
  return {
    ...publicUser(user),
    userId: user.id,
    role: user.role || 'user',
    roomCount: user.roomCount || 0,
    roomsCount: user.roomCount || 0,
    joinTime: user.createdAt || ''
  }
}

/**
 * 微信登录。
 * 云开发已由平台注入 openid，无需再走 code2session，也就没有 AppSecret 泄露面。
 */
async function wxEmoteLogin({ openid, payload, query }) {
  if (!openid) throw badRequest('未能获取微信身份')

  const nickname = optionalString(payload.nickname || payload.nickName || payload.userNickname, 40)
  const avatar = optionalString(payload.avatar || payload.avatarUrl || payload.userHeadUrl, 500)

  let user = await getOne(COLLECTIONS.users, { openid })
  const now = new Date().toISOString()

  if (!user) {
    user = {
      _id: nextId('u'),
      id: '',
      openid,
      nickname: nickname || '微信用户',
      avatar: avatar || '',
      phone: '',
      role: 'user',
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
    user.id = user._id
    await insert(COLLECTIONS.users, user)
  } else {
    const patch = { updatedAt: now }
    if (nickname) patch.nickname = nickname
    if (avatar) patch.avatar = avatar
    await update(COLLECTIONS.users, user._id, patch)
    user = { ...user, ...patch }
  }

  const isNewUser = !user.lastLoginAt
  await update(COLLECTIONS.users, user._id, { lastLoginAt: now })

  user.roomCount = await count(COLLECTIONS.members, { userId: user.id, status: 'active' })

  // 资料未完善（昵称仍是默认值，或还没有头像）：先不发放登录态，
  // 返回 333 让登录页弹出资料完善弹窗，选完昵称头像后由 updateProfile 落库。
  const profileIncomplete = !user.avatar || !user.nickname || user.nickname === '微信用户'
  if (profileIncomplete) {
    return { __raw: true, code: 333, message: '请完善昵称与头像', data: toClientUser(user) }
  }

  // 前端登录页直接把返回体当作 user 使用，因此把 token 平铺在同一层。
  return { ...toClientUser(user), token: issueToken(user), isNewUser }
}

/** 账号密码登录：保留入口，但云开发下推荐微信登录。 */
async function login({ payload }) {
  const account = requireString(payload.account || payload.username, '账号')
  const password = requireString(payload.password, '密码')

  const user = await getOne(COLLECTIONS.users, { account })
  if (!user) throw badRequest('账号或密码错误')

  const hashed = crypto.createHash('sha256').update(`${password}${user.passwordSalt || ''}`).digest('hex')
  if (hashed !== user.passwordHash) throw badRequest('账号或密码错误')

  return { ...toClientUser(user), token: issueToken(user) }
}

async function info({ openid }) {
  const user = await requireUser(openid)
  const roomCount = await count(COLLECTIONS.members, { userId: user.id, status: 'active' })
  return toClientUser({ ...user, roomCount })
}

async function updateProfile({ openid, payload }) {
  const user = await requireUser(openid)
  const patch = { updatedAt: new Date().toISOString() }

  if (payload.nickname !== undefined) patch.nickname = requireString(payload.nickname, '昵称', { max: 40 })
  if (payload.avatar !== undefined) patch.avatar = optionalString(payload.avatar, 500)
  if (payload.phone !== undefined) patch.phone = optionalString(payload.phone, 20)

  await update(COLLECTIONS.users, user._id, patch)
  // 资料完善发生在登录态落库之前，这里一并下发 token，前端保存后可直接进入应用。
  const next = { ...user, ...patch }
  return { ...toClientUser(next), token: issueToken(next) }
}

/**
 * 个人中心统计数据。
 *
 * 口径（与「统计分析 → 自然月」保持一致）：
 * - 协作空间 = 用户参与的全部账本数，不随当前账本收窄
 * - 记账笔数 / 支出 = 当前账本 + 当月，含全部协作成员
 *
 * 月份边界必须用 lib/dates 的 UTC+8 口径：云函数跑在 UTC，
 * 直接用本地时间划月会得到 UTC 的 0 点～24 点，凌晨记的账会被漏掉。
 */
async function statsInfo({ openid, payload, query }) {
  const user = await requireUser(openid)
  const roomId = payload.roomId || query.roomId

  const memberships = await listAll(COLLECTIONS.members, { userId: user.id, status: 'active' })
  const roomIds = memberships.map((item) => item.roomId)

  const month = cnParts(new Date())
  const statMonth = `${month.year}-${String(month.month).padStart(2, '0')}`

  if (!roomIds.length) {
    return {
      roomCount: 0,
      ledgerCount: 0,
      taskCount: 0,
      memberCount: 0,
      totalExpense: 0,
      totalIncome: 0,
      statMonth
    }
  }

  const scope = roomId && roomIds.includes(roomId) ? [roomId] : roomIds
  const roomFilter = scope.length === 1 ? scope[0] : _.in(scope)
  const { start, end } = monthRange(month.year, month.month)
  const ledgerWhere = {
    roomId: roomFilter,
    deleted: _.neq(true),
    occurredAt: _.gte(start).and(_.lte(end))
  }

  const [ledgerRows, taskCount] = await Promise.all([
    listAll(COLLECTIONS.ledgers, ledgerWhere),
    count(COLLECTIONS.tasks, { roomId: roomFilter })
  ])

  const memberCount = await count(COLLECTIONS.members, {
    roomId: roomFilter,
    status: 'active'
  })

  const totalExpenseMinor = ledgerRows
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + (item.amountMinor || 0), 0)
  const totalIncomeMinor = ledgerRows
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + (item.amountMinor || 0), 0)

  return {
    // 「协作空间」是用户参与的全部账本数，不随当前账本收窄；
    // 笔数与金额是「当前账本 + 当月」的，含全部协作成员。
    roomCount: roomIds.length,
    ledgerCount: ledgerRows.length,
    taskCount,
    memberCount,
    totalExpense: totalExpenseMinor / 100,
    totalIncome: totalIncomeMinor / 100,
    statMonth
  }
}

/** 更新头像与昵称（前端头像选择器回调）。 */
async function updateEmoteUserName({ openid, payload }) {
  return updateProfile({ openid, payload })
}

/**
 * 版本更新记录，供前端「更新日志」页展示。
 *
 * 字段名必须与页面 formatVersionList() 对齐：
 *   versionNumber / releaseDate / status / changelogs[{ type, content }]
 * type 取值：NEW_FEATURES（新功能）、FIXED_ISSUES（问题修复）
 * content 直接给字符串数组，前端逐条渲染；同时兼容历史接口的 "', '" 拼接串。
 *
 * status === 'current' 的那条会渲染到顶部当前版本卡片。
 * 新增版本时把旧记录的 status 去掉，只保留最新一条为 current。
 */
const VERSION_HISTORY = [
  {
    versionNumber: APP_VERSION,
    releaseDate: '2026-10-10',
    status: 'current',
    changelogs: [
      {
        type: 'NEW_FEATURES',
        content: [
          '统一微信 / 支付宝账单导入图标的视觉风格',
          '「我的」版本号与更新日志使用同一版本源'
        ]
      },
      {
        type: 'FIXED_ISSUES',
        content: [
          '修复成员头像跨账号加载失败的问题',
          '修复经办成员选择器无法显示真实头像的问题',
          '修复体验版顶部版本号落后于更新日志的问题',
          '修复账单导入品牌图标与全局主题图标不一致的问题'
        ]
      }
    ]
  },
  {
    versionNumber: '2.1.8',
    releaseDate: '2026-10-10',
    status: '',
    changelogs: [
      {
        type: 'NEW_FEATURES',
        content: [
          '日历视图：按天回看收支',
          '统计分析：月 / 年 / 全部 / 自定义区间',
          '账本设置：资料、成员权限、邀请、转让、解散',
          '家庭清单与日程提醒',
          '资产账户与收支态势图',
          '账单导入：支持微信 / 支付宝账单',
          '账本页新增「加入账本」入口，可用邀请码加入'
        ]
      },
      {
        type: 'FIXED_ISSUES',
        content: [
          '修复收支流水在部分场景不显示记录',
          '修复切换账本后统计未同步刷新',
          '统一全局配色与矢量图标，清理冗余代码',
          '修复真机体验版未及时加载新主题样式的问题'
        ]
      }
    ]
  },
  {
    versionNumber: '2.0.0',
    releaseDate: '2026-10-05',
    status: '',
    changelogs: [
      {
        type: 'NEW_FEATURES',
        content: [
          '接口层迁移到微信云开发，不需要买服务器',
          '家庭成员管理：邀请码、角色权限、移除成员',
          '待办清单与家庭动态',
          '全部数据改为云数据库持久化'
        ]
      }
    ]
  },
  {
    versionNumber: '1.0.0',
    releaseDate: '2026-09-20',
    status: '',
    changelogs: [
      {
        type: 'NEW_FEATURES',
        content: ['首版发布：记账、分类管理、成员协作与基础统计']
      }
    ]
  }
]

/** 版本记录，前端「进化历程」页展示。 */
async function versionList() {
  return VERSION_HISTORY
}

module.exports = {
  wxEmoteLogin,
  login,
  info,
  update: updateProfile,
  statsInfo,
  updateEmoteUserName,
  versionList
}
