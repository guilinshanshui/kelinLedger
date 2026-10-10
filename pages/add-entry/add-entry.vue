
<template>
  <view class="add-container" :class="[themeClass, 'type-' + transactionType, { 'is-readonly': !canOperate }]">
    <!-- 顶部导航 -->
    <IosNav 
      :title="browseMode ? '账单详情' : (id ? '编辑' + typeLabel : '记一笔')"
      @leftClick="goBack" 
    />

    <!-- 只读提示：既不是创建者也不是管理员时，这笔账单只能看不能改 -->
    <view v-if="id && !canOperate" class="readonly-banner">
              <AppIcon name="eye" :size="14" tone="secondary" />
      <text class="readonly-txt">只能浏览：这笔账单由 {{ member || '其他成员' }} 记录</text>
    </view>
    <scroll-view 
      scroll-y 
      class="add-scroll" 
      enable-back-to-top
      :show-scrollbar="false"
    >
      <view class="add-content-inner">
        
        <!-- 1. 流水类型切换器 (更紧凑) -->
        <view class="type-switcher-container" v-if="!id">
          <view class="type-switcher-bg">
            <view 
              class="type-slider" 
              :style="{ transform: `translateX(${typeIndex * 100}%)` }"
            ></view>
            <view 
              class="type-tab" 
              :class="{ active: transactionType === 'expense' }"
              @click="handleTypeChange('expense')"
            >
              <text class="tab-txt">支出</text>
            </view>
            <view 
              class="type-tab" 
              :class="{ active: transactionType === 'income' }"
              @click="handleTypeChange('income')"
            >
              <text class="tab-txt">收入</text>
            </view>
            <view 
              class="type-tab" 
              :class="{ active: transactionType === 'transfer' }"
              @click="handleTypeChange('transfer')"
            >
              <text class="tab-txt">转账</text>
            </view>
          </view>
        </view>

        <!-- 2. 金额输入卡片 (高度大幅压缩) -->
        <view class="amount-hero-card" :class="{ 'is-amount-focused': isAmountFocused }">
          <view
            class="amount-card-inner"
            :class="{ 'is-focus': isAmountFocused }"
            :style="amountFocusBorderStyle"
          >
            <view class="amount-label-row">
              <text class="amount-card-label">交易金额</text>
              <view class="amount-tag">CNY</view>
            </view>
            <view class="amount-input-container">
              <text class="amount-symbol">¥</text>
              <input 
                type="digit" 
                :value="amount"
                @input="onAmountInput"
                class="amount-input-field" 
                placeholder="0.00" 
                placeholder-style="color: var(--text-faint, #66788D); font-weight: 600;"
                :cursor-color="themeColor"
                focus
                @focus="isAmountFocused = true"
                @blur="isAmountFocused = false"
              />
            </view>
          </view>
        </view>

        <!-- 3. 详情信息卡片 (紧凑型) -->
        <view class="add-details">
          <!-- 分类选择 -->
          <view class="add-row" @click="onCategoryRowClick">
            <view class="add-row-left">
              <view class="add-row-icon g" :style="{ backgroundColor: themeColor + '14' }">
                <AppIcon :value="currentCategoryIcon" :size="20" :color="themeColor" />
              </view>
              <text class="add-row-label">{{ typeLabel }}分类</text>
            </view>
            <view class="add-row-right">
              <view class="category-path" v-if="transactionType === 'expense' && parentCategoryDisplay">
                <text class="path-parent">{{ parentCategoryDisplay }}</text>
                <text class="path-sep">/</text>
              </view>
              <text class="add-row-val">{{ category || '点击选择' }}</text>
              <text class="add-row-arrow"> ›</text>
            </view>
          </view>

          <!-- 成员选择 -->
          <view class="add-row" @click="showMemberPicker = true">
            <view class="add-row-left">
              <view class="add-row-icon b" :style="{ backgroundColor: themeColor + '14' }">
                <AppIcon name="user-2" :size="20" :color="themeColor" />
              </view>
              <text class="add-row-label">经办成员</text>
            </view>
            <view class="add-row-right member-display">
              <view class="member-preview-stack" v-if="memberInfo">
                <view class="mini-avatar-item">
                  <UserAvatar :src="memberInfo.icon || memberInfo.avatar" :name="memberInfo.nickname || member" :size="22" radius="50%" class="mini-img" />
                </view>
              </view>
              <text class="add-row-val ml-1">{{ member || '请选择' }}</text>
              <text class="add-row-arrow ml-1">›</text>
            </view>
          </view>
          
          <view class="add-row" @click="showDatePicker = true">
            <view class="add-row-left">
              <view class="add-row-icon p" :style="{ backgroundColor: themeColor + '14' }">
                <AppIcon name="calendar-2" :size="20" :color="themeColor" />
              </view>
              <text class="add-row-label">交易日期</text>
            </view>
            <view class="add-row-right">
              <text class="add-row-val">{{ date }}</text>
              <text class="add-row-arrow">›</text>
            </view>
          </view>
		  
		  <view v-if="transactionType != 'transfer'" class="add-row" @click="showPayPicker = true">
		    <view class="add-row-left">
		      <view class="add-row-icon g" :style="{ backgroundColor: themeColor + '14' }">
		        <AppIcon :value="currentPayIcon" :size="20" :color="themeColor" />
		      </view>
		      <text class="add-row-label">支付方式</text>
		    </view>
		    <view class="add-row-right">
		      <text class="add-row-val">{{ pay || '请选择' }}</text>
		      <text class="add-row-arrow">›</text>
		    </view>
		  </view>

          <!-- 4. 备注区 (重构美化：全宽便签布局) -->
          <view class="memo-compact-section">
            <view class="memo-header-line">
              <text class="memo-tiny-label">备注说明</text>
              <view class="memo-tiny-icon"><AppIcon name="pencil" :size="12" tone="faint" /></view>
            </view>
            <view
              class="memo-input-container"
              :class="{ 'is-focus': isMemoFocused }"
              :style="memoFocusBorderStyle"
            >
              <textarea 
                v-model="note" 
                class="add-textarea-memo" 
                placeholder="记录这一刻的碎碎念..."
                @focus="isMemoFocused = true"
                @blur="isMemoFocused = false" 
                placeholder-style="color: var(--text-faint, #66788D); font-weight: 500;" 
                auto-height
              />
            </view>
          </view>
        </view>

        <!-- 底部占位 -->
        <view class="add-footer-placeholder"></view>
      </view>
    </scroll-view>

    <!-- 悬浮保存栏：只读时整条隐藏，不给无效操作入口 -->
    <view v-if="canOperate" class="fixed-save-container">
      <view class="floating-save-dock animate-island-in">
        <view class="dock-content">
          <view class="dock-info">
            <text class="dock-label">确认保存金额</text>
            <view class="dock-amount-row">
              <text class="dock-sym" :style="{ color: !amount || parseFloat(amount) <= 0 ? 'var(--text-faint, #66788D)' : themeColor }">¥</text>
              <text class="dock-val" :style="{ color: !amount || parseFloat(amount) <= 0 ? 'var(--text-sub, #4E5F74)' : themeColor }">
                {{ amount || '0.00' }}
              </text>
            </view>
          </view>
          
          <!-- 背景色交给 CSS 类（跟随主题变量），不用 JS 绑 style：
               小程序端把对象绑到 :style 上会渲染成字符串 "true"，主题色直接丢失 -->
          <button
            class="save-pill-btn"
            @click="saveEntry"
            :class="{ 'btn-disabled': !canSave, 'btn-ready': canSave }"
          >
            <text class="save-txt">确认保存</text>
          </button>
        </view>
      </view>
      <view class="safe-area-bottom"></view>
    </view>

    <!-- 弹窗组件 -->

    <BottomPicker 
      v-model="showSingleCategoryPicker"
      :title="'选择' + typeLabel + '分类'"
      layout="grid"
      :cols="3"
      :options="flatCategories"
      :currentSelected="category"
      @change="onCategorySelected"
    />
	
	<BottomPicker
	  v-model="showPayPicker"
	  title="选择支付方式"
	  layout="grid"
	  :cols="3"
	  :options="filteredPay"
	  :currentSelected="pay"
	  @change="onPaySelected"
	/>

    <BottomPicker 
      v-model="showMemberPicker"
      title="选择经办成员"
      layout="list"
      :options="memberOptions"
      :currentSelected="member"
      @change="onMemberSelected"
    />
    <SheetDatePicker
      v-model="showDatePicker"
      title="交易日期"
      :value="date"
      :end="todayStr"
      @change="onSheetDateChange"
    />
  </view>
</template>

<script setup>
import { useAppTheme } from '@/common/themes/useAppTheme.js'
const { themeClass, primaryColor, softColor, incomeColor, warningColor, theme } = useAppTheme()

import { ref, onMounted, computed, watch, getCurrentInstance } from 'vue';
import IosNav from '../../components/nav/ios-nav.vue';
import BottomPicker from '../../components/common/BottomPicker.vue';
import AppIcon from '../../components/common/AppIcon.vue';
import UserAvatar from '../../components/common/UserAvatar.vue';
import SheetDatePicker from '../../components/common/SheetDatePicker.vue';
import { assetApi, roomApi, taskApi } from '../../common/api';
import { onLoad } from "@dcloudio/uni-app";
import { formatDate, dateToTimestamp } from '../../pages/js/utils.js';
import { STORAGE_KEYS } from '../../common/config';
import { getCurrentUserId } from '@/common/utils/session';
import { goBackSafe } from '@/common/utils/nav.js'

const TASK_LEDGER_NEEDS_REFRESH = 'task_ledger_needs_refresh'
const CHECKLIST_REFRESH_KEY = 'checklist_board_dirty_room'

let openerEventChannel = null

// 基础状态逻辑保持不变
const amount = ref('');
const isAmountFocused = ref(true);
const isMemoFocused = ref(false);
const note = ref("");
const transactionType = ref('expense'); 
const category = ref('');       
const categoryInfo = ref(null);
const member = ref(null);
const memberInfo = ref(null);
const localDateStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const date = ref(localDateStr());
/**
 * 编辑已有账单时记住原来的「时刻」（HH:mm）。
 * 日期选择器只到「天」，保存时如果直接取中午，用户原本的时间就被改掉了。
 */
const originalTimeOfDay = ref('');
const todayStr = ref(localDateStr());
const roomId = ref(null);
const accountId = ref(null);
const id = ref(null);
/** 能否改动这笔账单：创建者本人或 owner/admin 为 true，其他人只读。 */
const canOperate = ref(true);
/**
 * 浏览模式：从账单列表点进来只是「看详情」，不直接进编辑。
 * 这样做是为了防误触——编辑入口统一收到左滑菜单里。
 */
const browseMode = ref(false);
const taskId = ref(null);

const pay = ref('');
const payInfo = ref(null);
const playType = ref('transfer');

const showMemberPicker = ref(false);
const showSingleCategoryPicker = ref(false); 
const showPayPicker = ref(false);
const showDatePicker = ref(false);

const expenseCategories = ref([]);
const incomeCategories = ref([]);
const transferAccounts = ref([]);
const payMethods = ref([]);
const memberOptions = ref([]);

const typeLabel = computed(() => {
  if (transactionType.value === 'expense') return '支出';
  if (transactionType.value === 'income') return '收入';
  return '转账';
});

const parentCategoryDisplay = computed(() => {
  if (!category.value) return '';
  const current = categories.value.find(c => c.label === category.value);
  if (current && current.parentId) {
    const parent = categories.value.find(p => p.id === current.parentId);
    return parent ? parent.label : '';
  }
  return '';
});
/** 当前流水维度对应的分类列表：支出/收入取自各自集合，转账时是转入账户。 */
const categories = computed(() => {
  if (transactionType.value === 'income') return incomeCategories.value
  if (transactionType.value === 'transfer') return transferAccounts.value
  return expenseCategories.value
})


const flatCategories = computed(() => {
  // 转账时入口是「转入账户」，要排除当前账户自身
  if (transactionType.value === 'transfer') {
    return categories.value.filter((cat) => String(cat.id) !== String(accountId.value))
  }
  return categories.value
})
const filteredPay = computed(() =>
  payMethods.value.filter(cat => cat.type === playType.value)
);

const currentCategoryIcon = computed(() => {
  const found = categories.value.find(c => c.label === category.value);
  return found ? found.icon : 'mc:puzzled';
});

const currentPayIcon = computed(() => {
  const list = filteredPay.value || [];
  const found = list.find(c => c.label === pay.value);
  return found ? found.icon : 'mc:puzzled';
});

const onCategoryRowClick = () => {
  // 支出/收入/转账统一走 BottomPicker，保持弹层动画与选中样式一致
  showSingleCategoryPicker.value = true;
};

const onCategorySelected = (item) => {
  category.value = item.label;
  categoryInfo.value = item;
};

const typeIndex = computed(() => ({ expense: 0, income: 1, transfer: 2 }[transactionType.value]));
const canSave = computed(() => amount.value && parseFloat(amount.value) > 0);

const themeColor = computed(() => {
  // 这里的值会被拼进 SVG 填充色和 8 位 hex，必须是真实色值，不能是 var()
  if (transactionType.value === 'income') return incomeColor.value;
  if (transactionType.value === 'transfer') return warningColor.value;
  return primaryColor.value;
});

const hexWithAlpha = (hex, alpha) => {
  if (!hex || typeof hex !== 'string') return `rgba(47, 93, 107, ${alpha})`;
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `#${normalized}${a}`;
};

const amountFocusBorderStyle = computed(() => {
  if (!isAmountFocused.value) return {};
  const c = themeColor.value;
  return {
    borderColor: c,
    boxShadow: `0 8px 28px ${hexWithAlpha(c, 0.16)}`
  };
});

const memoFocusBorderStyle = computed(() => {
  if (!isMemoFocused.value) return {};
  const c = themeColor.value;
  return {
    borderColor: c,
    boxShadow: `0 6px 20px ${hexWithAlpha(c, 0.1)}`
  };
});

onLoad((e) => {
  roomId.value = e.roomId;
  accountId.value = e.accountId;
  id.value = e.id;
  // 从流水列表点进来时会带上原类型，直接落在对应的支出 / 收入 / 转账页签
  if (e.readonly === '1') browseMode.value = true;
  if (['expense', 'income', 'transfer'].includes(e.type)) {
    transactionType.value = e.type;
  }
  if (e.taskId) taskId.value = e.taskId;
  if (e.note) {
    try {
      note.value = decodeURIComponent(e.note);
    } catch {
      note.value = e.note;
    }
  }

  // 兜底一：URL 没带 roomId 时，用「账本」Tab 选中的当前账本。
  // 用户从「明细」直接点「记一笔」时 currentRoom 可能还没写入过缓存。
  if (!roomId.value) {
    try {
      const saved = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM);
      if (saved && saved.id) roomId.value = saved.id;
    } catch (error) {
      // 读取失败则继续走下一步兜底
    }
  }

  const instance = getCurrentInstance()
  openerEventChannel = instance?.proxy?.getOpenerEventChannel?.() || null
});

/**
 * 兜底二：缓存里也没有账本时，拉一次列表取第一个并写回缓存。
 * 仍然拿不到就提示用户先去创建账本，避免停在「房间不存在」的报错页。
 */
const ensureRoomId = async () => {
  if (roomId.value) return true
  try {
    const res = await roomApi.getRoomList()
    const list = res.code === 0 ? res.data || [] : []
    if (!list.length) {
      uni.showToast({ title: '请先在「账本」创建一个空间', icon: 'none' })
      setTimeout(() => uni.switchTab({ url: '/pages/room-list/room-list' }), 1200)
      return false
    }
    roomId.value = list[0].id
    try {
      uni.setStorageSync(STORAGE_KEYS.CURRENT_ROOM, {
        id: list[0].id,
        name: list[0].name,
        avatar: list[0].avatar || ''
      })
    } catch (error) {
      // 写缓存失败不影响本次记账
    }
    return true
  } catch (error) {
    uni.showToast({ title: '账本加载失败，请重试', icon: 'none' })
    return false
  }
}

onMounted(async () => {
  const ready = await ensureRoomId()
  if (!ready) return
  getMember();
  getCategoriesList();
  if (!openerEventChannel) {
    const instance = getCurrentInstance()
    openerEventChannel = instance?.proxy?.getOpenerEventChannel?.() || null
  }
});
const handleTypeChange = (type) => {
  transactionType.value = type;
  category.value = '';
  categoryInfo.value = null;
  // 切换维度时旧支付方式不属于新维度，一并清掉
  pay.value = '';
  payInfo.value = null;
  initDefaultSelection();
};

/** 从 ISO 时间串里取本地时刻（HH:mm），取不到时返回空串。 */
const timeOfDayOf = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 编辑回填：一笔账单的金额 / 分类 / 账户 / 备注 / 日期都要回到它自己身上。 */
const getDetail = async (id) => {
  const res = await roomApi.ledgerDetail({ id: id, roomId: roomId.value });
  if (res.code != 0) return;

  const detail = res.data || {};
  // 权限由服务端下发：不是创建者也不是管理员时，这页只展示不可改
  canOperate.value = detail.canEdit !== false && !browseMode.value;
  // 类型决定顶部页签，编辑收入 / 转账不能还停在支出
  if (['expense', 'income', 'transfer'].includes(detail.type)) {
    transactionType.value = detail.type;
  }
  amount.value = detail.amount === undefined || detail.amount === null ? '' : String(detail.amount);
  note.value = detail.note || '';
  if (detail.accountId) accountId.value = detail.accountId;
  category.value = detail.type === 'transfer'
    ? (detail.toAccountName || '转入账户')
    : (detail.categoryName || '');
  categoryInfo.value = detail.type === 'transfer'
    ? { id: detail.toAccountId, label: category.value }
    : { id: detail.categoryId, label: category.value };
  member.value = detail.creatorNickname || member.value;
  pay.value = detail.payMethodName || '';
  payInfo.value = { id: detail.payMethodId, label: detail.payMethodName || '' };
  // 日期只展示到「天」，但原时刻要留下来，保存时原样写回
  const occurredAt = detail.occurredAt || detail.createTime || '';
  originalTimeOfDay.value = timeOfDayOf(occurredAt);
  date.value = formatDate(occurredAt, 'yyyy-MM-dd');
};

const getMember = async () => {
  try {
    const res = await roomApi.getRoomMembers(roomId.value);
    if (res.code !== 0) {
      console.warn('[记一笔] 成员接口返回异常', res.code, res.message, 'roomId =', roomId.value)
      return
    }
    memberOptions.value = res.data.map(m => ({
      icon: m.avatar, label: m.nickname, userId: m.userId, id: m.userId
    }));
    if (memberOptions.value.length === 0) {
      console.warn('[记一笔] 账本暂无成员，roomId =', roomId.value)
      return
    }
    // 默认经办人 = 当前登录账户；不在成员列表里时退回第一个成员。
    const currentUserId = String(getCurrentUserId() || '')
    const self = memberOptions.value.find(item => String(item.userId) === currentUserId)
    const target = self || memberOptions.value[0]
    console.log('[记一笔] 成员列表已加载', memberOptions.value.length, '人，当前用户 =', currentUserId, '命中自己 =', !!self)
    if (!member.value) {
      member.value = target.label;
      memberInfo.value = target;
    } else {
      const existing = memberOptions.value.find(item => item.label === member.value);
      memberInfo.value = existing || target;
      if (!existing) member.value = target.label;
    }
  } catch (error) {
    console.error('[记一笔] 成员列表加载失败', error, 'roomId =', roomId.value)
  }
};

const getCategoriesList = async () => {
  try {
    // 三个维度分别请求：后端按 type 过滤，不要拉全量再在前端混拼。
    const [expenseRes, incomeRes, payRes, accountRes] = await Promise.all([
      taskApi.getcategoryList({ roomId: roomId.value, type: 'expense' }),
      taskApi.getcategoryList({ roomId: roomId.value, type: 'income' }),
      taskApi.getcategoryList({ roomId: roomId.value, type: 'transfer' }),
      assetApi.listAccounts(roomId.value).catch(() => null)
    ])
    if (expenseRes.code !== 0) return
    if (!accountId.value && accountRes && accountRes.code === 0) {
      accountId.value = accountRes.data?.[0]?.id || ''
    }

    const shape = (rows) => (rows || []).map((item) => ({
      ...item,
      label: item.label || item.name,
      parentId: item.parentId || ''
    }))

    // 分类与账户分开存放：账户只在「转账」时作为转入方向出现。
    // 支付方式：只保留 transfer 类型（旧后端混发分类时，这里能挡住非支付项）。
    const rawPayRows = (payRes.code === 0 ? payRes.data || [] : [])
    payMethods.value = rawPayRows
      .filter((item) => !item.type || item.type === 'transfer')
      .map((item) => ({
        ...item,
        label: item.label || item.name,
        type: 'transfer'
      }))
    // 支出/收入分类按真实 type 过滤，避免旧后端混发时串维度。
    const knownType = (item) => item.type === 'expense' || item.type === 'income' || item.type === 'transfer'
    const rawExpense = shape(expenseRes.data).filter((item) => !knownType(item) || item.type === 'expense')
    const rawIncome = shape(incomeRes.data).filter((item) => !knownType(item) || item.type === 'income')
    expenseCategories.value = rawExpense
    incomeCategories.value = rawIncome
    if (rawExpense.length && rawExpense.length === rawIncome.length && rawExpense.every((item, i) => item.id === rawIncome[i].id)) {
      // 旧后端未按 type 过滤：同一份混合数据会被当成两个维度，这里告警便于发现。
      console.warn('[记一笔] 云端未按 type 过滤分类，请重新部署 roomie 云函数')
    }
    transferAccounts.value = (accountRes?.code === 0 ? accountRes.data || [] : []).map((item) => ({
      ...item,
      type: 'transfer',
      label: item.name,
      parentId: ''
    }))
    payMethods.value = (payRes.code === 0 ? payRes.data || [] : []).map((item) => ({
      ...item,
      label: item.label || item.name,
      type: 'transfer'
    }))

    if (id.value) await getDetail(id.value);
    else initDefaultSelection();
  } catch (e) {}
}

const initDefaultSelection = () => {
  const list = categories.value

  // 切维度后旧分类可能不属于当前维度，先清掉再重新选，避免残留。
  if (categoryInfo.value && !list.some((c) => c.id === categoryInfo.value.id)) {
    category.value = ''
    categoryInfo.value = null
  }

  if (!category.value) {
    const level1 = list.filter((cat) => !cat.parentId)
    if (level1.length > 0) {
      const level2 = list.filter((c) => c.parentId === level1[0].id)
      const picked = level2.length > 0 ? level2[0] : level1[0]
      category.value = picked.label
      categoryInfo.value = picked
    }
  }

  // 转账方向不能是当前账户自身
  if (transactionType.value === 'transfer' && categoryInfo.value && String(categoryInfo.value.id) === String(accountId.value)) {
    const target = transferAccounts.value.find((item) => String(item.id) !== String(accountId.value))
    if (target) {
      category.value = target.label
      categoryInfo.value = target
    }
  }

  // 支付方式：只在非转账时生效，切维度后同步校正
  if (transactionType.value === 'transfer') {
    pay.value = ''
    payInfo.value = null
  } else {
    const payList = filteredPay.value
    if (payInfo.value && !payList.some((p) => p.id === payInfo.value.id)) {
      pay.value = ''
      payInfo.value = null
    }
    if (payList.length > 0 && !pay.value) {
      pay.value = payList[0].label
      payInfo.value = payList[0]
    }
  }
};

watch(transactionType, () => {
  if (!id.value) initDefaultSelection();
});

const onAmountInput = (e) => {
  let val = e.detail.value.replace(/[^\d.]/g, "").replace(/\.{2,}/g, ".");
  val = val.replace(".", "$#$").replace(/\./g, "").replace("$#$", ".");
  val = val.replace(/^(\d+)\.(\d\d).*$/, '$1.$2');
  if (val.startsWith('.')) val = '0' + val;
  amount.value = val;
};

const onSheetDateChange = (val) => { date.value = val; };
const onMemberSelected = (item) => { memberInfo.value = item; member.value = item.label; };
const onPaySelected = (item) => { pay.value = item.label; payInfo.value = item; };

/**
 * 组装 occurredAt。
 * - 新记账：日期选择器只到「天」，落在当天中午，避免时区把日期推到前后一天；
 * - 编辑已有账单：保留原来的时刻，只有用户改了日期时才把原时刻搬到新日期上。
 */
const buildOccurredAt = () => {
  const [hh, mm] = (originalTimeOfDay.value || '12:00').split(':').map(Number);
  const offsetMs = ((Number(hh) || 0) * 60 + (Number(mm) || 0)) * 60 * 1000;
  return new Date(dateToTimestamp(date.value) + offsetMs).toISOString();
};

const saveEntry = async () => { 
  const parsedAmount = parseFloat(amount.value);
  if (!amount.value || isNaN(parsedAmount) || parsedAmount <= 0) {
    uni.showToast({ title: '请输入有效金额', icon: 'none' });
    return;
  }
  try {
    uni.showLoading({ title: '正在保存' });
    const map = {
      accountId: accountId.value,
      roomId: roomId.value,
      amount: amount.value,
      note: note.value,
      type: transactionType.value,
      categoryName: category.value,
      occurredAt: buildOccurredAt(),
      categoryId: transactionType.value === 'transfer' ? '' : categoryInfo.value?.id,
      payMethodId: transactionType.value === 'transfer' ? '' : payInfo.value?.id,
      toAccountId: transactionType.value === 'transfer' ? categoryInfo.value?.id : '',
      id: id.value
    };
    if (taskId.value && !id.value) map.taskId = taskId.value;
    const res = id.value ? await roomApi.ledgerUpdate(map) : await roomApi.ledgerAdd(map);
    if (res.code == 0) {
      uni.$emit('refresh_ledger_data');
      if (roomId.value) {
        uni.setStorageSync(CHECKLIST_REFRESH_KEY, String(roomId.value));
        uni.setStorageSync(TASK_LEDGER_NEEDS_REFRESH, String(roomId.value));
        uni.$emit('task_ledger_refresh', String(roomId.value));
      }
      uni.hideLoading();
      if (openerEventChannel) {
        openerEventChannel.emit('ledgerUpdated');
        setTimeout(() => goBackSafe(), 32);
      } else {
        goBackSafe();
      }
    } else {
      uni.showToast({ title: res.msg, icon: 'none' });
    }
  } catch (e) {
    uni.hideLoading();
  }
};
const goBack = () => goBackSafe();
</script>

<style scoped>
.add-container { background-color: #F8FAFC; height: 100%; display: flex; flex-direction: column; overflow: hidden; position: relative; transition: background 0.3s; }
.add-scroll { flex: 1; height: 0; }
.add-content-inner { padding-top: 12px; }

/* 类型切换器 */
.type-switcher-container { padding: 0 20px 16px; }
.type-switcher-bg { height: 44px; background: #F1F5F9; border-radius: var(--radius-lg, 16px); display: flex; position: relative; padding: 4px; }
.type-slider { position: absolute; top: 4px; left: 4px; width: calc((100% - 8px) / 3); height: calc(100% - 8px); background: #fff; border-radius: var(--radius-md, 12px); box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05); transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1); z-index: 1; }
.type-tab { flex: 1; display: flex; align-items: center; justify-content: center; z-index: 2; }
.tab-txt { font-size: 13px; font-weight: 600; color: var(--text-muted, #94A3B8); transition: color 0.3s; }
.type-expense .active .tab-txt { color: var(--primary-color, #2F5D6B); font-weight: 600; }
.type-income .active .tab-txt { color: var(--color-income, #3E8E6E); font-weight: 600; }
.type-transfer .active .tab-txt { color: var(--color-warning, #D97706); font-weight: 600; }
.type-expense .type-slider { box-shadow: 0 4px 14px var(--primary-glow, rgba(47, 93, 107, 0.15)); }
.type-income .type-slider { box-shadow: 0 4px 14px rgba(16, 185, 129, 0.2); }
.type-transfer .type-slider { box-shadow: 0 4px 14px rgba(245, 158, 11, 0.2); }

/* 金额卡片 */
.amount-hero-card { margin: 0 20px 16px; padding: 2px; border-radius: var(--radius-lg, 16px); transition: background-color 0.4s, color 0.4s, border-color 0.4s, box-shadow 0.4s, opacity 0.4s, transform 0.4s; }
.type-expense .amount-hero-card { background: linear-gradient(135deg, var(--primary-soft, #E9F0F2) 0%, var(--primary-soft, #E9F0F2) 100%); }
.type-income .amount-hero-card { background: linear-gradient(135deg, var(--color-income-soft, #F0FDF4) 0%, var(--color-income-soft, #DCFCE7) 100%); }
.type-transfer .amount-hero-card { background: linear-gradient(135deg, var(--color-warning-soft, #FFFBEB) 0%, #FEF3C7 100%); }
.amount-card-inner {
  background: #fff;
  border-radius: var(--radius-lg, 16px);
  padding: 16px 24px;
  border: 1.5px solid transparent;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}
.amount-card-inner.is-focus {
  border-width: 2px;
  padding: 15px 23px;
}
.amount-hero-card.is-amount-focused {
  box-shadow: 0 10px 36px var(--primary-glow, rgba(47, 93, 107, 0.12));
}
.amount-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.amount-card-label { font-size: 11px; font-weight: 600; color: var(--text-muted, #94A3B8); text-transform: uppercase; letter-spacing: 1px; }
.amount-tag { font-size: 10px; font-weight: 600; color: var(--text-faint, #CBD5E1); }
.amount-input-container { display: flex; align-items: center; gap: 10px; }
.amount-symbol { font-size: 24px; font-weight: 600; color: var(--text-ink, #1E293B); margin-top: 4px; }
.amount-input-field { flex: 1; font-size: 40px; font-weight: 600; color: var(--text-ink, #1E293B); height: 50px; }

/* 详情列表 */
.add-details { margin: 0 20px 16px; background: #fff; border-radius: var(--radius-lg, 16px); overflow: hidden; border: 1px solid #F1F5F9; }
.add-row { padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #F8FAFC; transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s; }
.add-row:active { background: #F8FAFC; }
.add-row-left { display: flex; align-items: center; gap: 12px; }
.add-row-icon { width: 34px; height: 34px; border-radius: var(--radius-sm, 8px); display: flex; align-items: center; justify-content: center; font-size: 16px; overflow: hidden; }
.add-row-label { font-size: 14px; font-weight: 600; color: var(--text-sub, #475569); }
.add-row-right { display: flex; align-items: center; }
.add-row-val { font-size: 14px; font-weight: 600; color: var(--text-ink, #1E293B); }
.add-row-arrow { font-size: 16px; color: var(--text-faint, #CBD5E1); margin-left: 4px; }

/* 备注区 - 重构美化 */
.memo-compact-section { padding: 18px 20px 24px; }
.memo-header-line { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding: 0 4px; }
.memo-tiny-label { font-size: 11px; font-weight: 600; color: var(--text-faint, #CBD5E1); text-transform: uppercase; letter-spacing: 1px; }
.memo-tiny-icon { font-size: 12px; color: var(--line-hairline, #E2E8F0); }

.memo-input-container { 
  background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%); 
  border-radius: var(--radius-lg, 16px); 
  padding: 12px 16px; 
  border: 1px solid #F1F5F9;
  transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
}
.memo-input-container.is-focus {
  background: #fff;
  border-width: 1.5px;
  transform: translateY(-1px);
}
.add-textarea-memo { 
  width: 100%; 
  min-height: 48px; 
  font-size: 14px; 
  font-weight: 600; 
  color: var(--text-ink, #334155); 
  line-height: 1.6; 
}

.category-path { display: flex; align-items: center; margin-right: 4px; opacity: 0.5; }
.path-parent { font-size: 10px; font-weight: 600; color: var(--text-muted, #94A3B8); }
.path-sep { font-size: 10px; margin: 0 2px; color: var(--text-faint, #CBD5E1); }

.mini-avatar-item { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #fff; overflow: hidden; background: #F1F5F9; box-shadow: 0 2px 6px rgba(0,0,0,0.05); margin-right: 4px; }
.mini-img { width: 100%; height: 100%; }

/* 底部保存栏 */
.add-footer-placeholder { height: 140px; } 

/* 只读浏览态：把表单区变成不可操作，避免看起来能改其实改不了 */
.add-container.is-readonly .add-content-inner {
  pointer-events: none;
}
.readonly-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 20px 12px;
  padding: 10px 14px;
  border-radius: var(--radius-md, 12px);
  background: var(--primary-soft, #FBF3EC);
}
.readonly-txt {
  font-size: 12px;
  font-weight: 600;
  color: var(--secondary-color, #B0603F);
}

.fixed-save-container { 
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 999; 
  background: linear-gradient(to top, rgba(248, 250, 252, 1) 50%, rgba(248, 250, 252, 0) 100%);
  padding: 8px 20px 16px; 
}

.floating-save-dock { 
  height: 84px; background: rgba(255, 255, 255, 0.9); border: 1.5px solid rgba(255,255,255,0.7); 
  border-radius: var(--radius-lg, 16px); display: flex; align-items: center; 
  padding: 0 10px 0 24px; box-shadow: 0 15px 40px rgba(0, 0, 0, 0.08);
  overflow: visible;
}

.dock-content { width: 100%; display: flex; align-items: center; justify-content: space-between; overflow: visible; }
.dock-info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.dock-label { font-size: 9px; font-weight: 600; color: var(--text-muted, #94A3B8); text-transform: uppercase; letter-spacing: 1px; }
.dock-amount-row { display: flex; align-items: baseline; gap: 3px; }
.dock-sym { font-size: 16px; font-weight: 600; }
.dock-val { font-size: 28px; font-weight: 600; letter-spacing: 0; }

.save-pill-btn { 
  background: transparent;
  margin: 0 !important;
  height: 60px;
  padding: 0 32px;
  border-radius: var(--radius-lg, 16px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-sizing: border-box;
  flex-shrink: 0;
  overflow: visible;
  line-height: normal;
  transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s;
}
.save-pill-btn::after {
  border: none !important;
  border-radius: var(--radius-lg, 16px) !important;
}
.save-pill-btn:active { transform: scale(0.94); opacity: 0.95; }
.btn-ready {
  background-color: var(--primary-color, #2F5D6B);
  box-shadow: 0 10px 25px var(--primary-glow, rgba(47, 93, 107, 0.2));
}
.btn-ready .save-txt { color: #fff; }


.btn-disabled {
  background-color: var(--primary-soft, #E9F0F2);
  border: 1.5px solid var(--primary-glow, rgba(47, 93, 107, 0.28));
  animation: none !important;
}
.btn-disabled .save-txt {
  color: var(--primary-color, #2F5D6B);
  opacity: 0.5;
}

.save-txt { font-size: 15px; font-weight: 600; }

.animate-island-in { animation: islandIn 0.7s cubic-bezier(0.32, 0.72, 0, 1) both; }
@keyframes islandIn { from { opacity: 0; transform: translateY(40px) scale(0.95); } to { opacity: 1; transform: translateY(0); } }
</style>
