<template>
  <view :class="themeClass" class="settings-page">
    <IosNav title="账本设置" @leftClick="goBack" />

    <scroll-view scroll-y class="settings-scroll" :show-scrollbar="false">
      <view v-if="isLoading" class="content">
        <view class="skeleton hero-skeleton"></view>
        <view class="skeleton card-skeleton"></view>
        <view class="skeleton card-skeleton short"></view>
      </view>

      <view v-else-if="isError" class="state-view">
        <text class="state-title">账本加载失败</text>
        <text class="state-desc">请检查网络后重新加载</text>
        <button class="primary-btn" @click="loadRoom">重新加载</button>
      </view>

      <view v-else class="content">
        <view class="book-hero">
          <view class="book-icon">
            <AppIcon :value="form.avatar || 'mc:notebook-2'" :size="26" />
          </view>
          <view class="hero-copy">
            <text class="book-name">{{ room.name }}</text>
            <text class="book-meta">{{ room.memberCount || 0 }} 位成员 · {{ roleLabel }}</text>
          </view>
          <view class="role-pill" :class="`role-${currentRole}`">{{ roleLabel }}</view>
        </view>

        <view v-if="canManage" class="section">
          <text class="section-title">账本资料</text>
          <view class="form-card">
            <view class="field">
              <text class="field-label">账本名称</text>
              <input v-model="form.name" class="field-input" maxlength="40" placeholder="例如：家庭日常账本" />
            </view>

            <view class="field">
              <text class="field-label">账本图标</text>
              <view class="icon-options">
                <view
                  v-for="icon in iconOptions"
                  :key="icon"
                  class="icon-option"
                  :class="{ active: form.avatar === icon }"
                  @click="form.avatar = icon"
                >
                  <AppIcon :value="icon" :size="24" />
                </view>
              </view>
            </view>

            <view class="field">
              <text class="field-label">账本说明</text>
              <textarea
                v-model="form.description"
                class="field-textarea"
                maxlength="200"
                placeholder="说明这个账本用于记录什么"
              />
            </view>

            <view class="field">
              <text class="field-label">月度预算（元）</text>
              <input
                v-model="form.budget"
                class="field-input"
                type="digit"
                placeholder="0 表示不设置预算"
              />
            </view>

            <button class="primary-btn save-btn" :disabled="isSaving" @click="saveRoom">
              {{ isSaving ? '保存中…' : '保存账本资料' }}
            </button>
          </view>
        </view>

        <view class="section">
          <text class="section-title">协作管理</text>
          <view class="action-card">
            <view class="action-row" @click="openMembers">
              <view class="action-icon">
                <text>成员</text>
              </view>
              <view class="action-copy">
                <text class="action-title">成员与权限</text>
                <text class="action-desc">查看成员、调整角色或移除成员</text>
              </view>
              <text class="action-arrow">›</text>
            </view>
            <view v-if="canManage" class="row-divider"></view>
            <view v-if="canManage" class="action-row" @click="openInvite">
              <view class="action-icon">
                <text>邀请</text>
              </view>
              <view class="action-copy">
                <text class="action-title">邀请成员</text>
                <text class="action-desc">通过微信分享或邀请码加入账本</text>
              </view>
              <text class="action-arrow">›</text>
            </view>
          </view>
        </view>

        <view class="section">
          <text class="section-title">账本操作</text>
          <view class="action-card">
            <view v-if="isOwner" class="action-row" @click="openTransferPicker">
              <view class="action-icon neutral">
                <text>转让</text>
              </view>
              <view class="action-copy">
                <text class="action-title">转让创建者</text>
                <text class="action-desc">转让后你将变为管理员</text>
              </view>
              <text class="action-arrow">›</text>
            </view>
            <view v-if="isOwner" class="row-divider"></view>
            <view class="action-row danger" @click="handleLeaveOrDissolve">
              <view class="action-icon danger">
                <text>{{ isOwner ? '解散' : '退出' }}</text>
              </view>
              <view class="action-copy">
                <text class="action-title danger-text">{{ isOwner ? '解散账本' : '退出账本' }}</text>
                <text class="action-desc">
                  {{ isOwner ? '解散后所有成员将失去访问权限' : '退出后可再次通过邀请加入' }}
                </text>
              </view>
              <text class="action-arrow danger-text">›</text>
            </view>
          </view>
        </view>

        <text class="footer-note">
          删除采用云端软删除，历史数据会保留在云数据库中，但账本不再对成员开放。
        </text>
      </view>
      <view class="safe-bottom-spacer"></view>
    </scroll-view>

    <InviteModal
      v-model="showInvite"
      :invite-code="inviteCode"
      :room-name="room.name || '我的账本'"
      :room-icon="room.avatar || 'mc:notebook-2'"
      :room-id="roomId"
      @share="handleInviteShare"
    />

    <BottomPicker
      v-model="showTransferPicker"
      title="选择新的创建者"
      subtitle="创建者拥有转让与解散账本的权限"
      layout="list"
      :options="transferOptions"
      :current-selected="''"
      @change="confirmTransfer"
    />
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import IosNav from '../../components/nav/ios-nav.vue'
import AppIcon from '../../components/common/AppIcon.vue'
import InviteModal from '../../components/common/InviteModal.vue'
import BottomPicker from '../../components/common/BottomPicker.vue'
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { memberApi, roomApi } from '../../common/api'
import { STORAGE_KEYS } from '../../common/config'
import { useUserStore } from '@/store/user'
import { goBackSafe } from '@/common/utils/nav.js'

const { themeClass } = useAppTheme()
const userStore = useUserStore()

const roomId = ref('')
const room = ref({})
const members = ref([])
const isLoading = ref(true)
const isError = ref(false)
const isSaving = ref(false)
const showInvite = ref(false)
const showTransferPicker = ref(false)
const inviteCode = ref('')

const form = reactive({
  name: '',
  description: '',
  avatar: 'mc:notebook-2',
  budget: ''
})

const iconOptions = ['mc:notebook-2', 'mc:home-5', 'mc:home-2', 'mc:group-2', 'mc:ticket', 'mc:bill', 'mc:airplane', 'mc:aiming-2']

const currentUserId = computed(() => String(userStore.currentUserId || ''))
const currentRole = computed(() => room.value.userRole || room.value.role || 'viewer')
const canManage = computed(() => !!room.value.canManage || ['owner', 'admin'].includes(currentRole.value))
const isOwner = computed(() => currentRole.value === 'owner' || String(room.value.ownerId || '') === currentUserId.value)
const roleLabel = computed(() => ({
  owner: '创建者',
  admin: '管理员',
  member: '成员',
  viewer: '只读成员'
}[currentRole.value] || '只读成员'))

const transferOptions = computed(() =>
  members.value
    .filter((item) => item.role !== 'owner' && String(item.userId) !== currentUserId.value)
    .map((item) => ({
      id: item.userId,
      label: `${item.nickname || '成员'} · ${roleLabelOf(item.role)}`,
      icon: item.avatar || 'mc:user-2'
    }))
)

function roleLabelOf(role) {
  return {
    owner: '创建者',
    admin: '管理员',
    member: '成员',
    viewer: '只读成员'
  }[role] || '成员'
}

function fillForm(nextRoom) {
  form.name = nextRoom.name || ''
  form.description = nextRoom.description || ''
  form.avatar = nextRoom.avatar || 'mc:notebook-2'
  form.budget = Number(nextRoom.budget || 0) || ''
}

async function loadRoom() {
  if (!roomId.value) {
    isError.value = true
    isLoading.value = false
    return
  }

  isLoading.value = true
  isError.value = false
  try {
    const result = await roomApi.getRoomInfo(roomId.value)
    if (result.code !== 0 || !result.data) throw new Error(result.message || '加载失败')
    room.value = result.data
    members.value = result.data.members || []
    inviteCode.value = result.data.inviteCode || ''
    fillForm(room.value)
  } catch (error) {
    isError.value = true
  } finally {
    isLoading.value = false
  }
}

function syncCurrentRoomCache() {
  try {
    const cached = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
    if (cached && String(cached.id) === String(roomId.value)) {
      uni.setStorageSync(STORAGE_KEYS.CURRENT_ROOM, {
        id: roomId.value,
        name: room.value.name,
        avatar: room.value.avatar || 'mc:notebook-2'
      })
    }
  } catch (error) {
    console.warn('[room-settings] 更新当前账本缓存失败', error)
  }
}

async function saveRoom() {
  const name = String(form.name || '').trim()
  if (!name) {
    uni.showToast({ title: '请输入账本名称', icon: 'none' })
    return
  }

  const budget = Number(form.budget || 0)
  if (!Number.isFinite(budget) || budget < 0) {
    uni.showToast({ title: '预算金额不正确', icon: 'none' })
    return
  }

  isSaving.value = true
  try {
    const result = await roomApi.updateRoomInfo({
      roomId: roomId.value,
      name,
      description: String(form.description || '').trim(),
      avatar: form.avatar || 'mc:notebook-2',
      budget
    })
    if (result.code !== 0) throw new Error(result.message || '保存失败')
    room.value = { ...room.value, ...result.data }
    fillForm(room.value)
    syncCurrentRoomCache()
    uni.$emit('refresh_room_data', { roomId: roomId.value, roomName: name })
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (error) {
    uni.showToast({ title: error.message || '保存失败', icon: 'none' })
  } finally {
    isSaving.value = false
  }
}

function openMembers() {
  uni.navigateTo({ url: `/pages/member-management/member-management?roomId=${roomId.value}` })
}

async function openInvite() {
  if (!inviteCode.value) {
    try {
      const result = await roomApi.generateInviteCode(roomId.value)
      if (result.code === 0) inviteCode.value = result.data.code || result.data.inviteCode || ''
    } catch (error) {
      uni.showToast({ title: '邀请码生成失败', icon: 'none' })
      return
    }
  }
  showInvite.value = true
}

function handleInviteShare() {
  showInvite.value = false
}

function openTransferPicker() {
  if (!transferOptions.value.length) {
    uni.showToast({ title: '至少需要一名其他成员才能转让', icon: 'none' })
    return
  }
  showTransferPicker.value = true
}

function confirmTransfer(option) {
  if (!option || !option.id) return
  uni.showModal({
    title: '确认转让创建者',
    content: '转让后你将变为管理员，且无法撤销。确定继续吗？',
    confirmText: '确认转让',
    confirmColor: '#C4554D',
    success: async (result) => {
      if (!result.confirm) return
      uni.showLoading({ title: '正在转让…', mask: true })
      try {
        const response = await roomApi.transferOwner(roomId.value, option.id)
        if (response.code !== 0) throw new Error(response.message || '转让失败')
        uni.hideLoading()
        uni.showToast({ title: '已转让', icon: 'success' })
        setTimeout(() => uni.switchTab({ url: '/pages/room-list/room-list' }), 700)
      } catch (error) {
        uni.hideLoading()
        uni.showToast({ title: error.message || '转让失败', icon: 'none' })
      }
    }
  })
}

function handleLeaveOrDissolve() {
  if (isOwner.value) {
    dissolveRoom()
    return
  }
  leaveRoom()
}

function leaveRoom() {
  uni.showModal({
    title: '退出账本',
    content: `确定退出「${room.value.name}」吗？退出后将无法继续查看该账本。`,
    confirmText: '确认退出',
    confirmColor: '#C4554D',
    success: async (result) => {
      if (!result.confirm) return
      uni.showLoading({ title: '正在退出…', mask: true })
      try {
        const response = await memberApi.leave(roomId.value)
        if (response.code !== 0) throw new Error(response.message || '退出失败')
        clearCurrentRoomCache()
        uni.hideLoading()
        uni.showToast({ title: '已退出账本', icon: 'success' })
        setTimeout(() => uni.switchTab({ url: '/pages/room-list/room-list' }), 600)
      } catch (error) {
        uni.hideLoading()
        uni.showToast({ title: error.message || '退出失败', icon: 'none' })
      }
    }
  })
}

function dissolveRoom() {
  uni.showModal({
    title: '解散账本',
    content: `此操作会关闭「${room.value.name}」并移除全部成员权限。请输入账本名称确认。`,
    editable: true,
    placeholderText: room.value.name,
    confirmText: '确认解散',
    confirmColor: '#C4554D',
    success: async (result) => {
      if (!result.confirm) return
      if (String(result.content || '').trim() !== String(room.value.name || '').trim()) {
        uni.showToast({ title: '账本名称不匹配', icon: 'none' })
        return
      }
      uni.showLoading({ title: '正在解散…', mask: true })
      try {
        const response = await roomApi.deleteRoom(roomId.value)
        if (response.code !== 0) throw new Error(response.message || '解散失败')
        clearCurrentRoomCache()
        uni.hideLoading()
        uni.showToast({ title: '账本已解散', icon: 'success' })
        setTimeout(() => uni.switchTab({ url: '/pages/room-list/room-list' }), 700)
      } catch (error) {
        uni.hideLoading()
        uni.showToast({ title: error.message || '解散失败', icon: 'none' })
      }
    }
  })
}

function clearCurrentRoomCache() {
  try {
    const cached = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
    if (cached && String(cached.id) === String(roomId.value)) {
      uni.removeStorageSync(STORAGE_KEYS.CURRENT_ROOM)
      userStore.setCurrentRoom(null)
    }
  } catch (error) {
    console.warn('[room-settings] 清理当前账本缓存失败', error)
  }
}

function goBack() {
  goBackSafe()
}

onLoad((options = {}) => {
  let id = options.roomId || ''
  if (!id) {
    try {
      const cached = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
      id = cached && cached.id ? cached.id : ''
    } catch (error) {
      id = ''
    }
  }
  roomId.value = String(id || '')
  loadRoom()
})
</script>

<style scoped>
.settings-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-page, #F6F8F8);
}

.settings-scroll {
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

.hero-skeleton {
  height: 88px;
  margin-bottom: 18px;
}

.card-skeleton {
  height: 240px;
  margin-bottom: 14px;
}

.card-skeleton.short {
  height: 140px;
}

@keyframes skeletonPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.book-hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  margin-bottom: 20px;
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-lg, 16px);
}

.book-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--radius-md, 12px);
  background: var(--primary-soft, #E9F0F2);
}

.hero-copy {
  flex: 1;
  min-width: 0;
}

.book-name {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-meta {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
}

.role-pill {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: var(--radius-pill, 999px);
  font-size: 11px;
  font-weight: 600;
  background: var(--primary-soft, #E9F0F2);
  color: var(--primary-color, #2F5D6B);
}

.role-owner {
  background: #F4E9D8;
  color: #8A5B22;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  display: block;
  margin: 0 4px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #94A3B8);
}

.form-card,
.action-card {
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;
}

.form-card {
  padding: 16px;
}

.field + .field {
  margin-top: 16px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-sub, #64748B);
}

.field-input,
.field-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-md, 12px);
  background: #F8FAFA;
  color: var(--text-ink, #1E293B);
  font-size: 15px;
}

.field-input {
  height: 46px;
}

.field-textarea {
  height: 88px;
  line-height: 1.5;
}

.icon-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.icon-option {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-md, 12px);
  background: #F8FAFA;
}

.icon-option.active {
  border-color: var(--primary-color, #2F5D6B);
  background: var(--primary-soft, #E9F0F2);
}

.primary-btn {
  width: 100%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md, 12px);
  background: var(--primary-color, #2F5D6B);
  color: #FFFFFF;
  font-size: 15px;
  font-weight: 600;
}

.primary-btn::after {
  border: none;
}

.primary-btn:active {
  opacity: 0.88;
}

.save-btn {
  margin-top: 20px;
}

.action-row {
  min-height: 68px;
  padding: 12px 16px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-row:active {
  background: #F8FAFA;
}

.action-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius-md, 12px);
  background: var(--primary-soft, #E9F0F2);
  color: var(--primary-color, #2F5D6B);
  font-size: 11px;
  font-weight: 600;
}

.action-icon.neutral {
  background: #EEF2F5;
  color: var(--text-sub, #607080);
}

.action-icon.danger {
  background: var(--color-expense-soft, #F6E7E5);
  color: var(--color-expense, #C4554D);
}

.action-copy {
  flex: 1;
  min-width: 0;
}

.action-title {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-ink, #1E293B);
}

.action-desc {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
}

.action-arrow {
  font-size: 20px;
  color: var(--text-faint, #CBD5E1);
}

.row-divider {
  height: 1px;
  margin-left: 70px;
  background: var(--line-hairline, #E8EEEF);
}

.danger-text {
  color: var(--color-expense, #C4554D);
}

.footer-note {
  display: block;
  padding: 0 6px 12px;
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

.state-view .primary-btn {
  width: 180px;
}
</style>
