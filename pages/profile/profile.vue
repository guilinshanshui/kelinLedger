<template>
  <view :class="themeClass" class="profile-root">
    <scroll-view scroll-y class="profile-scroll" :show-scrollbar="false">
      <!-- 2. 用户核心区 (入场动画 1) -->
      <view class="hero-zone animate-in" style="--delay: 0.1s" @click="!isLoggedIn && goToLogin()">
        <view class="user-display-box">
          <view class="avatar-wrap">
            <UserAvatar
              :src="isLoggedIn ? user.userHeadUrl : ''"
              :name="isLoggedIn ? user.userNickname : '未登录'"
              :size="72"
              radius="16px"
            />
          </view>
          
          <view class="user-meta-info">
            <view class="name-row">
              <text class="user-nick">{{ isLoggedIn ? user.userNickname : '点击登录空间' }}</text>
              <!-- <view v-if="isLoggedIn" class="pro-badge">PRO</view> -->
            </view>
          </view>
        </view>

      </view>

        <!-- 3. 极简横向数据面板 (入场动画 2) -->
        <view class="flat-dashboard animate-in" style="--delay: 0.2s" :class="{ 'is-locked': !isLoggedIn }">
          <view class="dashboard-inner">
            <view class="dash-item" @click="dashClick('ledger')">
              <text class="dash-val">{{ isLoggedIn && userStatsInfo ? userStatsInfo.ledgerCount : '--' }}</text>
              <text class="dash-label">本月记账</text>
            </view>
            <view class="dash-divider"></view>
            <view class="dash-item" @click="dashClick('room')">
              <text class="dash-val">{{ isLoggedIn && userStatsInfo ? userStatsInfo.roomCount : '--' }}</text>
              <text class="dash-label">温馨小窝</text>
            </view>
            <view class="dash-divider"></view>
            <view class="dash-item highlight" @click="dashClick('asset')">
              <view class="price-row">
                <text class="currency">¥</text>
                <text class="dash-val">{{ isLoggedIn && userStatsInfo ? formatPrice(userStatsInfo.totalExpense) : '0' }}</text>
              </view>
              <text class="dash-label">本月支出</text>
            </view>
          </view>

          <!-- 锁定态遮罩 -->
          <view v-if="!isLoggedIn" class="dash-lock-layer">
            <view class="lock-pill">
              <AppIcon name="lock" :size="14" />
              <text class="lock-txt">登录同步数据</text>
            </view>
          </view>
        </view>

      <!-- 4. 菜单矩阵 (入场动画 3) -->
      <view class="menu-container animate-in" style="--delay: 0.3s">
        <view class="group-header">
          <text class="group-title">功能与设置</text>
        </view>
        
        <view class="flat-menu-list">
          <view id="menu-profile" class="menu-item" hover-class="menu-hover" @click="openProfileEditor">
            <view class="item-l">
              <view class="item-icon-box">
                <AppIcon name="user-2" :size="20" />
              </view>
              <text class="item-name">编辑资料</text>
            </view>
            <view class="item-r">
              <text class="item-arrow">›</text>
            </view>
          </view>

          <view id="menu-member" class="menu-item" hover-class="menu-hover" @click="handleMenuClick('member')">
            <view class="item-l">
              <view class="item-icon-box">
                <AppIcon name="safe-shield" :size="20" />
              </view>
              <text class="item-name">空间权限管理</text>
            </view>
            <view class="item-r">
              <text class="item-arrow">›</text>
            </view>
          </view>

          <!--
            空间看板：账本 / 清单 / 日程 / 动态四个模块的入口页。
            之前它只能从「消息中心」某条日程提醒点进去，界面上没有常驻入口，
            导致放在它里面的清单中心一直找不到。
          -->
          <view id="menu-dashboard" class="menu-item" hover-class="menu-hover" @click="goToDashboard">
            <view class="item-l">
              <view class="item-icon-box">
                <AppIcon name="counter-2" :size="20" />
              </view>
              <text class="item-name">空间看板</text>
            </view>
            <view class="item-r">
              <text class="item-arrow">›</text>
            </view>
          </view>

          <view id="menu-theme" class="menu-item" hover-class="menu-hover" @click="openThemePicker">
            <view class="item-l">
              <view class="item-icon-box">
                <AppIcon name="palette-2" :size="20" />
              </view>
              <text class="item-name">个性换肤</text>
            </view>
            <view class="item-r">
              <text class="item-val theme-name-val">{{ theme.name }}</text>
              <text class="item-arrow">›</text>
            </view>
          </view>

          <view id="menu-asset" class="menu-item" hover-class="menu-hover" @click="goToAsset">
            <view class="item-l">
              <view class="item-icon-box">
                <AppIcon name="bank-card" :size="20" />
              </view>
              <text class="item-name">资产账户</text>
            </view>
            <view class="item-r">
              <text class="item-arrow">›</text>
            </view>
          </view>

          <view id="menu-import" class="menu-item" hover-class="menu-hover" @click="goToImport">
            <view class="item-l">
              <view class="item-icon-box">
                <AppIcon name="download-2" :size="20" />
              </view>
              <text class="item-name">导入账单</text>
            </view>
            <view class="item-r">
              <text class="item-arrow">›</text>
            </view>
          </view>

          <view id="menu-export" class="menu-item" hover-class="menu-hover" @click="handleExport">
            <view class="item-l">
              <view class="item-icon-box">
                <AppIcon name="file-upload" :size="20" />
              </view>
              <text class="item-name">导出账单</text>
            </view>
            <view class="item-r">
              <text class="item-arrow">›</text>
            </view>
          </view>

          <view id="menu-version" class="menu-item" hover-class="menu-hover" @click="goToVersionHistory">
            <view class="item-l">
              <view class="item-icon-box">
                <AppIcon name="notification" :size="20" />
              </view>
              <text class="item-name">更新日志</text>
            </view>
            <view class="item-r">
              <text class="item-val">{{ appVersionLabel }}</text>
              <text class="item-arrow">›</text>
            </view>
          </view>
        </view>

        <!-- 5. 增强版退出按钮 (入场动画 4) -->
        <view class="auth-zone animate-in" style="--delay: 0.4s">
          <block v-if="isLoggedIn">
            <view class="logout-action-box" @click="handleLogout">
              <view class="logout-btn-premium">
                <text class="logout-text">退出当前账号</text>
              </view>
            </view>
            <!-- <text class="sec-tip">数据已通过云端加密保护</text> -->
          </block>
          
          <block v-else>
            <button class="login-action-btn" @click="goToLogin">
              <text class="login-btn-txt">立即开启协作</text>
            </button>
            <!-- <text class="sec-tip">已有 2,400+ 家庭正在使用</text> -->
          </block>
        </view>
      </view>

      <view class="bottom-safe-fill"></view>
    </scroll-view>

    <ProfileEditModal
      v-if="isLoggedIn"
      v-model="showProfileEditor"
      :isEdit="true"
      :userInfo="profileEditorInfo"
      @complete="onProfileSaved"
    />

    <ThemePickerModal v-model="showThemePicker" />

  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { userApi, assetApi } from '../../common/api';
import { STORAGE_KEYS } from '../../common/config';
import { normalizeUser } from '@/common/utils/session';
import { formatPrice, goToLogin } from '../js/utils.js';
import { onShow } from '@dcloudio/uni-app';
import { useAppTheme } from '@/common/themes/useAppTheme.js';
import { formatAppVersion } from '@/common/config';
import { useUserStore } from '@/store/user';
import UserAvatar from '../../components/common/UserAvatar.vue';
import AppIcon from '../../components/common/AppIcon.vue';
import ProfileEditModal from '../../components/common/ProfileEditModal.vue';
import ThemePickerModal from '../../components/common/ThemePickerModal.vue';

const { theme, themeClass } = useAppTheme();
const userStore = useUserStore();
const appVersionLabel = formatAppVersion();

const isLoggedIn = ref(false);
const isStatsLoading = ref(false);
const user = ref(normalizeUser(null));
const userStatsInfo = ref(null);
const showProfileEditor = ref(false);
const showThemePicker = ref(false);
const profileEditorInfo = computed(() => ({
  nickname: user.value.userNickname || '',
  avatar: user.value.userHeadUrl || ''
}));

const openProfileEditor = () => {
  if (!isLoggedIn.value) {
    goToLogin();
    return;
  }
  showProfileEditor.value = true;
};

const onProfileSaved = (saved) => {
  user.value = normalizeUser({
    ...user.value,
    nickname: (saved && saved.nickname) || user.value.nickname,
    avatar: (saved && saved.avatar) || user.value.avatar
  });
};

/**
 * 「我的」是 tab 页，onMounted 只会跑一次。
 * 如果只在 mounted 里拉统计，切了账本再回来看到的还是上一个账本的数字。
 * 所以每次 onShow 都重新按当前账本取一次。
 */
onShow(() => {
  if (isLoggedIn.value) getUserStatsInfo();
});

/**
 * 登录 / 登出广播的处理函数。
 * 写成 setup 作用域的具名函数：注销时只摘自己这一个监听，
 * 用 uni.$off('user_login') 会连首页注册的同一事件一起摘掉。
 */
const onUserLogin = (data) => {
  if (data) {
    isLoggedIn.value = true;
    const next = userStore.currentUser || uni.getStorageSync(STORAGE_KEYS.USER_INFO) || {};
    user.value = normalizeUser(next);
    getUserStatsInfo();
  } else {
    isLoggedIn.value = false;
    userStatsInfo.value = null;
  }
};

onMounted(() => {
  const savedUser = userStore.currentUser || uni.getStorageSync(STORAGE_KEYS.USER_INFO);
  if (savedUser) {
    isLoggedIn.value = true;
    user.value = normalizeUser(savedUser);
    getUserStatsInfo();
  }
  
  uni.$on('user_login', onUserLogin);
});

// 「我的」是常驻 tab 页，但页面仍可能被系统回收后重建；不注销的话每次重建都会多注册一次
onUnmounted(() => {
  uni.$off('user_login', onUserLogin);
});

const getUserStatsInfo = async () => {
  if (!isLoggedIn.value) return;
  isStatsLoading.value = true;
  try {
    // 只统计当前房间，避免把其他空间的账单算进来
    let statsRoomId = "";
    try {
      const saved = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM);
      statsRoomId = (saved && saved.id) || "";
    } catch (e) {
      statsRoomId = "";
    }
    const res = await userApi.getUserStatsInfo(statsRoomId ? { roomId: statsRoomId } : {});
    if (res && res.code === 0) {
      userStatsInfo.value = res.data;
    }
  } catch (e) {
    userStatsInfo.value = null;
  } finally {
    setTimeout(() => {
      isStatsLoading.value = false;
    }, 600);
  }
};


const handleMenuClick = (type) => {
  if ( !goToLogin()) { return; }
  if (((userStatsInfo.value && userStatsInfo.value.roomCount) || 0) <= 0) {
	  uni.showToast({
	  	title:'暂无空间',
		icon:'none'
	  })
	  return;
  }
  if (type === 'member') uni.navigateTo({ url: '/pages/member-management/member-management' });
};
const openThemePicker = () => {
  showThemePicker.value = true;
};

const goToVersionHistory = () => uni.navigateTo({ url: '/pages/version-history/version-history' }); //

/** 当前账本（由「账本」Tab 写入本地缓存） */
const currentRoomId = () => {
  try {
    const saved = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM);
    return (saved && saved.id) || '';
  } catch (error) {
    return '';
  }
};

const requireRoom = () => {
  const roomId = currentRoomId();
  if (!roomId) uni.showToast({ title: '请先在「账本」中选择一个账本', icon: 'none' });
  return roomId;
};

/**
 * 统计卡片点击跳转，三个数字都能点：
 * - 本月记账 → 收支流水，并且直接落在「本月」（和卡片数字同一口径）
 * - 温馨小窝 → 账本列表
 * - 本月支出 → 资产账户，并且直接落在「本月」
 *
 * home / room-list / profile 是 tabBar 页面，只能用 switchTab；
 * 之前这里用 navigateTo 打开 home，小程序会直接报错不跳转。
 */
const dashClick = (type) => {
  if (!isLoggedIn.value) { goToLogin(); return; }
  if (type === 'ledger') {
    const roomId = requireRoom();
    if (!roomId) return;
    uni.navigateTo({ url: `/pages/ledger-all/ledger-all?roomId=${roomId}&period=month` });
  } else if (type === 'room') {
    uni.switchTab({ url: '/pages/room-list/room-list' });
  } else if (type === 'asset') {
    goToAsset();
  }
};

/** 空间看板：房间的四个功能模块（账本/清单/日程/动态）都从这里进 */
const goToDashboard = () => {
  const roomId = requireRoom();
  if (!roomId) return;
  uni.navigateTo({ url: `/pages/dashboard/dashboard?roomId=${roomId}` });
};

const goToAsset = () => {
  const roomId = requireRoom();
  if (!roomId) return;
  // range=month：卡片上的金额是本月支出，进去也应该是本月
  uni.navigateTo({ url: `/pages/asset-details/asset-details?roomId=${roomId}&range=month` });
};

const goToImport = () => {
  const roomId = requireRoom();
  if (!roomId) return;
  uni.navigateTo({ url: `/pages/ledger-import/ledger-import?roomId=${roomId}` });
};

/** 导出账单：云函数生成 CSV，写入本地后调起分享 */
const handleExport = async () => {
  const roomId = requireRoom();
  if (!roomId) return;

  uni.showLoading({ title: '正在生成…', mask: true });
  try {
    const res = await assetApi.exportLedger({ roomId });
    uni.hideLoading();

    if (res.code !== 0) {
      uni.showToast({ title: res.message || '导出失败', icon: 'none' });
      return;
    }
    const payload = res.data || {};
    if (!payload.count) {
      uni.showToast({ title: '该账本还没有账单', icon: 'none' });
      return;
    }

    // USER_DATA_PATH 仅微信端提供，其他平台降级为提示
    const userDataPath = typeof wx !== 'undefined' && wx.env ? wx.env.USER_DATA_PATH : '';
    if (!userDataPath) {
      uni.showToast({ title: `已生成 ${payload.count} 条记录`, icon: 'success' });
      return;
    }

    const filePath = `${userDataPath}/${payload.filename}`;
    uni.getFileSystemManager().writeFile({
      filePath,
      data: payload.content,
      encoding: 'utf8',
      success: () => {
        if (typeof uni.shareFileMessage === 'function') {
          uni.shareFileMessage({
            filePath,
            fileName: payload.filename,
            fail: () => uni.showToast({ title: `已导出 ${payload.count} 条`, icon: 'success' })
          });
        } else {
          uni.showToast({ title: `已导出 ${payload.count} 条`, icon: 'success' });
        }
      },
      fail: () => uni.showToast({ title: '写入文件失败', icon: 'none' })
    });
  } catch (error) {
    uni.hideLoading();
    uni.showToast({ title: '导出失败', icon: 'none' });
  }
};


const handleLogout = () => {
  uni.showModal({
    title: '确认登出',
    content: '登出后您将无法实时同步家庭数据',
    confirmText: '确认退出',
    // 原生弹窗只吃具体色值，这里取当前主题的两个色，避免切肤后还闪着旧红
    confirmColor: theme.value.expense,
    cancelColor: theme.value.textSub,
    success: (res) => {
      if (res.confirm) {
        userStore.logout();
        userStore.setCurrentRoom(null);
        isLoggedIn.value = false;
        userStatsInfo.value = null;
        uni.$emit('user_login', false)
        goToLogin();
      }
    }
  });
};
</script>

<style scoped>
.profile-root {
  position: fixed;
  inset: 0;
  background: var(--bg-page, #F6F8F8);
  overflow: hidden;
  transition: background-color 0.35s ease;
}


.profile-scroll { position: relative; z-index: 1; height: 100%; }

/* Hero Zone */
.hero-zone {
  padding: 16px 16px 42px;
  background: var(--primary-color, #2F5D6B);
}
.user-display-box { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }

.avatar-wrap { position: relative; width: 72px; height: 72px; }


.user-meta-info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.name-row { display: flex; align-items: center; gap: 8px; }
  .user-nick { font-size: 22px; font-weight: 600; color: #FFFFFF; letter-spacing: 0; }
.pro-badge {
  background: var(--primary-color, #2f5d6b);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-sm, 8px);
}


/* Flat Dashboard */
.flat-dashboard { 
  margin: -30px 16px 0;
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-md, 12px);
  position: relative; overflow: hidden;
}
.dashboard-inner { padding: 16px 0; display: flex; align-items: center; }
.dash-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.dash-divider { width: 1px; height: 30px; background: var(--line-hairline, #E8EEEF); }
.dash-val { font-size: 21px; font-weight: 600; color: var(--text-ink, #1E293B); font-variant-numeric: tabular-nums; }
.dash-label { font-size: 12px; color: var(--text-sub, #64748B); }
.highlight .dash-val { color: var(--primary-color, #2F5D6B); }
.price-row { display: flex; align-items: baseline; gap: 2px; }
.currency { font-size: 13px; font-weight: 600; color: var(--primary-color, #2F5D6B); }

.dash-lock-layer { 
  position: absolute; inset: 0; background: rgba(255,255,255,0.72); display: flex; align-items: center; justify-content: center;
}
.lock-pill {
  background: var(--primary-color, #2f5d6b);
  padding: 10px 20px;
  border-radius: var(--radius-pill, 999px);
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 22px var(--primary-glow, rgba(47, 93, 107, 0.28));
  transition: background 0.35s ease, box-shadow 0.35s ease;
}
.lock-emoji { font-size: 14px; }
.lock-txt { color: #fff; font-size: 12px; font-weight: 600; }

/* Menu Container */
.menu-container { padding: 20px 16px 20px; }
.group-header { margin-bottom: 10px; }
.group-title { font-size: 12px; font-weight: 600; color: var(--text-sub, #64748B); }

.flat-menu-list { 
  background: var(--bg-card, #FFFFFF); border-radius: var(--radius-md, 12px); border: 1px solid var(--line-hairline, #EEF1F5); overflow: hidden;
}
.menu-item { 
  height: 48px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--line-soft, #F7F9FC); transition: background-color 0.2s ease;
}
.menu-item:last-child { border-bottom: none; }
.menu-hover { background: #F8FAFC; }

.item-l { display: flex; align-items: center; gap: 16px; }
.item-icon-box { 
  width: 36px; height: 36px; border-radius: var(--radius-sm, 8px);
  display: flex; align-items: center; justify-content: center;
  background: var(--primary-soft, #E9F0F2);
}
.icon-e { font-size: 18px; }
.item-name { font-size: 15px; font-weight: 600; color: var(--text-ink, #334155); }

.item-r { display: flex; align-items: center; gap: 8px; }
.item-val { font-size: 12px; font-weight: 600; color: var(--text-faint, #CBD5E1); }
.theme-name-val {
  color: var(--primary-color, #2f5d6b);
  font-weight: 600;
  transition: color 0.35s ease;
}
.item-arrow { font-size: 22px; color: var(--line-hairline, #E2E8F0); line-height: 1; margin-top: -3px; }

/* Auth Zone */
.auth-zone { margin-top: 24px; text-align: center; }
.sec-tip { font-size: 11px; font-weight: 600; color: var(--text-faint, #CBD5E1); display: block; margin-top: 16px; }

/* 退出登录按钮 */
.logout-action-box { position: relative; width: 100%; display: flex; justify-content: center; }
.logout-btn-premium {
  min-width: 168px;
  height: 40px;
  padding: 0 26px;
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--line-hairline, #E8EEEF);
  border-radius: var(--radius-pill, 999px);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
}
.logout-btn-premium:active {
  background: var(--bg-page, #F6F8F8);
}
.logout-text {
  color: var(--color-danger, #D96A63);
  font-size: 14px;
  font-weight: 500;
}
.login-action-btn {
  width: 100%;
  height: 72px;
  background: var(--primary-color, #2f5d6b);
  color: #fff;
  border-radius: var(--radius-lg, 16px);
  border: none;
  font-size: 17px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 14px 32px var(--primary-glow, rgba(47, 93, 107, 0.32));
  position: relative;
  overflow: hidden;
  transition: background 0.35s ease, box-shadow 0.35s ease;
}
.login-action-btn::after { border: none; }
.login-action-btn:active { transform: scale(0.98); opacity: 0.92; }
.login-btn-txt { color: #fff; position: relative; z-index: 1; }
.bottom-safe-fill { height: 16px; }

/* Staggered Entrance Animations */
.animate-in {
  opacity: 0; transform: translateY(20px);
  animation: slideInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1.1) forwards;
  animation-delay: var(--delay);
}
@keyframes slideInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
