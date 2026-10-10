const {
  COLLECTIONS,
  insert,
  update,
  getOne,
  getById,
  listAll,
  count,
  _
} = require('./db')
const { nextId, inviteCode } = require('./id')
const { seedRoom } = require('./seed')
const { publicUser, publicMember, ROLE_LABEL, rankOf } = require('./context')
const { badRequest, forbidden, notFound } = require('./errors')
const { normalizeFeatureCodes, resolveFeatures } = require('./roomFeatures')
const { pushNotification, pushNotificationMany } = require('./notify')
const { publishFeed, FEED_TYPES } = require('./activity')
const { toYuan } = require('./money')
const { weekRange, monthRange, dayKey, enumerateDays } = require('./dates')
const accounts = require('./accounts')

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 建房：创建房间 + 创建者写入 owner 成员 + 初始化分类与支付方式。 */
async function createRoom(user, payload = {}) {
  const name = String(payload.name || payload.roomName || '我的家').trim().slice(0, 40) || '我的家'
  const now = new Date().toISOString()
  const roomId = nextId('room')

  // 「新建空间 → 进阶配置」选的功能模块。前端历史上还发过 featuresId（单个），
  // 这里一并兼容；什么都没选就全开，和 resolveFeatures 的默认保持一致。
  const pickedFeatures = normalizeFeatureCodes(
    Array.isArray(payload.features)
      ? payload.features
      : payload.featuresId
        ? [payload.featuresId]
        : []
  )
  const features = pickedFeatures.length ? pickedFeatures : resolveFeatures([]).map((f) => f.code)

  const code = inviteCode()
  const room = {
    _id: roomId,
    name,
    description: String(payload.description || '').slice(0, 200),
    avatar: String(payload.avatar || payload.icon || ''),
    iconId: payload.iconId || '',
    templateId: payload.templateId || '',
    features,
    ownerId: user.id,
    budgetMinor: 0,
    inviteCode: code,
    memberCount: 1,
    status: 'active',
    createdAt: now,
    updatedAt: now
  }

  await insert(COLLECTIONS.rooms, room)

  await insert(COLLECTIONS.members, {
    _id: nextId('mem'),
    roomId,
    userId: user.id,
    role: 'owner',
    nickname: user.nickname,
    avatar: user.avatar || '',
    status: 'active',
    joinedAt: now
  })

  await insert(COLLECTIONS.invites, {
    _id: nextId('inv'),
    roomId,
    code,
    inviterId: user.id,
    inviteeId: '',
    status: 'pending',
    createdAt: now,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString()
  })

  await seedRoom(roomId, user.id)
  await accounts.seedAccounts(roomId, user.id)
  await publishFeed({
    roomId,
    userId: user.id,
    type: FEED_TYPES.TEXT,
    content: `创建了空间「${name}」`,
    refType: 'room',
    refId: roomId
  })

  return decorateRoom(room, user.id)
}

/** 当前用户可见的房间列表。 */
async function listRooms(userId) {
  const memberships = await listAll(COLLECTIONS.members, { userId, status: 'active' })
  if (!memberships.length) return []

  // 账本卡片要展示「支 / 收 / 结」，一次性拉全量流水再按房间聚合，避免 N+1 查询
  const allEntries = await listAll(COLLECTIONS.ledgers, {
    roomId: _.in(memberships.map((item) => item.roomId)),
    deleted: _.neq(true)
  })
  const statsByRoom = new Map()
  allEntries.forEach((item) => {
    if (!statsByRoom.has(item.roomId)) statsByRoom.set(item.roomId, { expenseMinor: 0, incomeMinor: 0 })
    const bucket = statsByRoom.get(item.roomId)
    if (item.type === 'expense') bucket.expenseMinor += item.amountMinor || 0
    if (item.type === 'income') bucket.incomeMinor += item.amountMinor || 0
  })

  const rooms = await Promise.all(
    memberships.map(async (member) => {
      const room = await getById(COLLECTIONS.rooms, member.roomId)
      if (!room || room.status === 'deleted') return null
      const stats = statsByRoom.get(room._id) || { expenseMinor: 0, incomeMinor: 0 }
      return {
        ...decorateRoom(room, userId, member.role),
        stats: {
          expense: toYuan(stats.expenseMinor),
          income: toYuan(stats.incomeMinor),
          balance: toYuan(stats.incomeMinor - stats.expenseMinor)
        },
        // 仅创建者可邀请/解散，前端据此控制按钮可用性
        canManage: room.ownerId === userId || ['owner', 'admin'].includes(member.role)
      }
    })
  )

  return rooms.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function decorateRoom(room, userId, role) {
  const resolvedRole = role || (room.ownerId === userId ? 'owner' : 'member')
  return {
    id: room._id,
    name: room.name,
    description: room.description || '',
    avatar: room.avatar || '',
    iconId: room.iconId || '',
    templateId: room.templateId || '',
    inviteCode: room.inviteCode || '',
    ownerId: room.ownerId,
    // 老房间没有 features 字段，resolveFeatures 会按全开返回，功能不会突然消失
    featuresList: resolveFeatures(room.features),
    budget: toYuan(room.budgetMinor || 0),
    memberCount: room.memberCount || 0,
    role: resolvedRole,
    userRole: resolvedRole,
    currentUserId: userId || '',
    canManage: ['owner', 'admin'].includes(resolvedRole),
    createTime: room.createdAt,
    updateTime: room.updatedAt
  }
}

/** 房间详情，含成员列表。 */
async function getRoomDetail(roomId, userId = '') {
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room || room.status === 'deleted') throw notFound('房间不存在或已解散')

  const members = await listMembers(roomId)
  return {
    ...decorateRoom(room, userId, (members.find((item) => item.userId === userId) || {}).role),
    members,
    budget: toYuan(room.budgetMinor || 0)
  }
}

/** 成员列表（含用户资料快照）。 */
async function listMembers(roomId) {
  const members = await listAll(COLLECTIONS.members, { roomId, status: 'active' })

  // 云数据库不支持跨集合 join，按 userId 现取用户快照
  const users = await Promise.all(
    members.map((member) => getById(COLLECTIONS.users, member.userId))
  )
  const userMap = new Map(users.filter(Boolean).map((user) => [user.id || user._id, user]))

  return members
    .map((member) => publicMember(member, userMap.get(member.userId)))
    .sort((a, b) => rankOf(b.role) - rankOf(a.role))
}

/** 生成/刷新邀请码；可直接邀请指定用户。 */
async function createInvite(inviter, roomId, inviteeId = '') {
  const now = new Date().toISOString()
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room) throw notFound('房间不存在')

  let invite = null
  if (inviteeId) {
    invite = await getOne(COLLECTIONS.invites, { roomId, inviteeId, status: 'pending' })
  }

  if (invite) {
    return { id: invite._id, code: invite.code, expiresAt: invite.expiresAt }
  }

  const code = inviteCode()
  const doc = {
    _id: nextId('inv'),
    roomId,
    code,
    inviterId: inviter.id,
    inviteeId: inviteeId || '',
    status: 'pending',
    createdAt: now,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString()
  }
  await insert(COLLECTIONS.invites, doc)
  await update(COLLECTIONS.rooms, roomId, { inviteCode: code, updatedAt: now })

  if (inviteeId) {
    await pushNotification({
      roomId,
      userId: inviteeId,
      actorId: inviter.id,
      type: 'room_invite',
      title: '空间邀请',
      body: `${inviter.nickname} 邀请你加入「${room.name}」`,
      targetType: 'invite',
      targetId: doc._id
    })
  }

  return { id: doc._id, code, expiresAt: doc.expiresAt }
}

/** 通过邀请码加入。 */
async function joinByCode(user, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) throw badRequest('请输入邀请码')

  const invite = await getOne(COLLECTIONS.invites, { code })
  if (!invite || invite.status !== 'pending') throw badRequest('邀请码无效或已失效')
  if (invite.expiresAt && invite.expiresAt < new Date().toISOString()) {
    await update(COLLECTIONS.invites, invite._id, { status: 'expired' })
    throw badRequest('邀请码已过期')
  }

  return joinRoom(user, invite.roomId, invite)
}

/** 接受定向邀请。 */
async function acceptInvitation(user, invitationId) {
  const invite = await getById(COLLECTIONS.invites, invitationId)
  if (!invite) throw notFound('邀请不存在')
  if (invite.inviteeId && invite.inviteeId !== user.id) throw forbidden('该邀请不属于你')
  if (invite.status !== 'pending') throw badRequest('邀请已处理')

  const result = await joinRoom(user, invite.roomId, invite)
  await update(COLLECTIONS.invites, invite._id, { status: 'accepted', usedBy: user.id })
  return result
}

async function joinRoom(user, roomId, invite) {
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room || room.status === 'deleted') throw notFound('房间不存在或已解散')

  const existing = await getOne(COLLECTIONS.members, { roomId, userId: user.id })
  if (existing && existing.status === 'active') {
    return decorateRoom(room, user.id, existing.role)
  }

  const now = new Date().toISOString()
  if (existing) {
    await update(COLLECTIONS.members, existing._id, { status: 'active', role: existing.role || 'member', joinedAt: now })
  } else {
    await insert(COLLECTIONS.members, {
      _id: nextId('mem'),
      roomId,
      userId: user.id,
      role: 'member',
      nickname: user.nickname,
      avatar: user.avatar || '',
      status: 'active',
      joinedAt: now
    })
  }

  const memberCount = await count(COLLECTIONS.members, { roomId, status: 'active' })
  await update(COLLECTIONS.rooms, roomId, { memberCount, updatedAt: now })

  if (invite && invite.inviteeId) {
    await update(COLLECTIONS.invites, invite._id, { status: 'accepted', usedBy: user.id })
  }

  await publishFeed({
    roomId,
    userId: user.id,
    type: FEED_TYPES.MEMBER_JOIN,
    content: `加入了空间「${room.name}」`,
    refType: 'member',
    refId: user.id
  })

  const others = await listAll(COLLECTIONS.members, { roomId, status: 'active' })
  await pushNotificationMany(
    others.map((item) => item.userId),
    {
      roomId,
      actorId: user.id,
      type: 'member_join',
      title: '新成员加入',
      body: `${user.nickname} 加入了「${room.name}」`,
      targetType: 'room',
      targetId: roomId
    }
  )

  return decorateRoom(room, user.id, existing ? existing.role : 'member')
}

/** 待处理邀请列表（定向邀请 + 该用户可用的邀请码）。 */
async function listPendingInvitations(userId) {
  const invites = await listAll(COLLECTIONS.invites, { inviteeId: userId, status: 'pending' })
  const rows = await Promise.all(
    invites.map(async (invite) => {
      const room = await getById(COLLECTIONS.rooms, invite.roomId)
      if (!room || room.status === 'deleted') return null
      const inviter = await getById(COLLECTIONS.users, invite.inviterId)
      return {
        id: invite._id,
        roomId: invite.roomId,
        roomName: room.name,
        inviterName: (inviter && inviter.nickname) || '成员',
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt
      }
    })
  )
  return rows.filter(Boolean)
}

async function rejectInvitation(user, invitationId) {
  const invite = await getById(COLLECTIONS.invites, invitationId)
  if (!invite) throw notFound('邀请不存在')
  if (invite.inviteeId && invite.inviteeId !== user.id) throw forbidden('该邀请不属于你')
  await update(COLLECTIONS.invites, invite._id, { status: 'rejected' })
  return { id: invitationId, status: 'rejected' }
}

async function handleAllInvitations(user, accept) {
  const pending = await listPendingInvitations(user.id)
  if (!pending.length) return { handled: 0 }
  if (accept) {
    for (const item of pending) {
      await acceptInvitation(user, item.id)
    }
  } else {
    await Promise.all(pending.map((item) => update(COLLECTIONS.invites, item.id, { status: 'rejected' })))
  }
  return { handled: pending.length }
}

/** 修改成员角色：仅 owner/admin 可操作，且不能改动 owner。 */
async function updateMemberRole(operator, operatorRole, roomId, targetUserId, role) {
  if (!ROLE_LABEL[role]) throw badRequest('角色不合法')
  if (role === 'owner') throw forbidden('不能直接转让创建者，请使用转让功能')

  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room) throw notFound('房间不存在')
  if (targetUserId === room.ownerId) throw forbidden('不能修改创建者角色')

  const member = await getOne(COLLECTIONS.members, { roomId, userId: targetUserId, status: 'active' })
  if (!member) throw notFound('成员不存在')

  if (rankOf(operatorRole) <= rankOf(member.role) && operator.id !== room.ownerId) {
    throw forbidden('不能修改同级或更高权限的成员')
  }

  await update(COLLECTIONS.members, member._id, { role, updatedAt: new Date().toISOString() })
  await pushNotification({
    roomId,
    userId: targetUserId,
    actorId: operator.id,
    type: 'role_changed',
    title: '权限变更',
    body: `你在「${room.name}」中的角色变为${ROLE_LABEL[role]}`,
    targetType: 'room',
    targetId: roomId
  })

  return { userId: targetUserId, role }
}

/** 移除成员：只能移除低于自己权限的成员，且创建者不可被移除。 */
async function removeMember(operator, operatorRole, roomId, targetUserId) {
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room) throw notFound('房间不存在')
  if (targetUserId === room.ownerId) throw forbidden('不能移除创建者')
  if (targetUserId === operator.id) throw badRequest('不能移除自己，请使用退出空间')

  const member = await getOne(COLLECTIONS.members, { roomId, userId: targetUserId, status: 'active' })
  if (!member) throw notFound('成员不存在')
  if (rankOf(operatorRole) <= rankOf(member.role)) throw forbidden('不能移除同级或更高权限的成员')

  await update(COLLECTIONS.members, member._id, { status: 'removed', removedAt: new Date().toISOString() })
  const memberCount = await count(COLLECTIONS.members, { roomId, status: 'active' })
  await update(COLLECTIONS.rooms, roomId, { memberCount, updatedAt: new Date().toISOString() })

  await pushNotification({
    roomId,
    userId: targetUserId,
    actorId: operator.id,
    type: 'member_removed',
    title: '已移出空间',
    body: `你已被移出「${room.name}」`,
    targetType: 'room',
    targetId: roomId
  })

  return { userId: targetUserId }
}

/** 成员主动退出空间。创建者需先转让或解散。 */
async function leaveRoom(user, roomId) {
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room) throw notFound('房间不存在')
  if (room.ownerId === user.id) throw badRequest('创建者不能退出，请先转让或解散空间')

  const member = await getOne(COLLECTIONS.members, { roomId, userId: user.id, status: 'active' })
  if (!member) throw notFound('你不是该空间成员')

  const now = new Date().toISOString()
  await update(COLLECTIONS.members, member._id, { status: 'removed', removedAt: now })
  const memberCount = await count(COLLECTIONS.members, { roomId, status: 'active' })
  await update(COLLECTIONS.rooms, roomId, { memberCount, updatedAt: now })

  const others = await listAll(COLLECTIONS.members, { roomId, status: 'active' })
  await pushNotificationMany(
    others.map((item) => item.userId),
    {
      roomId,
      actorId: user.id,
      type: 'member_leave',
      title: '成员退出',
      body: `${user.nickname} 退出了「${room.name}」`,
      targetType: 'room',
      targetId: roomId
    }
  )

  return { roomId, status: 'left' }
}

/** 更新房间信息。 */
async function updateRoom(operator, roomId, payload, operatorRole = '') {
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room) throw notFound('房间不存在')

  const patch = { updatedAt: new Date().toISOString() }
  if (payload.name !== undefined) patch.name = String(payload.name).trim().slice(0, 40) || room.name
  if (payload.description !== undefined) patch.description = String(payload.description).slice(0, 200)
  if (payload.avatar !== undefined || payload.icon !== undefined) {
    patch.avatar = String(payload.avatar !== undefined ? payload.avatar : payload.icon)
  }
  if (payload.budget !== undefined) {
    patch.budgetMinor = Math.max(0, Math.round(Number(payload.budget) * 100) || 0)
  }

  await update(COLLECTIONS.rooms, roomId, patch)
  return decorateRoom({ ...room, ...patch }, operator.id, operatorRole)
}

/** 转让创建者：只有当前创建者可以操作。 */
async function transferOwner(operator, roomId, targetUserId) {
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room || room.status === 'deleted') throw notFound('房间不存在或已解散')
  if (room.ownerId !== operator.id) throw forbidden('只有创建者可以转让空间')
  if (!targetUserId || targetUserId === operator.id) throw badRequest('请选择另一名成员作为新创建者')

  const target = await getOne(COLLECTIONS.members, {
    roomId,
    userId: targetUserId,
    status: 'active'
  })
  if (!target) throw notFound('目标成员不存在')

  const operatorMember = await getOne(COLLECTIONS.members, {
    roomId,
    userId: operator.id,
    status: 'active'
  })

  const now = new Date().toISOString()
  await update(COLLECTIONS.rooms, roomId, { ownerId: targetUserId, updatedAt: now })
  await update(COLLECTIONS.members, target._id, { role: 'owner', updatedAt: now })
  if (operatorMember) {
    await update(COLLECTIONS.members, operatorMember._id, { role: 'admin', updatedAt: now })
  }

  await pushNotification({
    roomId,
    userId: targetUserId,
    actorId: operator.id,
    type: 'owner_transferred',
    title: '你已成为创建者',
    body: `你已成为「${room.name}」的创建者`,
    targetType: 'room',
    targetId: roomId
  })

  return decorateRoom({ ...room, ownerId: targetUserId, updatedAt: now }, operator.id, 'admin')
}

/** 解散房间：创建者专属，软删除。 */
async function deleteRoom(operator, roomId) {
  const room = await getById(COLLECTIONS.rooms, roomId)
  if (!room) throw notFound('房间不存在')
  if (room.ownerId !== operator.id) throw forbidden('只有创建者可以解散空间')

  const now = new Date().toISOString()
  const [activeMembers, pendingInvites] = await Promise.all([
    listAll(COLLECTIONS.members, { roomId, status: 'active' }),
    listAll(COLLECTIONS.invites, { roomId, status: 'pending' })
  ])

  await Promise.all([
    update(COLLECTIONS.rooms, roomId, {
      status: 'deleted',
      memberCount: 0,
      deletedAt: now,
      updatedAt: now
    }),
    ...activeMembers.map((member) =>
      update(COLLECTIONS.members, member._id, {
        status: 'removed',
        removedAt: now
      })
    ),
    ...pendingInvites.map((invite) =>
      update(COLLECTIONS.invites, invite._id, { status: 'revoked' })
    )
  ])

  return { id: roomId, status: 'deleted' }
}

/** 首页概览：本月收支、预算进度、待办数。 */
async function dashboardOverview(roomId, userId, { type = 'month' } = {}) {
  const now = new Date()
  // 资产页支持「本周 / 本月」切换，两个范围共用同一套聚合逻辑
  const range = type === 'week' ? weekRange(now) : monthRange(now.getFullYear(), now.getMonth() + 1)

  const [room, entries, tasks, asset] = await Promise.all([
    getById(COLLECTIONS.rooms, roomId),
    listAll(COLLECTIONS.ledgers, { roomId, deleted: _.neq(true) }),
    listAll(COLLECTIONS.tasks, { roomId, deleted: _.neq(true) }),
    accounts.assetOverview(roomId, { startDate: range.start, endDate: range.end })
  ])

  if (!room) throw notFound('房间不存在')

  const inRange = entries.filter((item) => {
    const at = item.occurredAt || item.createdAt || ''
    return at >= range.start && at <= range.end
  })

  const totalExpense = inRange
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + (item.amountMinor || 0), 0)
  const totalIncome = inRange
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + (item.amountMinor || 0), 0)

  // 趋势点按「完整时间轴」输出：区间内每一天都占一个点（没记账的那天记 0），
  // 否则缺失的日期会被跳过，前端柱子和横轴标签就对不上了。
  const buckets = enumerateDays(range.start, range.end).map((date) => ({
    date,
    income: 0,
    expense: 0
  }))
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]))
  inRange.forEach((item) => {
    const bucket = bucketByDate.get(dayKey(item.occurredAt || item.createdAt))
    if (!bucket) return
    if (item.type === 'income') bucket.income += item.amountMinor || 0
    if (item.type === 'expense') bucket.expense += item.amountMinor || 0
  })

  const points = buckets.map((bucket) => ({
    label: bucket.date.slice(5),
    date: bucket.date,
    income: toYuan(bucket.income),
    expense: toYuan(bucket.expense)
  }))

  const budgetMinor = room.budgetMinor || 0
  const pendingTasks = tasks.filter((item) => item.status !== 'completed').length
  const completedTasks = tasks.filter((item) => item.status === 'completed').length

  return {
    roomId,
    roomName: room.name,
    period: type || 'month',
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    totalExpense: toYuan(totalExpense),
    totalIncome: toYuan(totalIncome),
    balance: toYuan(totalIncome - totalExpense),
    budget: toYuan(budgetMinor),
    budgetUsed: toYuan(totalExpense),
    budgetPercent: budgetMinor ? Math.min(100, Math.round((totalExpense / budgetMinor) * 100)) : 0,
    pendingTasks,
    completedTasks,
    entryCount: inRange.length,

    // 「资产详情」页依赖的结构：总余额 / 期间收支 / 按账户分类
    asset: asset.asset,
    trend: { points },
    recent: { ledgers: asset.history }
  }
}

module.exports = {
  createRoom,
  listRooms,
  getRoomDetail,
  listMembers,
  createInvite,
  joinByCode,
  acceptInvitation,
  rejectInvitation,
  handleAllInvitations,
  listPendingInvitations,
  updateMemberRole,
  removeMember,
  leaveRoom,
  updateRoom,
  transferOwner,
  deleteRoom,
  dashboardOverview,
  decorateRoom,
  publicUser
}
