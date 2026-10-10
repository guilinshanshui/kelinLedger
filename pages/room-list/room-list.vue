<template>
  <view :class="themeClass" class="books-page">
    <!-- 顶部标题区（Tab 页，无返回按钮） -->
    <view class="page-header">
      <view class="header-row">
        <text class="header-sub">共 {{ rooms.length }} 个账本，点击卡片即可切换</text>
        <view class="header-action" @click="onCreateRoom">
          <text class="header-action-icon">+</text>
        </view>
      </view>
    </view>

    <scroll-view scroll-y class="books-scroll" :show-scrollbar="false">
      <!-- 账本卡片 -->
      <view class="cards-stack">
        <view
          v-for="(room, index) in rooms"
          :key="room.id"
          class="book-card animate-fade-in"
          :class="{ 'is-current': room.id === currentRoomId }"
          :style="{ animationDelay: index * 0.06 + 's' }"
          @click="onSwitchBook(room)"
        >
          <!-- 上部：图标 + 名称 + 人数 + 设置 -->
          <view class="card-top">
            <view class="book-icon" :style="{ background: softColor }">
              <AppIcon :value="room.avatar || 'mc:notebook-2'" :size="24" />
            </view>

            <view class="book-meta">
              <view class="book-name-row">
                <text class="book-name">{{ room.name }}</text>
                <view v-if="room.id === currentRoomId" class="current-tag">
                  <text class="current-tag-txt">当前</text>
                </view>
              </view>
              <text class="book-members">{{ room.memberCount || 1 }} 人</text>
            </view>

            <view class="gear-btn" @click.stop="onManage(room)">
            <AppIcon name="settings-3" :size="18" />
            </view>
          </view>

          <!-- 中部：支 / 收 / 结 -->
          <view class="stats-row">
            <view class="stat-col">
              <text class="stat-label">支</text>
              <text class="stat-value expense">{{ formatMoneyShort(room.stats?.expense) }}</text>
            </view>
            <view class="stat-divider"></view>
            <view class="stat-col">
              <text class="stat-label">收</text>
              <text class="stat-value income">{{ formatMoneyShort(room.stats?.income) }}</text>
            </view>
            <view class="stat-divider"></view>
            <view class="stat-col">
              <text class="stat-label">结</text>
              <text class="stat-value balance">{{ formatMoneyShort(room.stats?.balance) }}</text>
            </view>
          </view>

          <!-- 下部：操作按钮 -->
          <view v-if="room.canManage" class="card-actions">
            <button class="action-btn primary" @click.stop="onInvite(room)">
              <text class="action-txt">邀请好友</text>
            </button>
            <button class="action-btn ghost" @click.stop="onImport(room)">
              <text class="action-txt ghost-txt">导入账单</text>
            </button>
          </view>
        </view>

        <!-- 新建 / 加入账本：两个入口都摆在明面上，不用再猜邀请码往哪输 -->
        <view class="add-row">
          <view class="add-card" @click="onCreateRoom">
            <AppIcon name="add" :size="22" />
            <text class="add-txt">新建账本</text>
          </view>
          <view class="add-card" @click="onJoinRoom">
            <AppIcon name="ticket" :size="22" />
            <text class="add-txt">加入账本</text>
          </view>
        </view>
      </view>

      <view class="safe-bottom-spacer"></view>
    </scroll-view>

    <!-- 邀请码弹窗 -->
    <view v-if="inviteVisible" class="modal-mask" @click="inviteVisible = false">
      <view class="modal-box" @click.stop>
        <text class="modal-title">邀请好友加入</text>
        <text class="modal-book">{{ inviteRoomName }}</text>
        <view class="invite-code-box">
          <text class="invite-code">{{ inviteCode || '------' }}</text>
        </view>
        <text class="modal-hint">把邀请码发给家人或室友，让他们在「账本」页点「加入账本」，输入这串码即可</text>
        <button class="action-btn primary modal-btn" @click="copyInviteCode">
          <text class="action-txt">复制邀请码</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { useAppTheme } from '@/common/themes/useAppTheme.js'
const { themeClass, softColor } = useAppTheme()

import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { roomApi } from '../../common/api'
import { STORAGE_KEYS } from '../../common/config'
import { formatMoneyShort } from '../../pages/js/utils.js'
import AppIcon from '../../components/common/AppIcon.vue'

const rooms = ref([])
const currentRoomId = ref('')
const inviteVisible = ref(false)
const inviteCode = ref('')
const inviteRoomName = ref('')

const readCurrentRoom = () => {
  try {
    const saved = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
    currentRoomId.value = (saved && saved.id) || ''
  } catch (error) {
    currentRoomId.value = ''
  }
}

const loadRooms = async () => {
  try {
    const res = await roomApi.getRoomList()
    if (res.code === 0) {
      rooms.value = res.data || []
      // 没有当前账本时，默认选中第一个，避免「明细」页空白
      if (!currentRoomId.value && rooms.value.length) {
        setCurrentRoom(rooms.value[0])
      }
    }
  } catch (error) {
    console.error('[账本] 加载失败', error)
  }
}

const setCurrentRoom = (room) => {
  currentRoomId.value = room.id
  try {
    uni.setStorageSync(STORAGE_KEYS.CURRENT_ROOM, {
      id: room.id,
      name: room.name,
      avatar: room.avatar || 'mc:notebook-2'
    })
  } catch (error) {
    console.error('[账本] 保存当前账本失败', error)
  }
}

/** 点击卡片：切换账本并跳到明细页 */
const onSwitchBook = (room) => {
  if (room.id === currentRoomId.value) {
    uni.switchTab({ url: '/pages/home/home' })
    return
  }
  setCurrentRoom(room)
  uni.showToast({ title: `已切换到「${room.name}」`, icon: 'none' })
  setTimeout(() => uni.switchTab({ url: '/pages/home/home' }), 300)
}

const onCreateRoom = () => uni.navigateTo({ url: '/pages/create-room/create-room' })
const onJoinRoom = () => uni.navigateTo({ url: '/pages/join-room/join-room' })
const onManage = (room) => {
  setCurrentRoom(room)
  uni.navigateTo({ url: `/pages/room-settings/room-settings?roomId=${room.id}` })
}
const onImport = (room) => {
  setCurrentRoom(room)
  uni.navigateTo({ url: `/pages/ledger-import/ledger-import?roomId=${room.id}` })
}

const onInvite = async (room) => {
  setCurrentRoom(room)
  inviteRoomName.value = room.name
  inviteCode.value = ''
  inviteVisible.value = true

  try {
    const res = await roomApi.generateInviteCode(room.id)
    if (res.code === 0) {
      inviteCode.value = res.data.code || res.data.inviteCode || ''
    }
  } catch (error) {
    inviteVisible.value = false
    uni.showToast({ title: '生成邀请码失败', icon: 'none' })
  }
}

const copyInviteCode = () => {
  if (!inviteCode.value) return
  uni.setClipboardData({
    data: inviteCode.value,
    success: () => uni.showToast({ title: '邀请码已复制', icon: 'success' })
  })
}

// Tab 页每次显示都刷新，保证从明细页返回时数据是最新的
onShow(() => {
  readCurrentRoom()
  loadRooms()
})
</script>

<style scoped>
.books-page {
  min-height: 100vh;
  background: var(--bg-page, #F6F8F8);
  display: flex;
  flex-direction: column;
}

/* ---- 顶部工具行 ---- */
.page-header {
  padding: 12px 20px;
  background: #FFFFFF;
}
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.header-action {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary-soft, #E9F0F2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-action-icon {
  font-size: 20px;
  color: var(--primary-color, #2F5D6B);
  line-height: 1;
}
.header-sub {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-sub, #64748B);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.books-scroll {
  flex: 1;
  height: 0;
}
.cards-stack {
  padding: 12px 16px 0;
}

/* ---- 账本卡片 ---- */
.book-card {
  background: #FFFFFF;
  border-radius: var(--radius-md, 12px);
  padding: 14px 16px;
  margin-bottom: 12px;
  border: 1px solid #EEF1F5;
  transition: border-color 0.2s ease, transform 0.15s ease;
}
.book-card:active {
  transform: scale(0.985);
}
.book-card.is-current {
  border-color: var(--primary-color, #2F5D6B);
}

.card-top {
  display: flex;
  align-items: center;
}
.book-icon {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-md, 12px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.book-meta {
  flex: 1;
  margin-left: 12px;
  min-width: 0;
}
.book-name-row {
  display: flex;
  align-items: center;
}
.book-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current-tag {
  margin-left: 8px;
  padding: 1px 6px;
  border-radius: var(--radius-sm, 8px);
  background: var(--primary-soft, #E9F0F2);
  flex-shrink: 0;
}
.current-tag-txt {
  font-size: 10px;
  color: var(--primary-color, #2F5D6B);
}
.book-members {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
}
.gear-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.gear-icon {
  font-size: 18px;
  color: var(--text-muted, #94A3B8);
}

/* ---- 支 / 收 / 结 ---- */
.stats-row {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #F5F7FA;
}
.stat-col {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
}
.stat-label {
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
}
.stat-value {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-value.expense {
  color: var(--color-expense, #C4554D);
}
.stat-value.income {
  color: var(--color-income, #3E8E6E);
}
.stat-value.balance {
  color: var(--text-ink, #1E293B);
}
.stat-divider {
  width: 1px;
  height: 14px;
  background: #EEF1F5;
}

/* ---- 卡片按钮 ---- */
.card-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.action-btn {
  flex: 1;
  height: 36px;
  line-height: 36px;
  border-radius: var(--radius-lg, 16px);
  font-size: 13px;
  padding: 0;
  margin: 0;
}
.action-btn::after {
  border: none;
}
.action-btn.primary {
  background: var(--primary-color, #2F5D6B);
}
.action-txt {
  color: #FFFFFF;
  font-size: 13px;
}
.action-btn.ghost {
  background: var(--primary-soft, #E9F0F2);
}
.ghost-txt {
  color: var(--primary-color, #2F5D6B);
}

/* ---- 新建 / 加入账本 ---- */
.add-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.add-card {
  flex: 1;
  min-width: 0;
  height: 92px;
  border-radius: var(--radius-md, 12px);
  border: 1px dashed var(--text-faint, #CBD5E1);
  background: var(--bg-card, #FFFFFF);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.add-card:active {
  background: var(--bg-page, #FAFBFC);
}
.add-txt {
  font-size: 13px;
  color: var(--text-muted, #94A3B8);
}

.safe-bottom-spacer {
  height: calc(40px + env(safe-area-inset-bottom));
}

/* ---- 邀请弹窗 ---- */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.modal-box {
  width: 280px;
  background: #FFFFFF;
  border-radius: var(--radius-lg, 16px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}
.modal-book {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
}
.invite-code-box {
  margin: 16px 0 10px;
  padding: 12px 24px;
  border-radius: var(--radius-sm, 8px);
  background: var(--primary-soft, #E9F0F2);
}
.invite-code {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 6px;
  color: var(--primary-color, #2F5D6B);
}
.modal-hint {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
  text-align: center;
  line-height: 1.6;
}
.modal-btn {
  width: 100%;
  margin-top: 16px;
  flex: none;
}

.animate-fade-in {
  animation: fadeIn 0.35s ease-out both;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
