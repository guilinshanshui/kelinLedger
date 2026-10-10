
<template>
  <view :class="themeClass" class="notif-page">
    <IosNav
      title="消息中心"
      @leftClick="goBack"
    />

    <!-- 顶部全背景修饰 -->
    <!-- 分类 Tab 切换 -->
    <view class="tab-strip">
      <view class="tab-strip-main">
        <view 
          v-for="tab in tabs" 
          :key="tab.id"
          class="tab-item"
          :class="{ active: currentTab === tab.id }"
          @click="changeTab(tab.id)"
        >
          <text class="tab-label">{{ tab.label }}</text>
          <view v-if="currentTab === tab.id" class="tab-active-dot"></view>
        </view>
      </view>

      <!-- 「清空」放在分类行右侧：导航右侧被微信原生胶囊盖住，放这儿才看得见、点得到 -->
      <view v-if="canClear" class="clear-all-btn" @click.stop="onClearAll">
        <AppIcon name="delete-2" :size="13" tone="expense" />
        <text class="clear-all-txt">清空</text>
      </view>
    </view>

    <!-- 主体内容区 -->
    <scroll-view scroll-y class="notif-scroll" :show-scrollbar="false">
      <view class="notif-container">
        
        <!-- 1. 加载中：骨架屏 -->
        <block v-if="isLoading">
          <view 
            v-for="i in 3" 
            :key="'sk-' + i" 
            class="notif-card skeleton-mode"
          >
            <view class="msg-header">
              <view class="sk-item sk-pill shimmer"></view>
              <view class="sk-item sk-time shimmer"></view>
            </view>
            <view class="msg-body">
              <view class="sk-item sk-title shimmer"></view>
              <view class="sk-item sk-desc shimmer"></view>
              <view class="sk-item sk-desc shimmer" style="width: 60%"></view>
            </view>
          </view>
        </block>

        <!-- 2. 网络错误视图 -->
        <block v-else-if="isError">
          <view class="error-view animate-fade-in">
            <view class="error-visual">
              <view class="error-pulse"></view>
              <AppIcon name="alert" :size="36" />
            </view>
            <text class="error-h">连接服务失败</text>
            <text class="error-p">无法同步最新的家庭消息，请检查网络设置或稍后再试。</text>
            <button class="retry-btn" @click="fetchData">
              <text class="retry-txt">重新尝试加载</text>
            </button>
          </view>
        </block>

        <!-- 3. 正常列表 -->
        <block v-else>
          <view
            v-for="(msg, index) in filteredMessages"
            :key="msg.id"
            class="notif-swipe-wrap"
          >
            <view
              class="notif-card animate-stagger-in"
              :class="getCardClass(msg)"
              :style="{ animationDelay: (index * 0.08) + 's' }"
              @touchstart="onCardTouchStart($event, msg)"
              @touchmove="onCardTouchMove($event, msg)"
              @touchend="onCardTouchEnd"
              @click="onCardClick(msg)"
            >
              <!-- 提醒类卡片 -->
              <block v-if="isReminderCard(msg)">
                <view class="reminder-head">
                  <view class="reminder-head-left">
                    <AppIcon :value="reminderIconValue(msg)" :size="20" />
                    <text class="reminder-type-title">{{ msg.title }}</text>
                  </view>
                  <text class="reminder-time">{{ msg.triggerTimeLabel || formatSmartTime(msg.createdAt) }}</text>
                </view>

                <view class="reminder-body">
                  <text class="reminder-main">{{ msg.content || msg.message }}</text>
                  <text v-if="msg.subtitle" class="reminder-sub">{{ msg.subtitle }}</text>
                </view>

                <view v-if="isNotificationUnread(msg)" class="action-row reminder-actions" @click.stop>
                  <button
                    v-for="action in msg.actions"
                    :key="action"
                    class="btn-action"
                    :class="getReminderActionClass(action)"
                    @click="handleReminderAction(index, msg, action)"
                  >
                    {{ getReminderActionLabel(action, msg) }}
                  </button>
                </view>

                <view v-else class="handled-status">
                  <text class="status-txt">已读</text>
                </view>
              </block>

              <!-- 其他消息 -->
              <block v-else>
                <view class="msg-header">
                  <view class="type-pill" :class="msg.type">
                    <AppIcon :value="getTypeIcon(msg.type)" :size="14" />
                    <text class="type-label">{{ getTypeLabel(msg.type) }}</text>
                  </view>
                  <text class="msg-time">{{ formatSmartTime(msg.createdAt) }}</text>
                </view>

                <view class="msg-body">
                  <text class="msg-title">{{ msg.title }}</text>
                  <text class="msg-desc">{{ msg.content || msg.message }}</text>
                </view>

                <view v-if="msg.type === 'invitation' && !msg.handled" class="action-row" @click.stop>
                  <button class="btn-action reject" @click="handleAction(index, msg, 'reject')">拒绝</button>
                  <button class="btn-action accept" @click="handleAction(index, msg, 'accept')">接受</button>
                </view>

                <view v-else-if="getLegacyButton(msg)" class="action-row single" @click.stop>
                  <button class="btn-action outline" @click="goToLegacyDetail(msg, index)">{{ getLegacyButtonText(msg) }}</button>
                </view>

                <view v-if="msg.handled" class="handled-status">
                  <text class="status-txt">已处理 · {{ msg.handleResult }}</text>
                </view>
              </block>
            </view>

            <!-- 左滑后浮现的删除操作，盖在卡片右侧 -->
            <view v-if="activeSwipeId === msg.id" class="notif-actions-overlay">
              <view class="notif-swipe-btn delete" @click.stop="onDeleteMessage(msg)">
                <AppIcon name="delete-2" :size="18" color="#FFFFFF" />
                <text class="notif-swipe-txt">删除</text>
              </view>
            </view>
          </view>

          <!-- 空状态 -->
          <view v-if="filteredMessages.length === 0" class="empty-notif animate-fade-in">
            <view class="empty-icon-wrap">
              <AppIcon :value="currentTab === 'reminder' ? 'mc:notification' : 'mc:mail-open'" :size="40" />
            </view>
            <text class="empty-title">{{ currentTab === 'reminder' ? '暂无提醒' : '一切都很安静' }}</text>
            <text class="empty-desc">{{ currentTab === 'reminder' ? '生日和日程提醒会出现在这里' : '暂无待处理的消息，去休息一下吧' }}</text>
          </view>
        </block>

        <view class="safe-bottom"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { useAppTheme } from '@/common/themes/useAppTheme.js'
const { themeClass, primaryColor, softColor, theme } = useAppTheme()

import { ref, computed, onMounted } from 'vue';
import IosNav from '../../components/nav/ios-nav.vue';
import { notificationsApi, roomApi } from '../../common/api';
import {formatSmartTime} from '../js/utils.js'
import AppIcon from '../../components/common/AppIcon.vue';
import { goBackSafe } from '@/common/utils/nav.js'
import {
  applyLocalNotificationRead,
  buildNotificationMarkReadParams,
  getReminderActionLabel,
  isBirthdayReminder,
  isNotificationUnread,
  isReminderCard,
  isScheduleNotification,
  normalizeNotificationItem
} from '@/common/utils/reminderDisplay.js'

const currentTab = ref('all');
const isLoading = ref(true);
const isError = ref(false);

const tabs = [
  { id: 'all', label: '全部' },
  { id: 'reminder', label: '提醒' },
  { id: 'invitation', label: '邀请' },
  { id: 'system', label: '系统' }
];

const getLegacyButton = (item) => {
  if (isNotificationUnread(item) === false && item.read == 1) return false;
  return item.channel === 'version' || item.channel === 'transaction_details';
};

const getLegacyButtonText = (item) => {
  if (item.channel === 'version') return '查看更多版本信息';
  if (item.channel === 'transaction_details') return '查看账目明细';
  return '';
};

const getCardClass = (msg) => {
  if (!isReminderCard(msg)) return {};
  const tone = isBirthdayReminder(msg) ? 'birthday' : 'schedule';
  return {
    'reminder-card': true,
    [`reminder-card-${tone}`]: true,
    'is-unread': isNotificationUnread(msg)
  };
};

const getReminderActionClass = (action) => {
  if (action === 'view') return 'accept';
  return 'outline';
};

const getList = async () => {
  const res = await notificationsApi.getNotificationList();
  if (res.code == 0) {
    // 后端列表接口返回 { list, total, page, pageSize }，这里兼容旧字段 rows
    messages.value = (res.data?.list || res.data?.rows || []).map(normalizeNotificationItem);
  }
};

const messages = ref([])

const filteredMessages = computed(() => {
  if (currentTab.value === 'all') return messages.value;
  if (currentTab.value === 'reminder') {
    return messages.value.filter((m) => isScheduleNotification(m));
  }
  if (currentTab.value === 'invitation') {
    return messages.value.filter((m) => m.type === 'room_invite');
  }
  if (currentTab.value === 'system') {
    // 除邀请与日程提醒之外的通知都归入系统，保证每条消息都能在某个页签里看到
    return messages.value.filter((m) => m.type !== 'room_invite' && !isScheduleNotification(m));
  }
  return [];
});

/* ---------------- 左滑删除 / 清空全部 ---------------- */

/** 顶部「清空」只在还有消息时出现 */
const canClear = computed(() => messages.value.length > 0);

const activeSwipeId = ref(null);
let cardStartX = 0;
let cardDidSwipe = false;

const onCardTouchStart = (e, msg) => {
  cardStartX = e.touches[0].clientX;
  cardDidSwipe = false;
};

const onCardTouchMove = (e, msg) => {
  if (!e.touches || !e.touches.length) return;
  const diff = cardStartX - e.touches[0].clientX;
  if (diff > 30) {
    // 抬手后还会跟一个 click，标记成滑动避免误触收起
    cardDidSwipe = true;
    activeSwipeId.value = msg.id;
  } else if (diff < -30 && activeSwipeId.value === msg.id) {
    activeSwipeId.value = null;
  }
};

const onCardTouchEnd = () => {};

/** 卡片没有详情页，点击只负责把滑开的操作层收回去 */
const onCardClick = (msg) => {
  if (cardDidSwipe) {
    cardDidSwipe = false;
    return;
  }
  if (activeSwipeId.value === msg.id) {
    activeSwipeId.value = null;
  }
};

/** 删除单条消息（软删除，服务端保留记录） */
const onDeleteMessage = async (msg) => {
  activeSwipeId.value = null;
  if (!msg.id) {
    uni.showToast({ title: '缺少消息标识', icon: 'none' });
    return;
  }
  try {
    const res = await notificationsApi.deleteNotification(msg.id);
    if (res.code !== 0) {
      uni.showToast({ title: res.message || res.msg || '删除失败', icon: 'none' });
      return;
    }
    messages.value = messages.value.filter((item) => item.id !== msg.id);
    uni.$emit('refresh_notification_count');
    uni.showToast({ title: '已删除', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: '删除失败', icon: 'none' });
  }
};

/** 清空全部消息，二次确认后执行 */
const onClearAll = () => {
  if (!canClear.value) return;
  uni.showModal({
    title: '清空消息',
    content: '将删除全部消息，且无法恢复。确定清空吗？',
    confirmText: '清空',
    confirmColor: '#F43F5E',
    success: async (modalRes) => {
      if (!modalRes.confirm) return;
      uni.showLoading({ title: '正在清空...' });
      try {
        const res = await notificationsApi.clearAllNotifications();
        uni.hideLoading();
        if (res.code !== 0) {
          uni.showToast({ title: res.message || res.msg || '清空失败', icon: 'none' });
          return;
        }
        messages.value = [];
        uni.$emit('refresh_notification_count');
        uni.showToast({ title: '已清空', icon: 'none' });
      } catch (e) {
        uni.hideLoading();
        uni.showToast({ title: '清空失败', icon: 'none' });
      }
    }
  });
};

onMounted(() => {
  fetchData();
});

const fetchData = async () => {
  isLoading.value = true;
  isError.value = false;
  try {
    // 兜底：先把到点的生日/日程提醒落成站内通知，再拉列表（失败不阻断列表）
    await notificationsApi.runScheduleDue().catch(() => {});
    await getList();
  } catch (e) {
    isError.value = true;
  } finally {
    isLoading.value = false;
  }
};

const changeTab = (id) => {
  if (currentTab.value === id) return;
  currentTab.value = id;
  // uni.vibrateShort({ type: 'light' });
};

const goBack = () => goBackSafe();

const getTypeIcon = (type) => {
  const map = {
    invitation: 'mc:mail',
    budget_alert: 'mc:alert-octagon',
    system: 'mc:settings-3',
    schedule: 'mc:notification',
    schedule_reminder: 'mc:notification',
    birthday_reminder: 'mc:cake',
    reminder: 'mc:notification'
  };
  return map[type] || 'mc:notification';
};

/** 提醒卡片图标：后端已经给 mc: 前缀就直接用，否则按类型兜底。 */
const reminderIconValue = (msg) => {
  if (typeof msg.icon === 'string' && msg.icon.indexOf('mc:') === 0) return msg.icon
  return isBirthdayReminder(msg) ? 'mc:cake' : 'mc:notification'
}

const getTypeLabel = (type) => {
  const map = {
    invitation: '空间邀请',
    budget_alert: '支出预警',
    system: '系统通知',
    schedule: '提醒',
    schedule_reminder: '日程提醒',
    birthday_reminder: '生日提醒',
    reminder: '提醒'
  };
  return map[type] || '通知';
};

const openReminderTarget = (msg) => {
  if (!msg.roomId) {
    uni.showToast({ title: '缺少空间信息', icon: 'none' });
    return;
  }
  const date = msg.targetDate || '';
  const roomName = msg.roomName ? encodeURIComponent(msg.roomName) : '';
  let url = `/pages/dashboard/dashboard?roomId=${msg.roomId}&tab=schedule`;
  if (roomName) url += `&name=${roomName}`;
  if (date) url += `&date=${date}`;
  uni.navigateTo({ url });
};

const markingReadIds = new Set();

const patchNotificationReadState = (msg) => {
  const idx = messages.value.findIndex(item => item.id === msg.id);
  if (idx === -1) return;
  messages.value[idx] = applyLocalNotificationRead(messages.value[idx]);
};

const markNotificationRead = async (msg) => {
  if (!isNotificationUnread(msg)) return true;

  const params = buildNotificationMarkReadParams(msg);
  if (params.id == null && params.targetId == null) {
    uni.showToast({ title: '缺少通知标识', icon: 'none' });
    return false;
  }
  if (!params.targetType) {
    uni.showToast({ title: '缺少通知类型', icon: 'none' });
    return false;
  }

  const markKey = String(params.id != null ? params.id : `${params.targetType}:${params.targetId}`);
  if (markingReadIds.has(markKey)) return false;
  markingReadIds.add(markKey);

  try {
    const res = await notificationsApi.markNotificationRead(params);
    if (res.code == 0) {
      patchNotificationReadState(msg);
      uni.$emit('refresh_notification_count');
      return true;
    }
    uni.showToast({ title: res.msg || '标记已读失败', icon: 'none' });
    return false;
  } catch (e) {
    uni.showToast({ title: '标记已读失败', icon: 'none' });
    return false;
  } finally {
    markingReadIds.delete(markKey);
  }
};

const handleReminderAction = async (index, msg, action) => {
  if (action === 'view') {
    if (!msg.roomId) {
      uni.showToast({ title: '缺少空间信息', icon: 'none' });
      return;
    }
    openReminderTarget(msg);
    await markNotificationRead(msg);
    return;
  }
  if (action === 'mark_read') {
    const ok = await markNotificationRead(msg);
    if (ok) {
      uni.showToast({ title: '已标为已读', icon: 'none' });
    }
    return;
  }
  if (action === 'snooze') {
    uni.showToast({ title: '稍后提醒你', icon: 'none' });
  }
};

const goToLegacyDetail = async (msg, index) => {
  uni.showToast({ title: '正在跳转详情...', icon: 'none' });
  if (msg.channel === 'version') {
    uni.navigateTo({ url: '/pages/version-history/version-history' });
  } else if (msg.channel === 'transaction_details') {
    uni.navigateTo({
      url: `/pages/ledger-all/ledger-all?roomId=${msg.roomId}&accountId=${msg.accountId}`
    });
  }
  await markNotificationRead(msg);
};

const handleAction = async (index, msg, action) => {
  try {
    uni.showLoading({ title: action === 'accept' ? '正在加入...' : '正在处理...' });
    const res = await (action === 'accept'
      ? roomApi.accecptSigin(msg.id, {})
      : roomApi.rejectSigin(msg.id, {}));
    if (res.code === 0) {
      if (action === 'accept') {
        uni.$emit('refresh_room_data');
      }
      const localInviteCode = uni.getStorageSync('inviteCode');
      if (localInviteCode) {
        const stillExists = messages.value.some(
          item => item.inviteCode === localInviteCode
        );
        if (stillExists) {
          uni.removeStorageSync('inviteCode');
        }
      }

      if (index !== -1) {
        messages.value[index] = {
          ...messages.value[index],
          handled: true,
          handleResult: action === 'accept' ? '已接受' : '已拒绝'
        };
      }
      uni.showToast({ title: '操作成功' });
    }
  } catch (e) {
    uni.hideLoading();
  }
};
</script>

<style scoped>
.notif-page {
  height: 100vh;
  background-color: var(--primary-soft, #E9F0F2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  transition: background-color 0.35s ease;
}


.tab-strip { display: flex; align-items: center; padding: 10px 20px; gap: 12px; background: rgba(255, 255, 255, 0.8); z-index: 10; border-bottom: 1rpx solid rgba(0, 0, 0, 0.02); }
.tab-strip-main { display: flex; align-items: center; gap: 22px; flex: 1; min-width: 0; }
/* 「清空」放在分类行右侧，避开微信原生胶囊；点击后会弹二次确认 */
.clear-all-btn {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--color-expense-soft, #FFF1F2);
  transition: background-color 0.2s, opacity 0.2s, transform 0.2s;
}
.clear-all-btn:active { transform: scale(0.94); opacity: 0.85; }
.clear-all-txt { font-size: 12px; font-weight: 600; color: var(--color-expense, #F43F5E); line-height: 1; }
.tab-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0; }
.tab-label { font-size: 15px; font-weight: 600; color: var(--text-muted, #94A3B8); transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s; }
.active .tab-label { color: var(--primary-color, #2F5D6B); transform: scale(1.05); font-weight: 600; }
.tab-active-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--primary-color, #2F5D6B); box-shadow: 0 0 10px var(--primary-glow, rgba(47, 93, 107, 0.5)); }

.notif-scroll { flex: 1; height: 0; }
.notif-container { padding: 20px 20px 60px; }

/* ---- 左滑删除 ---- */
/* 卡片是圆角带间距的独立块，所以包裹层负责间距与裁切，操作层才能贴着圆角。 */
.notif-swipe-wrap {
  position: relative;
  width: 100%;
  margin-bottom: 16px;
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;
}
.notif-swipe-wrap .notif-card { margin-bottom: 0; }
/** 操作层盖在卡片右侧，左滑时卡片内容仍在原位，一眼能看出删的是哪条 */
.notif-actions-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
  z-index: 3;
  animation: notifActionsIn 0.22s cubic-bezier(0.32, 0.72, 0, 1);
}
@keyframes notifActionsIn {
  from { transform: translateX(100%); opacity: 0.4; }
  to { transform: translateX(0); opacity: 1; }
}
.notif-swipe-btn {
  width: 76px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.notif-swipe-btn.delete { background: var(--color-expense, #F43F5E); }
.notif-swipe-txt { font-size: 11px; font-weight: 600; color: #fff; }

.notif-card { 
  background: #fff; border-radius: var(--radius-lg, 16px); padding: 24px; margin-bottom: 16px; 
  border: 1px solid #F1F5F9; box-shadow: 0 10px 30px rgba(0,0,0,0.02);
  transition: transform 0.2s;
}
.notif-card.is-unread {
  border-color: var(--primary-soft, #E9F0F2);
  box-shadow: 0 10px 30px rgba(65, 111, 123, 0.08);
}
.notif-card.reminder-card {
  padding: 22px 22px 20px;
}
.notif-card.reminder-card-schedule.is-unread {
  border-color: var(--primary-soft, #C7D2FE);
  box-shadow: 0 12px 32px rgba(47, 93, 107, 0.08);
}
.notif-card.reminder-card-birthday.is-unread {
  border-color: #F5D0FE;
  box-shadow: 0 12px 32px rgba(192, 38, 211, 0.08);
}
.notif-card:active:not(.skeleton-mode) { transform: scale(0.99); }

.reminder-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.reminder-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.reminder-type-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}
.reminder-time {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #94A3B8);
}
.reminder-body {
  margin-bottom: 18px;
}
.reminder-main {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  line-height: 1.45;
  letter-spacing: 0;
  margin-bottom: 8px;
}
.reminder-card-birthday .reminder-main {
  color: #86198F;
}
.reminder-card-schedule .reminder-main {
  color: var(--text-ink, #312E81);
}
.reminder-sub {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub, #64748B);
  line-height: 1.5;
}
.reminder-actions {
  padding-top: 2px;
}

/* --- 骨架屏样式 --- */
.skeleton-mode { pointer-events: none; }
.sk-item { background: #F1F5F9; border-radius: var(--radius-sm, 8px); }
.shimmer { 
  position: relative; overflow: hidden; 
}
.shimmer::after {
  content: ""; position: absolute; inset: 0;
  background-image: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
  animation: shimmerAnim 1.8s infinite;
}
@keyframes shimmerAnim { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

.sk-pill { width: 80px; height: 24px; border-radius: var(--radius-sm, 8px); }
.sk-time { width: 60px; height: 14px; }
.sk-title { width: 70%; height: 20px; margin-bottom: 12px; }
.sk-desc { width: 100%; height: 14px; margin-bottom: 8px; }

/* --- 网络错误视图 --- */
.error-view { 
  display: flex; flex-direction: column; align-items: center; justify-content: center; 
  padding: 100rpx 40rpx; text-align: center;
}
.error-visual { position: relative; width: 160rpx; height: 160rpx; display: flex; align-items: center; justify-content: center; margin-bottom: 48rpx; }
.error-pulse { position: absolute; inset: 0; background: var(--primary-soft, #E9F0F2); border-radius: 50%; animation: errorPulse 2s infinite; }
@keyframes errorPulse { 0% { transform: scale(0.8); opacity: 0.8; } 100% { transform: scale(1.4); opacity: 0; } }

.error-h { font-size: 34rpx; font-weight: 600; color: var(--text-ink, #1E293B); margin-bottom: 16rpx; }
.error-p { font-size: 26rpx; font-weight: 600; color: var(--text-muted, #94A3B8); line-height: 1.6; margin-bottom: 60rpx; }
.retry-btn { 
  background: var(--primary-color, #2F5D6B);
  height: 100rpx; padding: 0 60rpx; border-radius: 30rpx; 
  display: flex; align-items: center; justify-content: center; border: none;
  box-shadow: 0 12rpx 30rpx var(--primary-glow, rgba(47, 93, 107, 0.25));
  transition: background 0.35s ease, box-shadow 0.35s ease;
}
.retry-btn:active { transform: scale(0.96); opacity: 0.9; }
.retry-txt { color: #fff; font-size: 28rpx; font-weight: 600; }

.msg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.type-pill { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: var(--radius-sm, 8px); }
.type-pill.invitation { background: var(--primary-soft, #E9F0F2); color: var(--primary-color, #2F5D6B); }
.type-pill.budget_alert { background: var(--color-expense-soft, #FFF1F2); color: var(--color-expense, #F43F5E); }
.type-pill.reminder,
.type-pill.schedule,
.type-pill.schedule_reminder { background: var(--primary-soft, #E9F0F2); color: var(--secondary-color, #416F7B); }
.type-pill.birthday_reminder { background: #FDF4FF; color: #C026D3; }
.type-pill.reminder .type-label,
.type-pill.schedule .type-label,
.type-pill.schedule_reminder .type-label,
.type-pill.birthday_reminder .type-label { color: inherit; }
.type-pill.version { background: var(--primary-soft, #E9F0F2); color: var(--primary-color, #64748B); }
.type-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.msg-time { font-size: 11px; font-weight: 600; color: var(--text-faint, #CBD5E1); }

.msg-body { margin-bottom: 24px; }
.msg-title { font-size: 17px; font-weight: 600; color: var(--text-ink, #1E293B); display: block; margin-bottom: 6px; letter-spacing: 0; }
.msg-desc { font-size: 13px; font-weight: 600; color: var(--text-sub, #64748B); line-height: 1.6; }

.action-row { display: flex; gap: 12px; }
.action-row.single .btn-action { flex: 1; }


/* 关键在这 */
.btn-action::after {
  border: none;
}

.btn-action { 
  flex: 1; height: 48px; border-radius: var(--radius-lg, 16px); display: flex; align-items: center; justify-content: center; 
  font-size: 14px; font-weight: 600; border: none; transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s;
}
.btn-action:active { transform: scale(0.95); }
.btn-action.accept { background: var(--primary-color, #2F5D6B); color: #fff; box-shadow: 0 10px 20px var(--primary-glow, rgba(47, 93, 107, 0.2)); }
.btn-action.reject { background: var(--primary-soft, #E9F0F2); color: var(--text-muted, #94A3B8); }
.btn-action.outline { background: #fff; color: var(--primary-color, #2F5D6B); border: 1.5px solid var(--primary-soft, #E9F0F2); }

.handled-status { display: flex; align-items: center; gap: 6px; padding: 12px 0 0; border-top: 1px dashed #F1F5F9; }
.status-txt { font-size: 11px; font-weight: 600; color: var(--text-faint, #CBD5E1); text-transform: uppercase; }

.empty-notif { padding: 100px 40px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.empty-icon-wrap { font-size: 60px; filter: grayscale(1); opacity: 0.3; }
.empty-title { font-size: 20px; font-weight: 600; color: var(--text-ink, #1E293B); }
.empty-desc { font-size: 14px; font-weight: 600; color: var(--text-muted, #94A3B8); text-align: center; }

.safe-bottom { height: env(safe-area-inset-bottom); padding-bottom: 20px; }

.animate-stagger-in { animation: staggerIn 0.6s cubic-bezier(0.32, 0.72, 0, 1) both; }
@keyframes staggerIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

.animate-fade-in { animation: fadeIn 0.5s ease-out both; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.animate-pulse { animation: pulseBadge 1.6s ease-in-out 2; }
@keyframes pulseBadge { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.18); opacity: 0.65; } 100% { transform: scale(1); opacity: 1; } }
</style>
