
<template>
  <view :class="themeClass" class="ledger-all-root" :style="themeStyles">
    <view class="page-ambient" aria-hidden="true">    </view>
    <IosNav title="收支流水" @leftClick="goBack" :rightText="isLocked() ? '' : '导入'" @rightClick="goToImport" />

    <!-- 顶部固定筛选与汇总区 -->
    <view class="sticky-header">
      <view class="filter-capsule-row">
        <!-- 五个周期选项等分一行，不出滚动条 -->
        <view class="filter-flex">
          <view
            v-for="p in periods"
            :key="p.code"
            class="filter-pill"
            :class="{ active: currentPeriod === p.code }"
            @click="onPeriodChange(p.code)"
          >
            <text class="pill-txt">{{ p.name }}</text>
          </view>
        </view>
      </view>

      <!-- 自定义区间：选中「自定义」页签时才出现，选完即时重拉 -->
      <view v-if="currentPeriod === 'custom'" class="custom-range-row">
        <picker mode="date" :value="customStart" @change="onCustomStart">
          <view class="range-pill">
            <AppIcon name="calendar-2" :size="14" />
            <text class="range-txt">{{ customStart || '开始日期' }}</text>
          </view>
        </picker>
        <text class="range-sep">至</text>
        <picker mode="date" :value="customEnd" @change="onCustomEnd">
          <view class="range-pill">
            <AppIcon name="calendar-2" :size="14" />
            <text class="range-txt">{{ customEnd || '结束日期' }}</text>
          </view>
        </picker>
      </view>

      <!-- 动态汇总视窗 -->
      <view class="summary-viewport">
        <block v-if="isLoadingSummary">
          <view class="sum-card sk-item shimmer" v-for="i in 2" :key="'sk-sum-'+i"></view>
        </block>
        <block v-else>
          <view class="sum-card income animate-fade-in">
            <text class="sum-label">期间收入</text>
            <view class="sum-val-row">
              <text class="sum-sym">¥</text>
              <text class="sum-val">{{ formatPrice(summaryData?.income || 0.00) }}</text>
            </view>
            <view class="sum-bg-icon"><AppIcon name="arrow-right-up" :size="54" :color="incomeColor" /></view>
          </view>
          <view class="sum-card expense animate-fade-in">
            <text class="sum-label">期间支出</text>
            <view class="sum-val-row">
              <text class="sum-sym">¥</text>
              <text class="sum-val">{{ formatPrice(summaryData?.expense || 0.00) }}</text>
            </view>
            <view class="sum-bg-icon"><AppIcon name="arrow-right-down" :size="54" :color="expenseColor" /></view>
          </view>
        </block>
      </view>
    </view>

    <!-- 滚动列表 -->
    <scroll-view scroll-y class="main-list-scroll" :show-scrollbar="false" enable-back-to-top>
      <view class="list-inner">
        
        <!-- 1. 初始加载骨架屏 -->
        <view v-if="isLoadingGroups" class="skeleton-stack">
          <view v-for="g in 3" :key="'sk-g-'+g" class="sk-group">
            <view class="sk-header shimmer"></view>
          </view>
        </view>

        <!-- 2. 精美空状态 -->
        <view v-else-if="groupedData.length === 0" class="premium-empty-view animate-fade-in">
          <view class="empty-graphic-wrap">
            <view class="magic-blob-1"></view>
            <view class="magic-blob-2"></view>
            <view class="main-icon-circle">
              <view class="emoji-hero"><AppIcon name="leaf" :size="44" /></view>
            </view>
          </view>
          
          <view class="empty-text-group">
            <text class="empty-title">{{ currentPeriodLabel }}暂无收支记录</text>
            <text class="empty-subtitle">换个时间范围看看，或确认这段时间是否真的没有记账。</text>
          </view>
        </view>

        <template v-else>
        <!-- 左滑引导（仅首次；无可见明细时用示意卡片） -->
        <view
          v-if="showSwipeGuide && swipeGuideMode === 'standalone'"
          class="swipe-coach-standalone animate-fade-in"
        >
          <view class="swipe-coach-mock">
            <view class="swipe-coach-actions">
              <view class="swipe-coach-btn edit">修改</view>
              <view class="swipe-coach-btn delete">删除</view>
            </view>
            <view class="swipe-coach-cell">
              <view class="swipe-coach-cell-left">
                <view class="swipe-coach-icon"><AppIcon name="receive-money" :size="22" /></view>
                <view class="swipe-coach-lines">
                  <view class="swipe-coach-line w1"></view>
                  <view class="swipe-coach-line w2"></view>
                </view>
              </view>
              <text class="swipe-coach-amt">-¥0.00</text>
            </view>
            <view class="swipe-coach-hand" aria-hidden="true">
              <view class="swipe-coach-hand-icon"><AppIcon name="finger-swipe" :size="28" /></view>
            </view>
          </view>
          <text class="swipe-coach-title">向左滑动账目</text>
          <text class="swipe-coach-sub">可修改或删除记录，试试看吧</text>
          <view class="swipe-coach-dismiss" @click.stop="dismissSwipeGuide">
            <text>知道了</text>
          </view>
        </view>

        <!-- 3. 分组显示 -->
        <view v-for="(group, gIdx) in groupedData" :key="gIdx" class="day-group">
          
          <!-- 情况A：今日数据 -->
          <block v-if="group.date === '今日'">
            <view
              class="item-stack today-direct-stack animate-fade-in"
              :class="{ 'coach-guide-active': groupHasCoachTarget(group) }"
            >
              <view v-if="group.isLoading && (!group.ledgers || group.ledgers.length === 0)" class="inner-loading">
                <view class="spinner-dot"></view>
                <text class="loading-txt">正在拉取今日明细...</text>
              </view>

              <view 
                v-for="(item, iIdx) in group.ledgers" 
                :key="item.id" 
                class="swipe-cell-container"
                :class="{ 'coach-swipe-open': isCoachTarget(group, item) }"
              >
                <!-- 底层操作按钮 -->
                <view class="cell-actions-back" v-if="!isLocked() && !item.isDeleted && item.status !== 'void' && activeSwipeId === getSwipeKey(group, item)">
                  <view class="swipe-btn edit" @click.stop="onEdit(item)">
                    <AppIcon name="edit-2" :size="18" color="#FFFFFF" />
                    <text class="sb-txt">修改</text>
                  </view>
                  <view class="swipe-btn delete" @click.stop="onDelete(item)">
                    <AppIcon name="delete-2" :size="18" color="#FFFFFF" />
                    <text class="sb-txt">删除</text>
                  </view>
                </view>

                <!-- 表层内容区 -->
                <view 
                  class="transaction-cell"
                  :class="{ 
                    'is-locked-item': isLocked(item), 
                    'is-voided': item.isDeleted || item.status === 'void',
                    'is-swiped': activeSwipeId === getSwipeKey(group, item),
                    'coach-swipe-demo': isCoachTarget(group, item)
                  }"
                  @touchstart="onTouchStart($event, item, group)"
                  @touchmove="onTouchMove($event, item, group)"
                  @touchend="onTouchEnd($event, item, group)"
                  @click="onItemClick(item, group)"
                >
                  <view class="cell-left">
                    <view class="category-icon" :style="{ background: item.type === 'income' ? incomeIconBg : expenseIconBg }">
                      <AppIcon :value="item.categoryIcon" :size="22" />
                    </view>
                    <view class="cell-info">
                      <view class="cell-top">
                        <view class="cell-title-row">
                          <text class="cell-title">{{ item.category }}</text>
                          <text v-if="item.isModified" class="mod-tag">已修改</text>
                          <text v-if="item.creatorNickname" class="meta-user">{{ item.creatorNickname }}</text>
                        </view>
                        <text class="cell-amount" :class="item.type">
                          {{ item.type === 'income' ? '+' : '-' }}{{ formatPrice(item.amount) }}
                        </text>
                      </view>
                      <view class="cell-sub">
                        <text class="meta-time">{{ formatDate(item.entryTime,'MM/dd HH:mm') }}</text>
                        <view v-if="item.note" class="cell-note-wrap">
                          <text class="cell-note">{{ item.note }}</text>
                        </view>
                      </view>
                    </view>
                  </view>

                  <!-- 作废印章 -->
                  <view v-if="item.status=='void' || item.isDeleted" class="void-badge">
                    <text class="vb-txt">已作废</text>
                  </view>
                </view>

                <view v-if="isCoachTarget(group, item)" class="swipe-guide-float" @click.stop="dismissSwipeGuide">
                  <view class="swipe-guide-hand" aria-hidden="true">
                    <view class="swipe-guide-hand-icon"><AppIcon name="finger-swipe" :size="30" /></view>
                  </view>
                  <text class="swipe-guide-txt">向左滑动 · 修改 / 删除</text>
                  <text class="swipe-guide-skip">知道了</text>
                </view>
              </view>


              <!-- 空状态 -->
              <view v-if="!group.isLoading && (!group.ledgers || group.ledgers.length === 0)" class="inner-premium-empty animate-inner-pop">
                <view class="ie-decoration">
                   <view class="ie-circle"></view>
                   <view class="ie-emoji"><AppIcon name="leaf" :size="26" /></view>
                </view>
                <view class="ie-text-box">
                   <text class="ie-main">今日暂无明细</text>
                   <text class="ie-sub">让每一笔消费都有迹可循</text>
                </view>
              </view>
            </view>
          </block>

          <!-- 情况B：非今日数据 -->
          <block v-else>
            <view 
              class="sticky-day-header"
              :class="{ 'header-active': !collapsedGroups[gIdx] }"
              @click="toggleGroup(gIdx, group)"
            >
              <view class="header-blur-bg"></view>
              <view class="header-content">
                <view class="day-left">
                  <view class="collapse-arrow" :class="{ 'rotated': !collapsedGroups[gIdx] }">›</view>
                  <text class="day-title">{{ group.date }}</text>
                  <text v-if="group.day_name" class="day-sub">{{ group.day_name }}</text>
                </view>
                <view class="day-right">
                  <text class="day-sum">支 {{ group.total_expense }} / 收 {{ group.total_income }}</text>
                </view>
              </view>
            </view>

            <!-- 用 v-if 而不是 max-height 动画：max-height 一旦没接上过渡，
                 明细会被压在 0 高度里，看上去就像「没有记录」 -->
            <view v-if="!collapsedGroups[gIdx]" class="collapsible-wrapper">
              <view class="item-stack" :class="{ 'coach-guide-active': groupHasCoachTarget(group) }">
                <view v-if="group.isLoading && (!group.ledgers || group.ledgers.length === 0)" class="inner-loading">
                  <view class="spinner-dot"></view>
                  <text class="loading-txt">正在拉取明细...</text>
                </view>

                <view 
                  v-for="(item, iIdx) in group.ledgers" 
                  :key="item.id" 
                  class="swipe-cell-container"
                  :class="{ 'coach-swipe-open': isCoachTarget(group, item) }"
                >
                  <!-- 底层操作按钮 -->
                  <view class="cell-actions-back" v-if="!isLocked() && !item.isDeleted && item.status !== 'void' && activeSwipeId === getSwipeKey(group, item)">
                    <view class="swipe-btn edit" @click.stop="onEdit(item)">
                      <AppIcon name="edit-2" :size="18" color="#FFFFFF" />
                      <text class="sb-txt">修改</text>
                    </view>
                    <view class="swipe-btn delete" @click.stop="onDelete(item)">
                      <AppIcon name="delete-2" :size="18" color="#FFFFFF" />
                      <text class="sb-txt">删除</text>
                    </view>
                  </view>

                  <view 
                    class="transaction-cell"
                    :class="{ 
                      'is-locked-item': isLocked(item), 
                      'is-voided': item.isDeleted || item.status === 'void',
                      'is-swiped': activeSwipeId === getSwipeKey(group, item),
                      'coach-swipe-demo': isCoachTarget(group, item)
                    }"
                    @touchstart="onTouchStart($event, item, group)"
                    @touchmove="onTouchMove($event, item, group)"
                    @touchend="onTouchEnd($event, item, group)"
                    @click="onItemClick(item, group)"
                  >
                    <view class="cell-left">
                      <view class="category-icon" :style="{ background: item.type === 'income' ? incomeIconBg : expenseIconBg }">
                        <AppIcon :value="item.categoryIcon" :size="22" />
                      </view>
                      <view class="cell-info">
                        <view class="cell-top">
                          <view class="cell-title-row">
                            <text class="cell-title">{{ item.category }}</text>
                            <text v-if="item.isModified" class="mod-tag">已修改</text>
                            <text v-if="item.creatorNickname" class="meta-user">{{ item.creatorNickname }}</text>
                          </view>
                          <text class="cell-amount" :class="item.type">
                            {{ item.type === 'income' ? '+' : '-' }}{{ formatPrice(item.amount) }}
                          </text>
                        </view>
                        <view class="cell-sub">
                          <text class="meta-time">{{ formatDate(item.entryTime,'MM/dd HH:mm') }}</text>
                          <view v-if="item.note" class="cell-note-wrap">
                            <text class="cell-note">{{ item.note }}</text>
                          </view>
                        </view>
                      </view>
                    </view>

                    <!-- 作废印章 -->
                    <view v-if="item.isDeleted || item.status === 'void'" class="void-badge">
                      <text class="vb-txt">已作废</text>
                    </view>
                  </view>

                  <view v-if="isCoachTarget(group, item)" class="swipe-guide-float" @click.stop="dismissSwipeGuide">
                    <view class="swipe-guide-hand" aria-hidden="true">
                      <view class="swipe-guide-hand-icon"><AppIcon name="finger-swipe" :size="30" /></view>
                    </view>
                    <text class="swipe-guide-txt">向左滑动 · 修改 / 删除</text>
                    <text class="swipe-guide-skip">知道了</text>
                  </view>
                </view>


                <view v-if="!group.isLoading && (!group.ledgers || group.ledgers.length === 0)" class="inner-premium-empty animate-inner-pop">
                  <view class="ie-decoration">
                     <view class="ie-circle"></view>
                     <view class="ie-emoji"><AppIcon name="leaf" :size="26" /></view>
                  </view>
                  <view class="ie-text-box">
                     <text class="ie-main">暂无交易明细</text>
                     <text class="ie-sub">该时段未产生收支流水记录</text>
                  </view>
                </view>
              </view>
            </view>
          </block>
        </view>
        </template>

        <view v-if="!isLoadingGroups && groupedData.length > 0" class="list-end">
          <view class="end-line"></view>
          <text class="end-txt">已看完所有记录，没有更多啦</text>
          <view class="end-line"></view>
        </view>
      </view>
    </scroll-view>

  </view>
</template>

<script setup>
import { ref, computed, onMounted, reactive, onUnmounted, nextTick } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { useAppTheme } from '@/common/themes/useAppTheme.js';
import IosNav from '../../components/nav/ios-nav.vue';
import AppIcon from '../../components/common/AppIcon.vue';
import { taskApi } from '../../common/api';
import { formatDate, formatPrice } from '../../pages/js/utils.js';
import { STORAGE_KEYS } from '../../common/config';
import { goBackSafe } from '@/common/utils/nav.js'

const { themeClass, themeStyles, expenseColor, incomeColor, expenseSoftColor, incomeSoftColor } = useAppTheme();
/** 分类图标的底色跟主题一起切：收入绿底、支出红底 */
const incomeIconBg = computed(() => incomeSoftColor.value);
const expenseIconBg = computed(() => expenseSoftColor.value);

const roomId = ref(null);
const accountId=ref(null);
const isLoadingSummary = ref(true);
const isLoadingGroups = ref(true);
const currentPeriod = ref('today');
const summaryData = ref({ income: 0, expense: 0,currentUserId:0,currentUserRole:'' });
const groupedData = ref([]);
const collapsedGroups = reactive({});

/** 本地时区（用户即北京时间）的 YYYY-MM-DD，不依赖外部工具函数。 */
const localDayKey = (date = new Date()) => {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

const formatGroupLabel = (dateKey) => {
  if (!dateKey) return '未标注日期'
  if (String(dateKey) === localDayKey()) return '今日'
  const parts = String(dateKey).split('-')
  if (parts.length !== 3) return String(dateKey)
  return `${Number(parts[1])}月${Number(parts[2])}日`
}

const formatWeekday = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

const normalizeLedgerItem = (item) => ({
  ...item,
  category: item.categoryName || item.category || '未分类',
  entryTime: item.occurredAt || item.createTime,
  creatorNickname: item.creatorNickname || ''
})

// --- 左滑交互逻辑 ---
const LEDGER_SWIPE_GUIDE_KEY = 'ledger_swipe_guide_done';
const activeSwipeId = ref(null);
const showSwipeGuide = ref(false);
const swipeGuideMode = ref('none'); // 'row' | 'standalone' | 'none'
const coachTargetKey = ref(null);
let startX = 0;
let didSwipe = false;
let currentX = 0;
let coachAutoTimer = null;

const getSwipeKey = (group, item) => `${group.date}_${item.id}`;

const hasSeenSwipeGuide = () => !!uni.getStorageSync(LEDGER_SWIPE_GUIDE_KEY);

const dismissSwipeGuide = () => {
  showSwipeGuide.value = false;
  swipeGuideMode.value = 'none';
  coachTargetKey.value = null;
  if (coachAutoTimer) {
    clearTimeout(coachAutoTimer);
    coachAutoTimer = null;
  }
  uni.setStorageSync(LEDGER_SWIPE_GUIDE_KEY, '1');
};

const markSwipeGuideDone = () => {
  if (!hasSeenSwipeGuide()) dismissSwipeGuide();
};

const findFirstSwipeableItem = () => {
  for (const group of groupedData.value) {
    for (const item of group.ledgers || []) {
      if (!item.isDeleted && item.status !== 'void') {
        return { key: getSwipeKey(group, item) };
      }
    }
  }
  return null;
};

const scheduleSwipeGuide = () => {
  if (hasSeenSwipeGuide() || isLocked()) return;
  nextTick(() => {
    setTimeout(() => {
      if (hasSeenSwipeGuide() || isLocked()) return;
      if (isLoadingGroups.value || groupedData.value.length === 0) return;

      const first = findFirstSwipeableItem();
      if (first) {
        swipeGuideMode.value = 'row';
        coachTargetKey.value = first.key;
      } else {
        swipeGuideMode.value = 'standalone';
        coachTargetKey.value = null;
      }
      showSwipeGuide.value = true;
      if (coachAutoTimer) clearTimeout(coachAutoTimer);
      coachAutoTimer = setTimeout(() => dismissSwipeGuide(), 9000);
    }, 500);
  });
};

const isCoachTarget = (group, item) =>
  showSwipeGuide.value &&
  swipeGuideMode.value === 'row' &&
  coachTargetKey.value === getSwipeKey(group, item);

const groupHasCoachTarget = (group) =>
  showSwipeGuide.value &&
  swipeGuideMode.value === 'row' &&
  (group.ledgers || []).some((item) => coachTargetKey.value === getSwipeKey(group, item));

const onTouchStart = (e, item, group) => {
  if (isLocked() || item.isDeleted || item.status === 'void') return;
  startX = e.touches[0].clientX;
  didSwipe = false;
};

const onTouchMove = (e, item, group) => {
  if (isLocked() || item.isDeleted || item.status === 'void') return;
  currentX = e.touches[0].clientX;
  const diff = startX - currentX;
  const swipeKey = getSwipeKey(group, item);

  if (diff > 30) {
    // 标记本次手势是滑动：抬手后还会跟一个 click，不能被当成点击去跳转
    didSwipe = true;
    if (activeSwipeId.value !== swipeKey) activeSwipeId.value = swipeKey;
    markSwipeGuideDone();
  } else if (diff < -30 && activeSwipeId.value === swipeKey) {
    activeSwipeId.value = null;
  }
};

const onTouchEnd = () => {};
// -------------------

const periods = [
  { name: '今日', code: 'today' },
  { name: '本周', code: 'week' },
  { name: '本月', code: 'month' },
  { name: '本年', code: 'year' },
  { name: '自定义', code: 'custom' }
];

/** 自定义区间的起止日期，默认给「本月 1 号 ~ 今天」，点开就能直接用。 */
const customStart = ref('');
const customEnd = ref('');

const defaultRange = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    start: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    end: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  };
};

const onCustomStart = (e) => {
  customStart.value = e.detail.value;
  if (customEnd.value && customStart.value > customEnd.value) customEnd.value = customStart.value;
  initPage();
};

const onCustomEnd = (e) => {
  customEnd.value = e.detail.value;
  if (customStart.value && customEnd.value < customStart.value) customStart.value = customEnd.value;
  initPage();
};

/** 入口没带 roomId 时回退到当前账本，避免整页查不到数据。 */
const readCurrentRoomId = () => {
  try {
    const saved = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM);
    return (saved && saved.id) || '';
  } catch (error) {
    return '';
  }
};

onLoad((e) => {
  roomId.value = e.roomId || readCurrentRoomId();
  // 兼容历史链接里拼进去的 'undefined' / 'null' 字符串，否则会被当成真实账户过滤成空
  const rawAccountId = e.accountId;
  accountId.value = rawAccountId && rawAccountId !== 'undefined' && rawAccountId !== 'null' ? rawAccountId : '';
  // 从「我的 · 本月记账」跳进来时直接定位到对应区间；非法值忽略，落到默认的今日
  if (e.period && periods.some((p) => p.code === e.period)) {
    currentPeriod.value = e.period;
  }
});

onMounted(() => {
  initPage();
  uni.$on('refresh_ledger_data', () => {
    initPage();
  });
});

onUnmounted(() => {
  uni.$off('refresh_ledger_data');
  if (coachAutoTimer) clearTimeout(coachAutoTimer);
});

const isLocked=()=>{
	if(summaryData.value&&summaryData.value.currentUserRole==='viewer')return true;
	return false;
}

const initPage = async () => {
  isLoadingGroups.value = true;
  isLoadingSummary.value = true;
  activeSwipeId.value = null;
  showSwipeGuide.value = false;
  swipeGuideMode.value = 'none';
  coachTargetKey.value = null;
  if (coachAutoTimer) {
    clearTimeout(coachAutoTimer);
    coachAutoTimer = null;
  }
  Object.keys(collapsedGroups).forEach(key => delete collapsedGroups[key]);
  
  // 兜底：入口没带 roomId（或带上的是空值）时用当前账本，否则整页只会剩一个空态
  if (!roomId.value) roomId.value = readCurrentRoomId();

  try {
    const params = { roomId: roomId.value, accountId: accountId.value || '' };
    // 自定义区间走 /ledger/range，其余走 week/today/month/year
    const res = currentPeriod.value === 'custom'
      ? await taskApi.getLedgerRange({ ...params, startDate: customStart.value, endDate: customEnd.value })
      : await taskApi.getLedgerWeekList(params, currentPeriod.value);
    // 失败不能静静跳过：否则界面只剩「暂无记录」，看起来像数据丢了
    if (!roomId.value) {
      uni.showToast({ title: '未选择账本', icon: 'none' });
    } else if (res.code != 0) {
      uni.showToast({ title: res.message || '流水加载失败', icon: 'none' });
    }
    if (res.code == 0) {
      summaryData.value = {
        income: res.data.summary?.totalIncome || 0,
        expense: res.data.summary?.totalExpense || 0,
        currentUserRole: res.data.currentUserRole || 'viewer',
        currentUserId: res.data.currentUserId || ''
      };

      // 逐组容错：单组数据异常不应该把整页流水清空
      const rawGroups = (res.data.groups || []).map((group, groupIndex) => {
        try {
          return {
            date: formatGroupLabel(group.date),
            day_name: formatWeekday(group.date),
            total_income: Number(group.income || 0).toFixed(2),
            total_expense: Number(group.expense || 0).toFixed(2),
            ledgers: (group.list || []).map(normalizeLedgerItem),
            isLoaded: true,
            isLoading: false,
            page: 1,
            hasMore: false
          }
        } catch (error) {
          console.warn('[收支流水] 分组渲染失败，已跳过', groupIndex, error)
          return null
        }
      }).filter(Boolean)
      groupedData.value = rawGroups;
      // 默认展开：折叠状态下只看得到日期头，很容易被当成「没数据」
      groupedData.value.forEach((_, idx) => { collapsedGroups[idx] = false; });
    }
  } finally {
    isLoadingGroups.value = false;
    isLoadingSummary.value = false;
    scheduleSwipeGuide();
  }
};

const toggleGroup = async (index, group) => {
  const isCurrentlyCollapsed = collapsedGroups[index];
  collapsedGroups[index] = !isCurrentlyCollapsed;
};

/** 空态文案要跟当前筛选的时间范围一致，否则用户不知道在看哪一段。 */
const currentPeriodLabel = computed(() => {
  const hit = periods.find((item) => item.code === currentPeriod.value);
  return hit ? hit.name : '该时间段';
});

const onPeriodChange = (code) => {
  // 再点一次「自定义」也允许重新拉一次，方便选完日期后手动刷新
  if (currentPeriod.value === code && code !== 'custom') return;
  currentPeriod.value = code;
  if (code === 'custom' && (!customStart.value || !customEnd.value)) {
    const range = defaultRange();
    customStart.value = range.start;
    customEnd.value = range.end;
  }
  initPage();
};

/**
 * 点一笔流水：先收掉左滑状态；如果是滑开的就只收起，否则直接进修改页。
 * 已经记账后最常见的诉求就是改金额 / 改分类，不该逼用户先左滑再点修改。
 */
const onItemClick = (item, group) => {
  // 左滑抬手会补一个 click，这里直接吃掉，否则面板刚展开就被自己关掉了
  if (didSwipe) {
    didSwipe = false;
    return;
  }
  const swipeKey = getSwipeKey(group, item);
  // 面板已经打开时再点一下，只收起面板，不跳转
  if (activeSwipeId.value === swipeKey) {
    activeSwipeId.value = null;
    return;
  }
  // 点一下只是看详情，不进编辑——避免误触改成别的金额。
  // 修改入口统一收到左滑菜单里。
  uni.navigateTo({
    url: `/pages/add-entry/add-entry?roomId=${roomId.value}&accountId=${item.accountId || accountId.value || ''}&id=${item.id}&readonly=1&type=${item.type || 'expense'}`
  });
};

const onEdit = (item) => {
  activeSwipeId.value = null;
  // 权限不在这里拦：不是创建者也不是管理员时，详情页会自己进入只读浏览态
  uni.navigateTo({
    // 带上原类型，编辑页一进去就落在对应的支出 / 收入 / 转账页签
    url: `/pages/add-entry/add-entry?roomId=${roomId.value}&accountId=${accountId.value}&id=${item.id}&isEdit=true&type=${item.type || 'expense'}`
  });
};

const onDelete = (item) => {
  activeSwipeId.value = null;
  uni.showModal({
    title: '作废记录',
    content: '确定要作废这笔收支吗？作废后不可恢复，金额将不再计入总额。',
    confirmText: '确定作废',
    confirmColor: expenseColor.value,
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '正在作废...' });
        try {
          const resp = await taskApi.deleteLedger(item.id, roomId.value);
          if (resp.code === 0) {
            uni.showToast({ title: '已作废', icon: 'success' });
            item.isDeleted = true;
            uni.$emit('refresh_ledger_data');
          }
        } finally {
          uni.hideLoading();
        }
      }
    }
  });
};

const goBack = () => goBackSafe();

const goToImport = () => {
  if (isLocked()) return;
  uni.navigateTo({
    url: `/pages/ledger-import/ledger-import?roomId=${roomId.value}&accountId=${accountId.value}`
  });
};
</script>

<style scoped>
.ledger-all-root {
  height: 100vh;
  background-color: var(--primary-soft, #E9F0F2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  transition: background-color 0.35s ease;
}

.page-ambient { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.blob-primary { top: -50px; right: -40px; width: 280px; height: 280px; background: var(--primary-color, #2F5D6B); }
.blob-secondary { bottom: 25%; left: -60px; width: 240px; height: 240px; background: var(--secondary-color, #416F7B); }

.sticky-header,
.main-list-scroll {
  position: relative;
  z-index: 0;
}

/* 顶部固定区 */
.sticky-header { background: rgba(255, 255, 255, 0.92); padding-bottom: 20px; border-bottom: 1rpx solid var(--primary-soft, #E9F0F2); z-index: 200; }
.filter-capsule-row { display: flex; align-items: center; padding: 12px 20px; }
/* 五个选项等分整行：320px 小屏下每个还有 51px，放得下“自定义”三个字 */
.filter-flex { display: flex; gap: 6px; width: 100%; }
.filter-pill {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-soft, #E9F0F2); border-radius: var(--radius-pill, 999px);
  transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s;
}
.filter-pill.active { background: var(--primary-color, #2F5D6B); box-shadow: 0 8px 20px var(--primary-glow, rgba(47, 93, 107, 0.2)); }
.pill-txt { font-size: 13px; font-weight: 600; color: var(--text-muted, #94A3B8); white-space: nowrap; }
.active .pill-txt { color: #fff; }

/* 自定义区间选择器 */
.custom-range-row { display: flex; align-items: center; gap: 8px; padding: 0 20px 12px; }
.range-pill { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: var(--radius-md, 12px); background: #fff; border: 1px solid var(--line-hairline, #E8EEEF); }
.range-txt { font-size: 12px; font-weight: 600; color: var(--text-ink, #1E293B); }
.range-sep { font-size: 12px; color: var(--text-muted, #94A3B8); }

.summary-viewport { display: flex; padding: 0 20px; gap: 16px; margin-top: 4px; }
.sum-card { flex: 1;  border-radius: var(--radius-lg, 16px); padding: 14px 20px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
/* 收入/支出的底色原来写反了，这里按语义归位 */
.sum-card.income { background: var(--color-income-soft, #ECFDF5); border: 1rpx solid var(--color-income-soft, #D1FAE5); }
.sum-card.expense { background: var(--color-expense-soft, #FFF1F2); border: 1rpx solid var(--color-expense-soft, #FFE4E6); }
.sum-label { font-size: 10px; font-weight: 600; color: var(--text-muted, #94A3B8); text-transform: uppercase; letter-spacing: 1px; }
.sum-val-row { display: flex; align-items: baseline; gap: 2px; margin-top: 2px; }
.sum-sym { font-size: 14px; font-weight: 600; }
.sum-val { font-size: 18px; font-weight: 600; }
.income .sum-val, .income .sum-sym { color: var(--color-income, #3E8E6E); }
.expense .sum-val, .expense .sum-sym { color: var(--color-expense, #C4554D); }
.sum-bg-icon { position: absolute; right: -8px; bottom: -8px; font-size: 54px; font-weight: 600; opacity: 0.04; transform: rotate(-15deg); }

/* 列表滚动区 */
.main-list-scroll { flex: 1; height: 0; }

/* 左滑组件容器 */
.swipe-cell-container {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: #fff;
  flex-shrink: 0;
  transform: translateZ(0);
}

/* 底层按钮 */
@keyframes cellActionsIn { from { transform: translateX(100%); opacity: 0.4; } to { transform: translateX(0); opacity: 1; } }

.cell-actions-back {
  position: absolute;
  top: 2px;
  right: 0;
  bottom: 2px;
  height: auto;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  /* 盖在行上面：滑开时按钮从右侧推入，行不动，图标和分类始终可见 */
  z-index: 3;
  animation: cellActionsIn 0.22s cubic-bezier(0.32, 0.72, 0, 1);
  overflow: hidden;
  box-sizing: border-box;
}
.swipe-btn {
  width: 80px;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s;
  box-sizing: border-box;
}
.swipe-btn.edit { background: var(--primary-color, #2F5D6B); }
.swipe-btn.delete { background: var(--color-expense, #F43F5E); }
.sb-icon { font-size: 18px; color: #fff; margin-bottom: 2px; }
.sb-txt { font-size: 11px; font-weight: 600; color: #fff; }

/* 表层内容卡片 */
.transaction-cell {
  /* 必须比 .cell-actions-back 高一层：否则底层按钮会盖在内容上面，左滑看不到删除 */
  z-index: 2;
  transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1);
  position: relative;
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: #fff;
  z-index: 2;
  box-sizing: border-box;
  transition: transform 0.5s cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform;
  border-bottom: 1rpx solid #f1f5f9;
  transform: translateZ(0);
}
.transaction-cell::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: #fff;
  z-index: 3;
  pointer-events: none;
}
.item-stack .swipe-cell-container:last-child .transaction-cell {
  border-bottom: none;
}
.item-stack .swipe-cell-container:last-child .transaction-cell::after {
  height: 4px;
}

.is-swiped {
  box-shadow: -10px 0 30px rgba(0,0,0,0.05);
}

.is-voided { opacity: 0.45; filter: grayscale(1); pointer-events: none; }
.void-badge {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg);
  border: 3rpx solid var(--color-expense, #F43F5E); padding: 6rpx 20rpx; border-radius: 8rpx;
  background: rgba(255, 255, 255, 0.9); z-index: 5; pointer-events: none;
}
.vb-txt { color: var(--color-expense, #F43F5E); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2rpx; }
.mod-tag { font-size: 9px; font-weight: 600; background: var(--primary-soft, #E9F0F2); color: var(--primary-color, #2F5D6B); padding: 2rpx 8rpx; border-radius: 4rpx; flex-shrink: 0; }

/* 列表内元素样式 */
.cell-left { display: flex; align-items: flex-start; gap: 16px; flex: 1; min-width: 0; }
.category-icon { width: 44px; height: 44px; border-radius: var(--radius-md, 12px); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; margin-top: 1px; }
.emoji { font-size: 18px; }
.cell-info { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.cell-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}
.cell-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}
.cell-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-ink, #334155);
  flex-shrink: 0;
  max-width: 100%;
}
.cell-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}
.meta-time, .meta-user { font-size: 10px; font-weight: 600; color: var(--text-faint, #CBD5E1); flex-shrink: 0; }
.cell-amount { font-size: 16px; font-weight: 600; flex-shrink: 0; line-height: 1.2; }
/* 明细行金额同样按语义色：收入绿、支出红 */
.income { color: var(--color-income, #3E8E6E); }
.expense { color: var(--color-expense, #C4554D); }
.cell-note-wrap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.cell-note {
  display: block;
  width: 100%;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-faint, #CBD5E1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 分组样式 */
.sticky-day-header { position: sticky; top: 0; z-index: 10; height: 64px; display: flex; align-items: center;  transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s; }
.header-active .header-blur-bg { background: rgba(255, 255, 255, 0.98); }
.header-blur-bg { position: absolute; inset: 0; background: var(--primary-soft, #E9F0F2); opacity: 0.94; border-bottom: 1rpx solid rgba(0,0,0,0.03); transition: background 0.35s ease; }
.header-content { position: relative; z-index: 2; width: 100%; display: flex; justify-content: space-between; align-items: flex-end; padding: 0 24px 12px; }
.day-left { display: flex; align-items: baseline; gap: 8px; }
.collapse-arrow { font-size: 18px; color: var(--text-faint, #CBD5E1); transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1); margin-right: 4px; }
.collapse-arrow.rotated { transform: rotate(90deg); color: var(--primary-color, #2F5D6B); }
.day-title { font-size: 17px; font-weight: 600; color: var(--text-ink, #1E293B); }
.day-sub { font-size: 12px; font-weight: 600; color: var(--text-muted, #94A3B8); }
.day-sum { font-size: 10px; font-weight: 600; color: var(--text-faint, #CBD5E1); text-transform: uppercase; }

.collapsible-wrapper { overflow: hidden; transition: background-color 0.4s, color 0.4s, border-color 0.4s, box-shadow 0.4s, opacity 0.4s, transform 0.4s; will-change: max-height, opacity, margin-bottom; }
.item-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  border: none;
  border-radius: 0;
  overflow: hidden;
  box-shadow: none;
}
.today-direct-stack {
  margin: 0 0 12px;
  width: 100%;
}
.list-inner {
  padding: 0 0 8px;
  width: 100%;
  box-sizing: border-box;
}
.day-group {
  width: 100%;
}

/* 其它样式 */
.inner-premium-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; background: #fff; }
.ie-decoration { position: relative; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
.ie-circle { position: absolute; inset: 0; background: linear-gradient(135deg, rgba(241, 245, 249, 0.6) 0%, rgba(226, 232, 240, 0.4) 100%); border-radius: var(--radius-lg, 16px); transform: rotate(15deg); }
.ie-emoji { font-size: 24px; position: relative; z-index: 1; animation: floatSmall 3s infinite ease-in-out; }
@keyframes floatSmall { 0%, 100% { transform: translateY(0) rotate(15deg); } 50% { transform: translateY(-4px) rotate(10deg); } }
.ie-text-box { text-align: center; }
.ie-main { font-size: 14px; font-weight: 600; color: var(--text-sub, #64748B); display: block; margin-bottom: 4px; }
.ie-sub { font-size: 10px; font-weight: 600; color: var(--text-faint, #CBD5E1); text-transform: uppercase; letter-spacing: 0.5px; }
.animate-inner-pop { animation: innerPop 0.5s cubic-bezier(0.32, 0.72, 0, 1) both; }
@keyframes innerPop { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

.inner-loading { display: flex; flex-direction: column; align-items: center; padding: 40px 0; gap: 12px; }
.spinner-dot { width: 24px; height: 24px; border: 3px solid var(--primary-soft, #E9F0F2); border-top-color: var(--primary-color, #2F5D6B); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.loading-txt { font-size: 12px; font-weight: 600; color: var(--text-muted, #94A3B8); }

.sk-header { width: 180px; height: 28px; background: #F1F5F9; border-radius: var(--radius-sm, 8px); margin: 20px 24px; }
.shimmer { position: relative; overflow: hidden; background: #F1F5F9 !important; }
.shimmer::after { position: absolute; top: 0; right: 0; bottom: 0; left: 0; transform: translateX(-100%); background-image: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent); animation: shimmerAnim 2s infinite; content: ''; }
@keyframes shimmerAnim { 100% { transform: translateX(100%); } }

.list-end { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 40px 0 100px; }
.end-line { width: 30px; height: 1rpx; background: var(--line-hairline, #E2E8F0); }
/* 中文不加字距（全站规则），“END OF RECORDS”的大写字母间距套到汉字上会很散 */
.end-txt { font-size: 11px; font-weight: 600; color: var(--text-faint, #66788D); }

.animate-fade-in { animation: fadeIn 0.6s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* 全局空状态 */
.premium-empty-view { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 40px 120px; text-align: center; position: relative; }
.empty-graphic-wrap { position: relative; width: 180px; height: 180px; margin-bottom: 40px; display: flex; align-items: center; justify-content: center; }
.magic-blob-1, .magic-blob-2 { position: absolute; inset: 0; border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%; animation: morphBlob 8s infinite alternate ease-in-out; }
.magic-blob-1 { background: linear-gradient(135deg, var(--primary-soft, #E9F0F2) 0%, var(--bg-page, #F6F8F8) 100%); opacity: 0.6; }
.magic-blob-2 { background: linear-gradient(135deg, var(--primary-glow, rgba(47, 93, 107, 0.1)) 0%, var(--primary-soft, #E9F0F2) 100%); transform: rotate(45deg); animation-delay: -2s; animation-duration: 10s; transition: background 0.35s ease; }
@keyframes morphBlob { 0% { border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%; transform: rotate(0deg) scale(1); } 50% { border-radius: 60% 40% 30% 70% / 50% 30% 70% 50%; transform: rotate(180deg) scale(1.1); } 100% { border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%; transform: rotate(360deg) scale(1); } }
.main-icon-circle { width: 90px; height: 90px; background: #fff; border-radius: var(--radius-lg, 16px); display: flex; align-items: center; justify-content: center; box-shadow: 0 15px 35px var(--primary-glow, rgba(47, 93, 107, 0.1)); z-index: 5; animation: floatEmoji 4s infinite ease-in-out; }
@keyframes floatEmoji { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
.emoji-hero { font-size: 44px; }
.empty-text-group { margin-bottom: 48px; z-index: 2; }
.empty-title { font-size: 22px; font-weight: 600; color: var(--text-ink, #1E293B); display: block; margin-bottom: 12px; letter-spacing: 0; }
.empty-subtitle { font-size: 14px; font-weight: 600; color: var(--text-muted, #94A3B8); line-height: 1.6; max-width: 240px; margin: 0 auto; }
/* 左滑首次引导 */
.swipe-cell-container.coach-swipe-open { overflow: hidden; }
.item-stack.coach-guide-active { overflow: visible; }
.transaction-cell.coach-swipe-demo {
  animation: coachSwipeHint 1.7s cubic-bezier(0.4, 0, 0.2, 1) 0.35s 3;
  z-index: 3;
}
@keyframes coachSwipeHint {
  0%, 100% { transform: translateX(0); }
  38%, 62% { transform: translateX(-88px); }
}

.swipe-guide-float {
  position: absolute;
  left: 0;
  right: 0;
  top: -6px;
  transform: translateY(-100%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  padding-bottom: 8px;
}
.swipe-guide-hand {
  animation: guideHandSwipe 1.7s ease-in-out 0.35s 3;
}
.swipe-guide-hand-icon {
  font-size: 28px;
  display: block;
  filter: drop-shadow(0 4px 8px rgba(15, 23, 42, 0.12));
}
@keyframes guideHandSwipe {
  0%, 100% { transform: translateX(36px); opacity: 0.9; }
  38%, 62% { transform: translateX(-40px); opacity: 1; }
}
.swipe-guide-txt {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color, #2f5d6b);
  background: #fff;
  padding: 6px 14px;
  border-radius: var(--radius-pill, 999px);
  box-shadow: 0 6px 20px var(--primary-glow, rgba(47, 93, 107, 0.15));
  border: 1px solid var(--primary-soft, #e9f0f2);
}
.swipe-guide-skip {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #94A3B8);
  padding: 4px 10px;
}

.swipe-coach-standalone {
  margin: 8px 0 20px;
  padding: 20px 18px 16px;
  width: 100%;
  box-sizing: border-box;
  background: #fff;
  border: none;
  border-top: 1px solid var(--primary-soft, #e9f0f2);
  border-bottom: 1px solid var(--primary-soft, #e9f0f2);
  box-shadow: 0 12px 36px var(--primary-glow, rgba(47, 93, 107, 0.12));
  display: flex;
  flex-direction: column;
  align-items: center;
}
.swipe-coach-mock {
  width: 100%;
  position: relative;
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;
  margin-bottom: 14px;
  background: #f8fafc;
}
.swipe-coach-actions {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 140px;
  display: flex;
  z-index: 1;
}
.swipe-coach-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}
.swipe-coach-btn.edit { background: var(--primary-color, #2f5d6b); }
.swipe-coach-btn.delete { background: var(--color-expense, #F43F5E); }
.swipe-coach-cell {
  position: relative;
  z-index: 2;
  background: #fff;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  animation: coachSwipeHint 1.7s cubic-bezier(0.4, 0, 0.2, 1) 0.2s 3;
  border-bottom: 1rpx solid #f1f5f9;
}
.swipe-coach-cell-left { display: flex; align-items: center; gap: 12px; }
.swipe-coach-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md, 12px);
  background: var(--primary-soft, #e9f0f2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.swipe-coach-lines { display: flex; flex-direction: column; gap: 6px; }
.swipe-coach-line { height: 8px; background: #f1f5f9; border-radius: var(--radius-sm, 8px); }
.swipe-coach-line.w1 { width: 72px; }
.swipe-coach-line.w2 { width: 48px; }
.swipe-coach-amt { font-size: 15px; font-weight: 600; color: var(--color-income, #10B981); }
.swipe-coach-hand {
  position: absolute;
  right: 28%;
  bottom: 8px;
  z-index: 5;
  animation: guideHandSwipe 1.7s ease-in-out 0.2s 3;
  pointer-events: none;
}
.swipe-coach-hand-icon {
  font-size: 32px;
  display: block;
}
.swipe-coach-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  margin-bottom: 4px;
}
.swipe-coach-sub {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #94A3B8);
  margin-bottom: 12px;
  text-align: center;
}
.swipe-coach-dismiss {
  padding: 8px 22px;
  border-radius: var(--radius-pill, 999px);
  background: var(--primary-soft, #e9f0f2);
}
.swipe-coach-dismiss text {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-color, #2f5d6b);
}
</style>
