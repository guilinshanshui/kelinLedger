<template>
  <view :class="themeClass" class="member-page">
    <IosNav title="成员与权限" @leftClick="goBack" />

    <view v-if="isLoading" class="content">
      <view class="skeleton room-skeleton"></view>
      <view class="skeleton list-skeleton"></view>
      <view class="skeleton list-skeleton"></view>
    </view>

    <view v-else-if="isError" class="state-view">
      <text class="state-title">成员加载失败</text>
      <text class="state-desc">请检查网络后重新加载</text>
      <button class="primary-btn" @click="loadPage">重新加载</button>
    </view>

    <scroll-view v-else scroll-y class="member-scroll" :show-scrollbar="false">
      <view class="content">
        <view class="room-card" @click="showRoomPicker = true">
          <view class="room-icon">
            <AppIcon :value="currentRoom.avatar || 'mc:notebook-2'" :size="24" />
          </view>
          <view class="room-copy">
            <text class="room-name">{{ currentRoom.name || '选择账本' }}</text>
            <text class="room-desc">{{ members.length }} 位成员 · {{ roleLabel(currentRole) }}</text>
          </view>
          <text class="room-switch">切换</text>
        </view>

        <view class="section">
          <text class="section-title">创建者</text>
          <view v-if="owner" class="member-row owner-row">
            <UserAvatar :src="owner.avatar" :name="owner.nickname" :size="44" radius="12px" class="member-avatar" />
            <view class="member-copy">
              <text class="member-name">{{ owner.nickname }}{{ owner.isMe ? '（我）' : '' }}</text>
              <text class="member-hint">负责账本创建与最终决策</text>
            </view>
            <view class="role-tag owner-tag">创建者</view>
          </view>
        </view>

        <view class="section">
          <view class="section-header">
            <text class="section-title">协作成员</text>
            <text v-if="canManage" class="section-action" @click="openInvite">邀请成员</text>
          </view>

          <view v-if="teamMembers.length" class="member-list">
            <view v-for="(item, index) in teamMembers" :key="item.userId || index" class="member-row">
              <UserAvatar :src="item.avatar" :name="item.nickname" :size="44" radius="12px" class="member-avatar" />
              <view class="member-copy">
                <text class="member-name">{{ item.nickname }}{{ item.isMe ? '（我）' : '' }}</text>
                <text class="member-hint">{{ roleLabel(item.role) }}{{ item.isMe ? ' · 当前账号' : '' }}</text>
              </view>
              <view class="role-tag" :class="`role-${item.role}`">{{ roleLabel(item.role) }}</view>
              <view v-if="canEditMember(item)" class="edit-action" @click.stop="openRolePicker(item)">
                <text>调整</text>
              </view>
              <view v-if="canRemoveMember(item)" class="remove-action" @click.stop="removeMember(item)">
                <text>移除</text>
              </view>
            </view>
          </view>

          <view v-else class="empty-view">
            <text class="empty-title">还没有其他成员</text>
            <text class="empty-desc">邀请家人或室友加入，开始共同记账</text>
            <button v-if="canManage" class="primary-btn empty-btn" @click="openInvite">邀请成员</button>
          </view>
        </view>

        <view class="permission-note">
          <text>权限从高到低为：创建者、管理员、成员、只读成员。管理员不能修改同级或更高权限的成员。</text>
        </view>
      </view>
      <view class="safe-bottom-spacer"></view>
    </scroll-view>

    <BottomPicker
      v-model="showRoomPicker"
      title="切换账本"
      layout="list"
      :options="roomOptions"
      :current-selected="roomId"
      @change="switchRoom"
    />

    <BottomPicker
      v-model="showRolePicker"
      title="调整成员权限"
      subtitle="权限变更会立即同步到云端"
      layout="list"
      :options="roleOptions"
      :current-selected="selectedMember.role"
      @change="changeRole"
    />

    <InviteModal
      v-model="showInvite"
      :invite-code="currentRoom.inviteCode || ''"
      :room-name="currentRoom.name || '我的账本'"
      :room-icon="currentRoom.avatar || 'mc:notebook-2'"
      :room-id="roomId"
    />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import IosNav from '../../components/nav/ios-nav.vue'
import BottomPicker from '../../components/common/BottomPicker.vue'
import InviteModal from '../../components/common/InviteModal.vue'
import AppIcon from '../../components/common/AppIcon.vue'
import UserAvatar from '../../components/common/UserAvatar.vue'
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { memberApi, roomApi } from '../../common/api'
import { STORAGE_KEYS } from '../../common/config'
import { useUserStore } from '@/store/user'
import { goBackSafe } from '@/common/utils/nav.js'

const { themeClass } = useAppTheme()
const userStore = useUserStore()

const roomId = ref('')
const rooms = ref([])
const members = ref([])
const isLoading = ref(true)
const isError = ref(false)
const showRoomPicker = ref(false)
const showRolePicker = ref(false)
const showInvite = ref(false)
const selectedMember = ref({})

const roleOptions = [
  { id: 'admin', label: '管理员', icon: 'mc:safe-shield', subtitle: '可管理账本内容与普通成员' },
  { id: 'member', label: '成员', icon: 'mc:user-2', subtitle: '可记账并管理自己的内容' },
  { id: 'viewer', label: '只读成员', icon: 'mc:eye', subtitle: '只能查看，不能修改数据' }
]

const currentRoom = computed(() =>
  rooms.value.find((item) => String(item.id) === String(roomId.value)) || rooms.value[0] || {}
)

const currentUserId = computed(() => String(userStore.currentUserId || ''))

const owner = computed(() => {
  const item = members.value.find((member) => member.role === 'owner')
  return item ? { ...item, isMe: String(item.userId) === currentUserId.value } : null
})

const teamMembers = computed(() =>
  members.value
    .filter((item) => item.role !== 'owner')
    .sort((a, b) => roleRank(b.role) - roleRank(a.role))
    .map((item) => ({ ...item, isMe: String(item.userId) === currentUserId.value }))
)

const currentRole = computed(() => {
  if (owner.value && owner.value.isMe) return 'owner'
  const me = teamMembers.value.find((item) => item.isMe)
  return me ? me.role : 'viewer'
})

const canManage = computed(() => ['owner', 'admin'].includes(currentRole.value))

const roomOptions = computed(() =>
  rooms.value.map((item) => ({
    id: item.id,
    label: item.name,
    icon: item.avatar || 'mc:notebook-2',
    inviteCode: item.inviteCode || ''
  }))
)

function roleRank(role) {
  return { viewer: 1, member: 2, admin: 3, owner: 4 }[role] || 0
}

function roleLabel(role) {
  return {
    owner: '创建者',
    admin: '管理员',
    member: '成员',
    viewer: '只读成员'
  }[role] || '成员'
}

function canEditMember(member) {
  if (!member || member.isMe || member.role === 'owner') return false
  if (currentRole.value === 'owner') return true
  if (currentRole.value === 'admin') return ['member', 'viewer'].includes(member.role)
  return false
}

function canRemoveMember(member) {
  return canEditMember(member)
}

async function loadMembers() {
  const result = await memberApi.list(roomId.value)
  if (result.code !== 0) throw new Error(result.message || '成员加载失败')
  members.value = result.data || []
}

async function loadRooms() {
  const result = await roomApi.getRoomList()
  if (result.code !== 0) throw new Error(result.message || '账本加载失败')
  rooms.value = result.data || []
  if (!roomId.value && rooms.value.length) roomId.value = String(rooms.value[0].id)
  if (!roomId.value) throw new Error('暂无可管理的账本')
}

async function loadPage() {
  isLoading.value = true
  isError.value = false
  try {
    await loadRooms()
    await loadMembers()
  } catch (error) {
    isError.value = true
  } finally {
    isLoading.value = false
  }
}

function switchRoom(option) {
  if (!option || !option.id || String(option.id) === String(roomId.value)) return
  roomId.value = String(option.id)
  loadPage()
}

function openRolePicker(member) {
  selectedMember.value = { ...member }
  showRolePicker.value = true
}

async function changeRole(option) {
  if (!option || !selectedMember.value.userId) return
  const role = option.id
  if (!['admin', 'member', 'viewer'].includes(role)) return

  uni.showLoading({ title: '正在保存…', mask: true })
  try {
    const result = await memberApi.updateRole(roomId.value, selectedMember.value.userId, role)
    if (result.code !== 0) throw new Error(result.message || '权限修改失败')
    await loadMembers()
    uni.hideLoading()
    uni.showToast({ title: '权限已更新', icon: 'success' })
  } catch (error) {
    uni.hideLoading()
    uni.showToast({ title: error.message || '权限修改失败', icon: 'none' })
  }
}

function removeMember(member) {
  uni.showModal({
    title: '移除成员',
    content: `确定将「${member.nickname}」移出账本吗？移除后对方将无法继续访问。`,
    confirmText: '确认移除',
    confirmColor: '#C4554D',
    success: async (result) => {
      if (!result.confirm) return
      uni.showLoading({ title: '正在处理…', mask: true })
      try {
        const response = await memberApi.remove(roomId.value, member.userId)
        if (response.code !== 0) throw new Error(response.message || '移除失败')
        await loadMembers()
        uni.hideLoading()
        uni.showToast({ title: '已移除', icon: 'success' })
      } catch (error) {
        uni.hideLoading()
        uni.showToast({ title: error.message || '移除失败', icon: 'none' })
      }
    }
  })
}

function openInvite() {
  if (!canManage.value) {
    uni.showToast({ title: '当前权限不能邀请成员', icon: 'none' })
    return
  }
  showInvite.value = true
}

function goBack() {
  goBackSafe()
}

onLoad((options = {}) => {
  const requestedRoomId = options.roomId ? String(options.roomId) : ''
  if (requestedRoomId) {
    roomId.value = requestedRoomId
  } else {
    try {
      const cached = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
      roomId.value = cached && cached.id ? String(cached.id) : ''
    } catch (error) {
      roomId.value = ''
    }
  }
  loadPage()
})
</script>

<style scoped>
.member-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-page, #F6F8F8);
}

.member-scroll {
  flex: 1;
  height: 0;
}

.content {
  padding: 12px 16px 0;
}

.skeleton {
  background: var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-md, 12px);
  animation: skeletonPulse 1.4s ease-in-out infinite;
}

.room-skeleton {
  height: 72px;
  margin-bottom: 20px;
}

.list-skeleton {
  height: 72px;
  margin-bottom: 12px;
}

@keyframes skeletonPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.room-card {
  min-height: 72px;
  padding: 12px 14px;
  margin-bottom: 20px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-lg, 16px);
}

.room-icon {
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--radius-md, 12px);
  background: var(--primary-soft, #E9F0F2);
}

.room-copy {
  flex: 1;
  min-width: 0;
}

.room-name {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}

.room-desc {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
}

.room-switch {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--primary-color, #2F5D6B);
}

.section {
  margin-bottom: 22px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  display: block;
  margin: 0 4px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #94A3B8);
}

.section-action {
  margin-right: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-color, #2F5D6B);
}

.member-list,
.owner-row {
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;
}

.member-row {
  min-height: 72px;
  padding: 12px 14px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
}

.member-list .member-row + .member-row {
  border-top: 1px solid var(--line-hairline, #E8EEEF);
}

.member-avatar {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius-md, 12px);
  background: #F1F5F9;
}

.member-copy {
  flex: 1;
  min-width: 0;
}

.member-name {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-ink, #1E293B);
}

.member-hint {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
}

.role-tag {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: var(--radius-pill, 999px);
  font-size: 11px;
  font-weight: 500;
  background: #F1F5F9;
  color: var(--text-sub, #64748B);
}

.role-owner,
.owner-tag {
  background: #F4E9D8;
  color: #8A5B22;
}

.role-admin {
  background: var(--primary-soft, #E9F0F2);
  color: var(--primary-color, #2F5D6B);
}

.edit-action,
.remove-action {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
}

.edit-action {
  color: var(--primary-color, #2F5D6B);
}

.remove-action {
  color: var(--color-expense, #C4554D);
}

.empty-view {
  padding: 32px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-lg, 16px);
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}

.empty-desc {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-muted, #94A3B8);
}

.primary-btn {
  height: 46px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md, 12px);
  background: var(--primary-color, #2F5D6B);
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 600;
}

.primary-btn::after {
  border: none;
}

.empty-btn {
  margin-top: 18px;
}

.permission-note {
  padding: 0 4px 16px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted, #94A3B8);
}

.safe-bottom-spacer {
  height: calc(24px + env(safe-area-inset-bottom));
}

.state-view {
  min-height: 60vh;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.state-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}

.state-desc {
  margin: 8px 0 20px;
  font-size: 13px;
  color: var(--text-muted, #94A3B8);
}
</style>
