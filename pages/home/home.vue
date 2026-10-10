
<template>
  <view :class="themeClass" class="home-tab-container">
    <view class="home-content">
      <!-- 顶部主题色区：问候 + 账本栏 + 收支统计 + 快捷入口 -->
      <view class="home-top-band">
      <!-- 首页头部 -->
      <view class="home-header">
        <view class="header-left">
          <view class="welcome-box">
            <text class="welcome-text">{{ isLoggedIn ? '你好，' + (user.userNickname || '微信用户') : '开启数字家庭生活' }}</text>
          </view>
        </view>
        
        <!-- 头部右侧：只保留通知铃铛 -->
        <view class="header-right">
          <view class="msg-entry" @click="goToNotifications">
            <view class="msg-btn-bg">
              <AppIcon name="notification" :size="22" />
            </view>
            <view v-if="messageCount>0" class="msg-badge-dot animate-pulse"></view>
          </view>
        </view>
      </view>

      <!-- 已登录：顶部平铺账本栏 + 三项统计 + 快捷入口 -->
      <view v-if="isLoggedIn" class="home-toolbar">
        <view class="toolbar-book" @click="goBooks">
          <text class="toolbar-book-name">{{ currentRoom.name || '默认账本' }}</text>
          <AppIcon name="transfer-horizontal" :size="16" />
        </view>
        <!-- 点月份弹出月份选择器，就地切换并重拉这个月的流水 -->
        <picker
          mode="date"
          fields="month"
          :value="monthPickerValue"
          @change="onMonthPick"
        >
          <view class="toolbar-month">
            <text class="toolbar-month-txt">{{ monthLabel }}</text>
            <view class="toolbar-month-caret">
              <!-- 不传 color，跟「统计分析 / 账单日历 / 资产账户」一样走主题色，保持头部图标一致 -->
              <AppIcon name="calendar-2" :size="16" />
            </view>
          </view>
        </picker>
      </view>

      <view class="overview-stats">
        <view class="ov-col">
          <text class="ov-label">支出</text>
          <text class="ov-value">{{ formatMoneyShort(monthSummary.expense) }}</text>
        </view>
        <view class="ov-divider"></view>
        <view class="ov-col">
          <text class="ov-label">收入</text>
          <text class="ov-value">{{ formatMoneyShort(monthSummary.income) }}</text>
        </view>
        <view class="ov-divider"></view>
        <view class="ov-col">
          <text class="ov-label">结余</text>
          <text class="ov-value">{{ formatMoneyShort(monthSummary.balance) }}</text>
        </view>
      </view>

      <!-- 快捷入口：三项等宽平铺，触控面积 46px -->
      <view class="quick-row">
        <view class="quick-item" @click="goStats">
          <AppIcon name="chart-pie" :size="24" />
          <text class="quick-txt">统计分析</text>
        </view>
        <view class="quick-item" @click="goCalendar">
          <AppIcon name="calendar-2" :size="24" />
          <text class="quick-txt">账单日历</text>
        </view>
        <view class="quick-item" @click="goAsset">
          <AppIcon name="bank-card" :size="24" />
          <text class="quick-txt">资产账户</text>
        </view>
      </view>
      </view>

      <!-- 搜索账单：通栏输入框样式，点击进入搜索页 -->
      <view class="search-entry" @click="goLedgerAll">
        <AppIcon name="search-2" :size="18" />
        <text class="search-entry-txt">搜索账单</text>
      </view>
      <!-- 记一笔：常驻主按钮 -->
      <view v-if="isLoggedIn" class="fab-entry" @click="goAddEntry">
        <text class="fab-plus">+</text>
        <text class="fab-txt">记一笔</text>
      </view>
      <view v-if="!isLoggedIn" class="guest-state">
        <view class="guest-card" @click="goToLogin">
          <view class="card-inner-content">
            <!-- 悬浮图标区 -->
            <view class="floating-hero">
              <view class="hero-icon-3d">
                <AppIcon name="home-1" :size="40" />
              </view>
            </view>
            
            <view class="text-info-center">
              <text class="hero-title-gradient">连接每一位家人</text>
              <text class="hero-subtitle">共享账本 · 协作清单 · 家庭日程</text>
            </view>

            <view class="action-footer">
              <view class="glass-login-btn">
                <text class="btn-text">立即启程</text>
                <view class="btn-arrow"><AppIcon name="arrow-right" :size="18" /></view>
              </view>
              <view class="trust-badge">
                <AppIcon name="safe-shield" :size="14" />
                <text class="trust-text">银行级数据加密保护</text>
              </view>
            </view>
          </view>
        </view>
        
        <!-- 模糊预览区 -->
        <view class="preview-section">
          <text class="section-hint">核心功能预览</text>
          <view class="locked-preview-stack">
            <view class="locked-card blur-item">
              <view class="l-card-head">
                <view class="l-icon"><AppIcon name="receive-money" :size="20" /></view>
                <view class="l-title-placeholder"></view>
              </view>
              <view class="lock-overlay">
                <AppIcon name="lock" :size="20" />
                <text class="lock-tip">登录后查看空间数据</text>
              </view>
            </view>
          </view>
        </view>
      </view>


      <!-- 搜索账单下方：最近账单流（月视图，最新在前） -->
      <view v-if="isLoggedIn" class="recent-stream">
        <view v-if="recentGroups.length === 0 && !recentLoading" class="recent-empty">
          <text class="recent-empty-txt">这个月还没有记账</text>
          <text class="recent-empty-sub">点击右下角「记一笔」开始</text>
        </view>
        <template v-else>
          <view v-for="group in recentGroups" :key="group.key" class="recent-group">
            <view class="recent-group-head">
              <text class="recent-group-date">{{ group.dateLabel }} {{ group.weekday }}</text>
              <text class="recent-group-sum">支 {{ formatMoneyShort(group.expense) }} / 收 {{ formatMoneyShort(group.income) }}</text>
            </view>
            <view v-for="item in group.entries" :key="item.id" class="recent-swipe-wrap">
              <view
                class="recent-row"
                @touchstart="onRowTouchStart($event, item)"
                @touchmove="onRowTouchMove($event, item)"
                @touchend="onRowTouchEnd"
                @click="onRowClick(item)"
              >
              <view class="recent-row-icon">
                <AppIcon :value="item.categoryIcon" :size="22" />
              </view>
              <view class="recent-row-main">
                <text class="recent-row-name">{{ item.categoryName || '未分类' }}<text v-if="item.creatorNickname" class="recent-row-user">（{{ item.creatorNickname }}）</text></text>
                <text v-if="item.note" class="recent-row-note">{{ item.note }}</text>
              </view>
              <text class="recent-row-amount" :class="item.type">
                {{ item.type === 'income' ? '+' : '-' }}{{ formatMoneyShort(item.amount) }}
              </text>
              </view>

              <!--
                操作层盖在行右侧而不是把整行移走：
                这样左滑时图标和分类还在原位，一眼能看出是哪一笔。
                只在滑开时才渲染，避免合上时露出底色。
              -->
              <view v-if="canOperateEntry(item) && activeSwipeId === item.id" class="recent-actions-overlay">
                <view class="recent-swipe-btn edit" @click.stop="goEditEntry(item)">
                  <AppIcon name="edit-2" :size="18" color="#FFFFFF" />
                  <text class="recent-swipe-txt">修改</text>
                </view>
                <view class="recent-swipe-btn delete" @click.stop="onDeleteEntry(item)">
                  <AppIcon name="delete-2" :size="18" color="#FFFFFF" />
                  <text class="recent-swipe-txt">删除</text>
                </view>
              </view>
            </view>
          </view>
        </template>
      </view>
    </view>
    <view class="safe-spacer"></view>
  </view>
</template>

<script setup>
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import AppIcon from '../../components/common/AppIcon.vue'
const { themeClass, expenseColor } = useAppTheme()

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { notificationsApi, roomApi, taskApi } from '../../common/api';
import { getStoredUser, normalizeUser } from '@/common/utils/session';
import { SCHEDULE_REFRESH_KEY } from '../../common/utils/scheduleHomePreview.js';
import { useUserStore } from '@/store/user';
import { goToLogin, formatMoneyShort } from '../js/utils.js';
import { STORAGE_KEYS } from '../../common/config';

const userStore = useUserStore();

const CHECKLIST_REFRESH_KEY = 'checklist_board_dirty_room';
function readStoredUser() {
  try {
    const u = userStore.currentUser || getStoredUser();
    return u && typeof u === 'object' ? u : null;
  } catch {
    return null;
  }
}

const storedUser = readStoredUser();
const isLoggedIn = ref(!!storedUser);
const user = ref(normalizeUser(storedUser));
const rooms = ref([]);
const loading = ref(isLoggedIn.value);
const roomsReady = ref(false);
const isError = ref(false);

// 铃铛未读红点：必须在顶层声明，否则每次刷新都会新建 ref，模板永远拿不到
const messageCount = ref(0);

// ---- 明细概览：当前账本 + 月度收支 ----
const currentRoom = ref({ id: '', name: '默认账本' });
const monthSummary = ref({ expense: 0, income: 0, balance: 0 });
/** 首页月份显示带年份，避免跨年后「10月」分不清是哪一年。 */
/** 首页当前查看的月份（默认本月），支持就地左右切换 */
const selectedYear = ref(new Date().getFullYear());
const selectedMonth = ref(new Date().getMonth() + 1);

/** 月份显示带年份，避免跨年后「10月」分不清是哪一年。 */
const monthLabel = computed(() => `${selectedYear.value}年${selectedMonth.value}月`);

/** 月份选择器的当前值（原生 picker 要 YYYY-MM 格式） */
const monthPickerValue = computed(() =>
  `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`
);

/**
 * 月份选择器回调：就地换月份并重拉流水。
 * 不再跳账单日历——想看日历有专门的快捷入口。
 */
const onMonthPick = (e) => {
  const value = e && e.detail && e.detail.value ? String(e.detail.value) : '';
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return;
  selectedYear.value = year;
  selectedMonth.value = month;
  activeSwipeId.value = null;
  loadRecentEntries();
};

/** 读取当前选中的账本（由「账本」Tab 写入本地缓存） */
const readCurrentRoom = () => {
  try {
    const saved = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM);
    if (saved && saved.id) {
      currentRoom.value = saved;
      return;
    }
  } catch (error) {
    // 读取失败则回退到默认账本
  }
  currentRoom.value = { id: '', name: '默认账本' };
};

/** 拉取当前账本的本月收支 */
const loadMonthSummary = async () => {
  readCurrentRoom();
  if (!currentRoom.value.id) {
    monthSummary.value = { expense: 0, income: 0, balance: 0 };
    return;
  }
  try {
    const res = await roomApi.getDashBoardList({ roomId: currentRoom.value.id, type: 'month' });
    if (res.code === 0 && res.data) {
      monthSummary.value = {
        expense: res.data.totalExpense || 0,
        income: res.data.totalIncome || 0,
        balance: res.data.balance || 0
      };
      // 本地缓存里的账本名可能是旧的（在别的设备改过名、或缓存被写脏），
      // 服务端返回的才是权威名字，顺手校正一次，避免顶部一直显示错的名字
      const remoteName = res.data.roomName
      if (remoteName && remoteName !== currentRoom.value.name) {
        currentRoom.value = { ...currentRoom.value, name: remoteName }
        try {
          uni.setStorageSync(STORAGE_KEYS.CURRENT_ROOM, currentRoom.value)
        } catch (error) {
          // 写缓存失败不影响本次展示
        }
      }
    }
  } catch (error) {
    console.error('[明细] 月度概览加载失败', error);
  }
};
const recentGroups = ref([]);

/**
 * 首页最近流水点一下 = 修改这笔账单。
 * 带上原类型，编辑页才能直接落在支出 / 收入 / 转账对应的页签上；
 * 金额、分类、日期等由编辑页拉详情回填，时间会保留原来的时刻。
 */
const recentLoading = ref(false);

// ---- 最近流水左滑操作（与收支流水页同一套交互） ----
const activeSwipeId = ref(null);
/** 当前用户在账本里的 id 与角色，用于判断能否改删；服务端还会再校一次 */
const currentUserId = ref('');
const currentUserRole = ref('viewer');
let rowStartX = 0;
let rowDidSwipe = false;

const canOperateEntry = (item) =>
  !!item && (
    String(item.userId || '') === String(currentUserId.value) ||
    ['owner', 'admin'].includes(currentUserRole.value)
  );

const onRowTouchStart = (e, item) => {
  rowStartX = e.touches[0].clientX;
  rowDidSwipe = false;
};

const onRowTouchMove = (e, item) => {
  if (!canOperateEntry(item)) return;
  const diff = rowStartX - e.touches[0].clientX;
  if (diff > 30) {
    // 抬手后还会跟一个 click，标记成滑动避免误跳详情
    rowDidSwipe = true;
    activeSwipeId.value = item.id;
  } else if (diff < -30 && activeSwipeId.value === item.id) {
    activeSwipeId.value = null;
  }
};

const onRowTouchEnd = () => {};

const onRowClick = (item) => {
  if (rowDidSwipe) {
    rowDidSwipe = false;
    return;
  }
  if (activeSwipeId.value === item.id) {
    activeSwipeId.value = null;
    return;
  }
  goBrowseEntry(item);
};

/** 删除：二次确认后软删除，服务端会同时回滚账户余额 */
const onDeleteEntry = (item) => {
  activeSwipeId.value = null;
  uni.showModal({
    title: '删除账单',
    content: '确定要删除这笔收支吗？删除后不可恢复，金额将不再计入总额。',
    confirmText: '确定删除',
    confirmColor: expenseColor.value,
    success: async (res) => {
      if (!res.confirm) return;
      uni.showLoading({ title: '正在删除' });
      try {
        const resp = await taskApi.deleteLedger(item.id, currentRoom.value.id);
        uni.hideLoading();
        if (resp.code !== 0) {
          uni.showToast({ title: resp.message || '删除失败', icon: 'none' });
          return;
        }
        uni.showToast({ title: '已删除', icon: 'success' });
        uni.$emit('refresh_ledger_data');
        loadRecentEntries();
      } catch (error) {
        uni.hideLoading();
        uni.showToast({ title: '删除失败，请稍后重试', icon: 'none' });
      }
    }
  });
};

/** 左滑菜单里的「修改」：进真正的编辑页 */
const goEditEntry = (item) => {
  activeSwipeId.value = null;
  if (!item || !item.id) return;
  const rid = currentRoom.value?.id || '';
  uni.navigateTo({
    url: `/pages/add-entry/add-entry?roomId=${rid}&accountId=${item.accountId || ''}&id=${item.id}&isEdit=true&type=${item.type || 'expense'}`
  });
};

/** 点击账单：进只读的账单详情页。编辑入口只在左滑菜单里，避免误触改错账。 */
const goBrowseEntry = (item) => {
  if (!item || !item.id) {
    goAddEntry();
    return;
  }
  const rid = currentRoom.value?.id || '';
  uni.navigateTo({
    url: `/pages/add-entry/add-entry?roomId=${rid}&accountId=${item.accountId || ''}&id=${item.id}&readonly=1&type=${item.type || 'expense'}`
  });
};

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const loadRecentEntries = async () => {
  readCurrentRoom();
  if (!currentRoom.value.id) {
    recentGroups.value = [];
    return;
  }
  recentLoading.value = true;
  try {
    // 用 taskApi 这条路径：收支流水页用同一入口是实测能拿到数据的
    const res = await taskApi.getLedgerWeekList(
      { roomId: currentRoom.value.id, year: selectedYear.value, month: selectedMonth.value },
      'month'
    );
    if (res.code === 0 && res.data && res.data.groups) {
      // 记住当前用户在账本里的身份，用来决定左滑菜单里是否出「修改 / 删除」
      currentUserId.value = res.data.currentUserId || '';
      currentUserRole.value = res.data.currentUserRole || 'viewer';
      recentGroups.value = res.data.groups.map((group) => {
        const d = new Date(group.date);
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return {
          key: group.date,
          dateKey: group.date,
          dateLabel: `${m}月${day}日`,
          weekday: WEEKDAY_LABELS[d.getDay()] || '',
          income: group.income || 0,
          expense: group.expense || 0,
          entries: (group.list || []).map((item) => ({
            id: item.id,
            type: item.type,
            amount: item.amount,
            categoryName: item.categoryName,
            categoryIcon: item.categoryIcon,
            note: item.note,
            creatorNickname: item.creatorNickname || ''
          }))
        };
      });
    } else {
      recentGroups.value = [];
    }
  } catch (error) {
    console.error('[明细] 最近账单加载失败', (error && error.message) || String(error), error);
    recentGroups.value = [];
  } finally {
    recentLoading.value = false;
  }
};
const goBooks = () => uni.switchTab({ url: '/pages/room-list/room-list' });
const goAddEntry = () =>
  uni.navigateTo({
    url: `/pages/add-entry/add-entry?roomId=${currentRoom.value.id || ''}`
  });
const goLedgerAll = () =>
  uni.navigateTo({
    url: `/pages/ledger-all/ledger-all?roomId=${currentRoom.value.id || ''}&roomName=${encodeURIComponent(currentRoom.value.name || '')}`
  });
const goStats = () =>
  uni.navigateTo({
    url: `/pages/wealth-stats/wealth-stats?roomId=${currentRoom.value.id || ''}`
  });
const goCalendar = () =>
  uni.navigateTo({
    url: `/pages/report/bill-calendar?roomId=${currentRoom.value.id || ''}&roomName=${encodeURIComponent(currentRoom.value.name || '')}`
  });
const goAsset = () =>
  uni.navigateTo({
    url: `/pages/asset-details/asset-details?roomId=${currentRoom.value.id || ''}`
  });

const applyLogoutState = () => {
  isLoggedIn.value = false;
  user.value = { nickname: '', avatar: '', userNickname: '', userHeadUrl: '', roomsCount: 0 };
  rooms.value = [];
  roomsReady.value = false;
  loading.value = false;
  isError.value = false;
};

/**
 * 登录 / 登出广播的处理函数。
 * 必须放在 setup 作用域（不能写在 onMounted 里）：注销时只能摘自己这一个监听，
 * 用 uni.$off('user_login') 会把 profile 页注册的同一个事件也一起摘掉。
 */
function onUserLogin(data) {
  if (data) {
    isLoggedIn.value = true;
    user.value = normalizeUser(readStoredUser() || user.value);
    roomsReady.value = false;
    loading.value = true;
    getData();
  } else {
    applyLogoutState();
  }
}

onMounted(() => {
  if (isLoggedIn.value) {
    getData();
  }
  uni.$on('refresh_room_data', (data) => {
    if (data) {
      const roomId = Number(data.roomId);
      const room = rooms.value.find((r) => r.id === roomId);
      if (!room) return;
      room.name = data.roomName;
    } else {
      getRoomList();
    }
  });
  uni.$on('checklist_board_refresh', () => {
    if (isLoggedIn.value) getRoomList();
  });
  uni.$on('schedule_board_refresh', () => {
    if (isLoggedIn.value) getRoomList();
  });
  uni.$on('task_ledger_refresh', () => {
    if (isLoggedIn.value) getRoomList();
  });
  uni.$on('user_login', onUserLogin);
  uni.$on('refresh_notification_count', getMessageCount);
});

onShow(() => {
  // 切回明细页时刷新当前账本、月度收支与最近账单
  loadMonthSummary();
  loadRecentEntries();
  // 每次回到首页都刷新铃铛未读数，避免消息中心已读后红点残留/迟滞
  if (isLoggedIn.value) getMessageCount();
  const saved = readStoredUser();
  if (saved && !isLoggedIn.value) {
    isLoggedIn.value = true;
    user.value = normalizeUser(saved);
    roomsReady.value = false;
    loading.value = true;
    getData();
  }

  if (isLoggedIn.value && (uni.getStorageSync(CHECKLIST_REFRESH_KEY) || uni.getStorageSync(SCHEDULE_REFRESH_KEY))) {
    uni.removeStorageSync(CHECKLIST_REFRESH_KEY);
    uni.removeStorageSync(SCHEDULE_REFRESH_KEY);
    getRoomList();
  }
});

const getData = () => {
  getRoomList();
  getMessageCount();
  loadMonthSummary();
  loadRecentEntries();
};

const getMessageCount = async () => {
  try {
    const res = await notificationsApi.getNotificationReadCount();
    if (res.code == 0 && res.data) {
      // 后端同时返回 count / total，两者都兼容
      const value = res.data.count != null ? res.data.count : res.data.total;
      messageCount.value = Number(value) || 0;
      return;
    }
    messageCount.value = 0;
  } catch (e) {
    messageCount.value = 0;
  }
};

onUnmounted(() => {
  uni.$off('refresh_room_data');
  uni.$off('checklist_board_refresh');
  uni.$off('schedule_board_refresh');
  uni.$off('task_ledger_refresh');
  uni.$off('refresh_notification_count');
  uni.$off('user_login', onUserLogin);
});

const getRoomList = async () => {
  if (!isLoggedIn.value) return;
  loading.value = true;
  isError.value = false;
  try {
    const res = await roomApi.getRoomList();
    if (res.code === 0) {
      rooms.value = res.data || [];
    }
    const count = rooms.value?.length || 0;
    user.value.roomsCount = count;
    userStore.updateUserInfo({ roomsCount: count, roomCount: count });
  } catch (e) {
    isError.value = true;
  } finally {
    loading.value = false;
    roomsReady.value = true;
  }
};
const goToNotifications = () => {
  uni.navigateTo({ url: '/pages/notifications/notifications' });
};





</script>

<style scoped>
.home-tab-container {
  min-height: 100vh;
  position: relative;
  background-color: var(--bg-page, #F6F8F8);
  transition: background-color 0.35s ease;
}

.home-content { position: relative; z-index: 1; padding: 16px 16px 0; }
.home-top-band {
  margin: -16px -16px 0;
  padding: 16px 16px 18px;
  background: var(--primary-color, #2F5D6B);
}
.home-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.welcome-text { font-size: 19px; font-weight: 600; color: #FFFFFF; letter-spacing: 0; }

/* 头部右侧操作区 */
.header-right { display: flex; align-items: center; gap: 14px; }
.msg-entry { position: relative; }
.msg-btn-bg {
  width: 34px; height: 34px;
  background: rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-sm, 8px);
  display: flex; align-items: center; justify-content: center;
  border: none;
}
.msg-btn-bg:active { opacity: 0.7; }
.msg-icon { font-size: 17px; }
/* 未读小红点：贴在铃铛矩形框的右上角，尺寸尽量小，不压住图标 */
.msg-badge-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 6px;
  height: 6px;
  box-sizing: content-box;
  background: var(--color-expense, #F43F5E);
  border-radius: 50%;
  border: 1.5px solid #fff;
  z-index: 2;
}

.avatar-box { position: relative; }
.main-avatar { width: 40px; height: 40px; border-radius: var(--radius-md, 12px); border: 1px solid var(--line-hairline, #EEF1F5); }
.status-badge { position: absolute; bottom: -2px; right: -2px; width: 11px; height: 11px; background: var(--text-faint, #CBD5E1); border: 2px solid #fff; border-radius: 50%; }
.status-badge.online { background: var(--color-income, #10B981); }

/* 未登录引导卡：实色主色卡，无流光 / 发光 / 漂浮动画 */
.guest-card {
  position: relative;
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;
  background: var(--primary-color, #2F5D6B);
  box-shadow: 0 6px 18px rgba(47, 93, 107, 0.16);
  display: flex;
  flex-direction: column;
}

.card-inner-content {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; align-items: center;
  padding: 32px 24px;
}

.floating-hero { margin-bottom: 20px; }
.hero-icon-3d {
  width: 64px; height: 64px;
  background: rgba(255, 255, 255, 0.16);
  border-radius: var(--radius-md, 12px);
  display: flex; align-items: center; justify-content: center;
}
.inner-emoji { font-size: 32px; }

.text-info-center { text-align: center; margin-bottom: 24px; }
.hero-title-gradient {
  font-size: 21px; font-weight: 600; letter-spacing: 0; display: block;
  color: #FFFFFF;
}
.hero-subtitle { font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.78); margin-top: 8px; }

.action-footer { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.glass-login-btn {
  width: 100%;
  height: 46px;
  background: #FFFFFF;
  border-radius: var(--radius-pill, 999px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s ease;
}
.glass-login-btn:active { transform: scale(0.98); }
.btn-text {
  font-size: 17px;
  font-weight: 600;
  color: var(--primary-color, #2f5d6b);
  transition: color 0.35s ease;
}
.btn-arrow {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-color, #2f5d6b);
  transition: color 0.35s ease;
}

.trust-badge { display: flex; align-items: center; gap: 8px; }
.trust-icon { font-size: 14px; }
.trust-text { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }

/* 预览区 */
.preview-section { margin-top: 40px; }
.section-hint {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color, #2f5d6b);
  opacity: 0.45;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 16px;
  display: block;
  text-align: center;
  transition: color 0.35s ease;
}
.locked-card {
  background: #fff;
  height: 120px;
  border-radius: var(--radius-lg, 16px);
  padding: 24px;
  border: 1px dashed var(--line-hairline, #EEF1F5);
  position: relative;
  overflow: hidden;
}

/* 未登录预览卡：去掉琉璃感，改成实底遮罩 */
.lock-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.86);
}
.lock-icon { font-size: 20px; opacity: 0.55; }
.lock-tip {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color, #2f5d6b);
  opacity: 0.75;
  transition: color 0.35s ease;
}

/* 空状态 */
.empty-state { text-align: center; padding: 40px 20px; }
.empty-icon-box { width: 72px; height: 72px; background: var(--bg-card, #fff); border-radius: var(--radius-lg, 16px); display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; border: 1px solid var(--line-hairline, #EEF1F5); }
.empty-emoji { font-size: 32px; }
.empty-title { font-size: 16px; font-weight: 600; color: var(--text-ink, #1E293B); display: block; margin-bottom: 8px; }
.empty-desc { font-size: 13px; font-weight: 400; color: var(--text-muted, #94A3B8); line-height: 1.6; }
.create-first-btn {
  margin-top: 10px;
  background: var(--primary-color, #2F5D6B);
  color: #fff;
  height: 46px;
  border-radius: var(--radius-pill, 999px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 15px;
  font-weight: 600;
  transition: background-color 0.2s ease;
}

/* 创建按钮：白底 + 主题色描边，避免与 soft 背景融在一起 */
.create-room-trigger {
  height: 46px;
  border-radius: var(--radius-md, 12px);
  border: 1px dashed var(--text-faint, #CBD5E1);
  background: var(--bg-card, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
  margin-bottom: 20px;
}
.create-room-trigger:active { background: #FAFBFC; }
.plus-icon-box {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm, 8px);
  background: var(--primary-soft, #E9F0F2);
  color: var(--primary-color, #2F5D6B);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  transition: background 0.35s ease, color 0.35s ease;
}
.create-txt {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color, #2F5D6B);
  transition: color 0.35s ease;
}

.animate-fade-in { animation: fadeIn 0.5s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.safe-spacer { height: 100px; }

/* ===== 顶部平铺工具条：账本 + 月份 ===== */
.home-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}
.toolbar-book {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 65%;
  padding: 7px 10px;
  border-radius: var(--radius-sm, 8px);
  background: rgba(255, 255, 255, 0.16);
  border: none;
}
.toolbar-book-name {
  font-size: 14px;
  font-weight: 600;
  color: #FFFFFF;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toolbar-book-arrow {
  margin-left: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  flex-shrink: 0;
}
.toolbar-month {
  display: flex;
  align-items: center;
  padding: 7px 12px;
  border-radius: var(--radius-sm, 8px);
  background: rgba(255, 255, 255, 0.16);
}
.toolbar-month-txt {
  font-size: 13px;
  font-weight: 600;
  color: #FFFFFF;
}
.toolbar-month-caret {
  display: flex;
  align-items: center;
  margin-left: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
}
.overview-stats {
  display: flex;
  align-items: center;
  margin-top: 16px;
  padding: 0 2px;
}
.ov-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ov-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}
.ov-value {
  margin-top: 6px;
  font-size: 20px;
  font-weight: 600;
  color: #FFFFFF;
  font-variant-numeric: tabular-nums;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-divider {
  width: 1px;
  height: 26px;
  background: rgba(255, 255, 255, 0.28);
}

.quick-row {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.quick-item {
  flex: 1;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-sm, 8px);
  background: rgba(255, 255, 255, 0.14);
  border: none;
}
.quick-item:active {
  background: rgba(255, 255, 255, 0.26);
}
.quick-icon {
  font-size: 14px;
}
.quick-txt {
  font-size: 13px;
  font-weight: 500;
  color: #FFFFFF;
}

.search-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-sm, 8px);
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #EEF1F5);
}
.search-entry-icon {
  font-size: 14px;
  opacity: 0.45;
}
.search-entry-txt {
  font-size: 13px;
  color: var(--text-muted, #94A3B8);
}

.recent-stream {
  margin-top: 14px;
}
.recent-empty {
  padding: 36px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.recent-empty-txt {
  font-size: 14px;
  color: var(--text-sub, #64748B);
}
.recent-empty-sub {
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
}

.recent-group {
  margin-bottom: 12px;
  background: var(--bg-card, #FFFFFF);
  border-radius: var(--radius-md, 12px);
  border: 1px solid var(--line-hairline, #EEF1F5);
  overflow: hidden;
}
.recent-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  background: var(--bg-page, #F6F8F8);
  border-bottom: 1px solid var(--line-hairline, #EEF1F5);
}
.recent-group-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub, #64748B);
}
.recent-group-sum {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
  font-variant-numeric: tabular-nums;
}

/* ---- 最近流水左滑操作 ---- */
.recent-swipe-wrap {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: #fff;
}
/** 操作层盖在行右侧（不是把整行推走），左滑时图标 + 分类仍然可见 */
.recent-actions-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
  z-index: 3;
  animation: recentActionsIn 0.22s cubic-bezier(0.32, 0.72, 0, 1);
}
@keyframes recentActionsIn { from { transform: translateX(100%); opacity: 0.4; } to { transform: translateX(0); opacity: 1; } }
.recent-swipe-btn {
  width: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.recent-swipe-btn.edit { background: var(--primary-color, #2F5D6B); }
.recent-swipe-btn.delete { background: var(--color-expense, #F43F5E); }
.recent-swipe-txt { font-size: 11px; font-weight: 600; color: #fff; }

.recent-row {
  position: relative;
  z-index: 2;
  background: #fff;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-bottom: 1px solid var(--line-hairline, #EEF1F5);
}
.recent-row:last-child {
  border-bottom: none;
}
.recent-row:active {
  background: #FAFBFC;
}
.recent-row-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm, 8px);
  background: var(--primary-soft, #E9F0F2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.recent-row-emoji {
  font-size: 16px;
}
.recent-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.recent-row-name {
  /* 和收支流水的 .cell-title 对齐：同一类“分类名”全站同字号同字重 */
  font-size: 15px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-row-user {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
}
.recent-row-note {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-row-amount {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex: none;
}
.recent-row-amount.income {
  color: var(--color-income, #3E8E6E);
}
.recent-row-amount.expense {
  color: var(--text-ink, #1E293B);
}

/* ===== 记一笔：悬浮主按钮 ===== */
.fab-entry {
  position: fixed;
  right: 20px;
  bottom: calc(24px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 18px;
  border-radius: var(--radius-lg, 16px);
  background: var(--primary-color, #2F5D6B);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.2);
  z-index: 90;
}
.fab-entry:active {
  transform: scale(0.96);
}
.fab-plus {
  font-size: 16px;
  color: #FFFFFF;
  line-height: 1;
}
.fab-txt {
  font-size: 14px;
  font-weight: 600;
  color: #FFFFFF;
}

</style>
