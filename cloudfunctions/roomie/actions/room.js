const { requireUser, requireMembership } = require('../lib/context')
const { badRequest } = require('../lib/errors')
const membership = require('../lib/membership')

const firstParam = (params) => (Array.isArray(params) && params.length ? params[0] : '')
const roomIdOf = (payload = {}, query = {}, params) =>
  payload.roomId || query.roomId || payload.id || query.id || firstParam(params)

/** 创建空间。 */
async function createRoom({ openid, payload, query }) {
  const user = await requireUser(openid)
  return membership.createRoom(user, { ...payload, currentUserId: query.currentUserId || payload.currentUserId })
}

/** 当前用户的房间列表。 */
async function rooms({ openid }) {
  const user = await requireUser(openid)
  return membership.listRooms(user.id)
}

/** 通过邀请码加入。 */
async function join({ openid, payload }) {
  const user = await requireUser(openid)
  return membership.joinByCode(user, payload.inviteCode || payload.code)
}

/** 房间详情。 */
async function detail({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const { user } = await requireMembership(openid, roomId, 'viewer')
  return membership.getRoomDetail(roomId, user.id)
}

/** 成员列表。 */
async function members({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  await requireMembership(openid, roomId, 'viewer')
  return membership.listMembers(roomId)
}

/** 修改房间名称（兼容 ?roomId=&name= 的旧调用）。 */
async function updateName({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const { user, member } = await requireMembership(openid, roomId, 'admin')
  return membership.updateRoom(user, roomId, { name: payload.name || query.name }, member.role)
}

/** 更新空间信息（名称/描述/预算）。 */
async function update({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const { user, member } = await requireMembership(openid, roomId, 'admin')
  return membership.updateRoom(user, roomId, payload, member.role)
}

/** 更新预算。 */
async function updateBudget({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const { user, member } = await requireMembership(openid, roomId, 'admin')
  return membership.updateRoom(user, roomId, { budget: payload.budget === undefined || payload.budget === null ? payload.budgetAmount : payload.budget }, member.role)
}

/** 解散空间。 */
async function remove({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const user = await requireUser(openid)
  return membership.deleteRoom(user, roomId)
}

/** 转让创建者。 */
async function transferOwner({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const user = await requireUser(openid)
  const targetUserId = payload.targetUserId || payload.userId || query.targetUserId || query.userId
  return membership.transferOwner(user, roomId, targetUserId)
}

/** 生成邀请码（也可用于定向邀请）。 */
async function invite({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const { user } = await requireMembership(openid, roomId, 'admin')
  return membership.createInvite(user, roomId, payload.inviteeId || '')
}

/** 首页概览。 */
async function dashboardOverview({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const { user } = await requireMembership(openid, roomId, 'viewer')
  return membership.dashboardOverview(roomId, user.id, {
    type: payload.type || query.type || 'month'
  })
}

/** 待处理邀请。 */
async function invitationPending({ openid }) {
  const user = await requireUser(openid)
  return membership.listPendingInvitations(user.id)
}

async function invitationAccept({ openid, payload, query }) {
  const user = await requireUser(openid)
  const invitationId = payload.invitationId || query.invitationId
  if (!invitationId) throw badRequest('缺少邀请标识')
  return membership.acceptInvitation(user, invitationId)
}

async function invitationReject({ openid, payload, query }) {
  const user = await requireUser(openid)
  const invitationId = payload.invitationId || query.invitationId
  if (!invitationId) throw badRequest('缺少邀请标识')
  return membership.rejectInvitation(user, invitationId)
}

async function invitationAcceptAll({ openid }) {
  const user = await requireUser(openid)
  return membership.handleAllInvitations(user, true)
}

async function invitationRejectAll({ openid }) {
  const user = await requireUser(openid)
  return membership.handleAllInvitations(user, false)
}

/** 成员管理：房间维度视图。 */
async function permissionRooms({ openid }) {
  const user = await requireUser(openid)
  const rooms = await membership.listRooms(user.id)
  return rooms.map((room) => ({ ...room, canManage: ['owner', 'admin'].includes(room.role) }))
}

async function permissionDetail({ openid, payload, query, params }) {
  const roomId = roomIdOf(payload, query, params)
  const { user, member } = await requireMembership(openid, roomId, 'viewer')
  const members = await membership.listMembers(roomId)
  const owner = members.find((item) => item.role === 'owner') || null
  const teamMembers = members.filter((item) => item.role !== 'owner')
  return {
    roomId,
    currentUserId: user.id,
    currentRole: member.role,
    canManage: ['owner', 'admin'].includes(member.role),
    owner,
    teamMembers,
    members
  }
}

async function permissionUpdateRole({ openid, payload, query }) {
  const roomId = payload.roomId || query.roomId
  const targetUserId = payload.userId || payload.targetUserId || query.userId
  const role = payload.role || query.role
  if (!roomId || !targetUserId || !role) throw badRequest('缺少成员或角色参数')

  const { user, member } = await requireMembership(openid, roomId, 'admin')
  return membership.updateMemberRole(user, member.role, roomId, targetUserId, role)
}

/** 兼容：/roomNumber/removeMember 的路由别名由 member 模块处理，这里保留同名方法。 */
async function removeMember({ openid, payload, query }) {
  const roomId = payload.roomId || query.roomId
  const targetUserId = payload.userId || payload.targetUserId || query.userId
  if (!roomId || !targetUserId) throw badRequest('缺少房间或成员标识')

  const { user, member } = await requireMembership(openid, roomId, 'admin')
  return membership.removeMember(user, member.role, roomId, targetUserId)
}

module.exports = {
  createRoom,
  rooms,
  join,
  detail,
  members,
  updateName,
  update,
  updateBudget,
  transferOwner,
  delete: remove,
  invite,
  dashboardOverview,
  invitationPending,
  invitationAccept,
  invitationReject,
  invitationAcceptAll,
  invitationRejectAll,
  permissionRooms,
  permissionDetail,
  permissionUpdateRole,
  removeMember
}
