const { requireUser, requireMembership } = require('../lib/context')
const membership = require('../lib/membership')

/**
 * 成员管理模块。
 * 前端历史路径 /roomNumber/removeMember 与 /room/removeMember 都指向这里。
 */
async function removeMember({ openid, payload, query, params }) {
  const roomId = payload.roomId || query.roomId || (params && params[0])
  const targetUserId = payload.userId || payload.targetUserId || query.userId
  if (!roomId || !targetUserId) throw badRequest('缺少房间或成员标识')

  const { user, member } = await requireMembership(openid, roomId, 'admin')
  return membership.removeMember(user, member.role, roomId, targetUserId)
}

/** 成员列表（独立入口，便于组件直接调用）。 */
async function list({ openid, payload, query, params }) {
  const roomId = payload.roomId || query.roomId || (params && params[0])
  await requireMembership(openid, roomId, 'viewer')
  return membership.listMembers(roomId)
}

/** 退出空间。 */
async function leave({ openid, payload, query, params }) {
  const roomId = payload.roomId || query.roomId || (params && params[0])
  const { user } = await requireMembership(openid, roomId, 'viewer')
  return membership.leaveRoom(user, roomId)
}

module.exports = {
  removeMember,
  list,
  leave
}
