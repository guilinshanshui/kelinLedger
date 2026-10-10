<template>
  <view :class="themeClass" class="details-container" :style="themeStyles" @click="selectedBar = null">
    <IosNav 
      title="资产数据深度透视" 
      @leftClick="goBack" 
    />

    <!-- 增强版极光氛围背景 -->
    <view class="mesh-bg">      <view class="noise-overlay"></view>
    </view>

    <!-- 顶部维度切换：重构美化版 -->
    <view class="period-dock animate-fade-in" @click.stop>
      <view class="period-capsule">

        <view 
          class="period-slider" 
          :style="{ 
            transform: `translateX(${selectedRangeIndex * 100}%)`, 
            width: (100 / rangeOptions.length) + '%' 
          }"
        >
          <view class="slider-inner-glow"></view>
        </view>
        
        <view
          v-for="(option, optionIndex) in rangeOptions"
          :key="option"
          class="period-item"
          :class="{ active: selectedRangeIndex === optionIndex }"
          @click="onRangeTabChange(optionIndex)"
        >
          <text class="period-txt">{{ option }}</text>
        </view>
      </view>
    </view>

    <scroll-view 
      scroll-y 
      class="details-scroll" 
      enable-back-to-top
      enhanced
      :show-scrollbar="false"
    >
      <!-- 点击滚动区域内部空白也能关闭气泡 -->
      <view class="scroll-content" @click="selectedBar = null">
        
        <!-- 1. 资产概览 Hero 区域 -->
        <view v-if="isLoading" class="hero-section skeleton-mode">
          <view class="sk-item shimmer" style="width: 120px; height: 12px; margin: 0 auto 16px; border-radius: var(--radius-sm, 8px);"></view>
          <view class="sk-item shimmer" style="width: 240px; height: 48px; margin: 0 auto 24px; border-radius: var(--radius-md, 12px);"></view>
          <view class="sk-card shimmer" style="height: 100px; border-radius: var(--radius-lg, 16px);"></view>
        </view>
        
        <view v-else class="hero-section animate-spring" @click.stop="selectedBar = null">
          <view class="hero-main-card">
            <text class="hero-label">当前净资产</text>
            <text class="hero-sublabel">{{ rangeLabel }}收支统计见下方</text>
            <view class="hero-amount animate-scale-in">
              <text class="amount-symbol">¥</text>
              <text class="amount-val">{{ formatMoney(overView?.asset?.total_balance || '0.00') }}</text>
            </view>
            
            <view class="hero-stats-row">
              <view class="stat-item">
                <text class="stat-label">{{ rangeLabel }}收入</text>
                <text class="stat-val income">+¥{{ formatMoney(periodIncome) }}</text>
              </view>
              <view class="stat-divider"></view>
              <view class="stat-item">
                <text class="stat-label">{{ rangeLabel }}支出</text>
                <text class="stat-val expense">-¥{{ formatMoney(periodExpense) }}</text>
              </view>
              <view class="stat-divider"></view>
              <view class="stat-item" :class="periodBalance >= 0 ? 'up' : 'down'">
                <text class="stat-label">期间结余</text>
                <text class="badge-txt">{{ periodBalance >= 0 ? '+' : '-' }}¥{{ formatMoney(Math.abs(periodBalance)) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 2. 双色堆叠图表 (深度重构适配多维度) -->
        <view class="content-card animate-slide-up" style="animation-delay: 0.1s" @click.stop="selectedBar = null">
          <view class="card-header-row">
            <view class="card-header">
              <view class="header-indicator purple"></view>
              <text class="header-title">{{ rangeLabel }}收支态势</text>
            </view>
            <view class="chart-legend">
              <view class="legend-item"><view class="l-dot inc"></view><text>收入</text></view>
              <view class="legend-item"><view class="l-dot exp"></view><text>支付</text></view>
            </view>
          </view>
          
          <view v-if="isLoading" class="chart-skeleton">
            <view class="chart-sk-bars">
              <view v-for="i in 7" :key="i" class="chart-sk-bar shimmer"></view>
            </view>
            <view class="chart-sk-labels shimmer"></view>
          </view>

          <view v-else-if="hasTrendData" class="chart-container">
            <view class="chart-bars" :class="['view-' + currentViewCode]">
              <view v-for="(val, i) in trendData" :key="i" class="bar-wrap">
                <view class="bar-val-hint animate-tooltip-in" v-if="selectedBar === i">
                  <view class="hint-line"><text class="h-l">收:</text><text class="h-v">¥{{ (val.income || 0).toFixed(2) }}</text></view>
                  <view class="hint-line"><text class="h-l">支:</text><text class="h-v">¥{{ Math.abs(val.expense || 0).toFixed(2) }}</text></view>
                </view>
                
                <view 
                  class="bar-stack-fill" 
                  :class="{ active: selectedBar === i }"
                  :style="{ height: getMasterHeight(val.income, val.expense) }"
                  @click.stop="selectedBar = i"
                >
                  <view 
                    class="segment income" 
                    :style="{ 
                      height: getSegmentHeight(val.income, val.expense, 'inc'),
                      transitionDelay: (i * (selectedRangeIndex === 1 ? 0.01 : 0.03)) + 's' 
                    }"
                  ></view>
                  <view 
                    class="segment expense" 
                    :style="{ 
                      height: getSegmentHeight(val.income, val.expense, 'exp'),
                      transitionDelay: (i * (selectedRangeIndex === 1 ? 0.01 : 0.03)) + 's' 
                    }"
                  ></view>
                </view>
              </view>
            </view>
            <view class="chart-labels" :class="['labels-' + currentViewCode]">
              <text v-for="d in currentChartLabels" :key="d" class="chart-label">{{ d }}</text>
            </view>
          </view>

          <view v-else-if="!isLoading" class="chart-empty-state animate-inner-pop">
            <view class="ce-visual" aria-hidden="true">
              <view class="ce-bars-row">
                <view
                  v-for="(h, i) in chartEmptyBarHeights"
                  :key="i"
                  class="ce-bar-wrap"
                >
                  <view class="ce-bar" :style="{ height: h }"></view>
                </view>
              </view>
              <view class="ce-axis"></view>
              <view class="ce-labels-row">
                <text v-for="d in currentChartLabels" :key="d" class="ce-day-label">{{ d }}</text>
              </view>
            </view>
            <view class="ce-text-box">
              <text class="ce-title">{{ rangeLabel }}暂无收支数据</text>
              <text class="ce-sub">记录收支后，趋势图表将在这里呈现</text>
            </view>
            <view class="ce-legend-hint">
              <view class="legend-item"><view class="l-dot inc"></view><text>收入</text></view>
              <view class="legend-item"><view class="l-dot exp"></view><text>支付</text></view>
            </view>
          </view>
        </view>

        <!-- 3. 资产构成 (现代化卡片网格) -->
        <view v-if="assetRows.length > 0" class="section-group animate-slide-up" style="animation-delay: 0.2s" @click.stop="selectedBar = null">
          <view class="group-header">
            <view class="header-indicator blue"></view>
            <text class="group-title">资产分布矩阵</text>
          </view>
          
          <view v-if="assetRows.length > 0" class="asset-modern-stack">
            <view
              v-for="(row, idx) in assetRows"
              :key="row.id || row.name"
              class="asset-modern-item animate-slide-in"
              :style="{ animationDelay: (0.3 + idx * 0.1) + 's' }"
            >
              <view class="ami-left">
                <view class="ami-icon-box" :style="{ background: row.color + '1A' }">
                  <AppIcon :value="row.icon" :size="22" :color="row.color" />
                </view>
                <view class="ami-info">
                  <view class="ami-title-row">
                    <text class="ami-name">{{ row.name }}</text>
                  </view>
                  <view class="ami-progress-track">
                    <view class="ami-progress-fill" :style="{ width: row.percent + '%', background: row.color }">
                      <view class="ami-shimmer"></view>
                    </view>
                  </view>
                </view>
              </view>
              <view class="ami-right">
                <text class="ami-amount">¥{{ formatMoney(row.amount) }}</text>
                <text class="ami-sub" :style="{ color: row.color }">{{ row.percent }}%</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 4. 最近记录 -->
        <view class="history-section animate-slide-up" style="animation-delay: 0.4s" @click.stop="selectedBar = null">
          <view class="history-head">
            <text class="history-title">最近变动明细</text>
            <text class="history-all" @click="toLedgerAll">全部流水 ›</text>
          </view>
          
          <view v-if="historyRows.length > 0" class="history-list-card">
            <view v-for="h in historyRows" :key="h.id" class="history-item">
              <view class="h-left">
                <view class="h-icon" :class="h.type">
                  <AppIcon
                    :value="h.categoryIcon || 'mc:receive-money'"
                    :size="20"
                    :color="h.type === 'income' ? incomeColor : expenseColor"
                  />
                </view>
                <view class="h-info">
                  <text class="h-name">{{ h.title }}</text>
                  <text class="h-meta">{{ h.timeLabel }}</text>
                </view>
              </view>
              <text class="h-amount" :class="{ positive: h.type === 'income' }">
                {{ h.type === 'expense' ? '-' : '+' }}{{ formatMoney(h.amount) }}
              </text>
            </view>
          </view>

          <view v-else-if="!isLoading" class="history-empty-card animate-inner-pop">
            <view class="he-decoration">
              <view class="he-circle"></view>
              <view class="he-emoji"><AppIcon name="leaf" :size="26" /></view>
            </view>
            <view class="he-text-box">
              <text class="he-main">暂无变动明细</text>
              <text class="he-sub">记录第一笔收支后，这里会展示最近流水</text>
            </view>
          </view>
        </view>

        <view class="spacer"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAppTheme } from '@/common/themes/useAppTheme.js'

const { themeClass, primaryColor, softColor, expenseColor, incomeColor, theme } = useAppTheme()
const themeStyles = computed(() => ({
  backgroundColor: softColor.value
}))
import { onLoad } from "@dcloudio/uni-app";
import IosNav from '../../components/nav/ios-nav.vue';
import AppIcon from '../../components/common/AppIcon.vue';
import { roomApi } from '../../common/api';
import { formatSmartTime, formatMoney } from '../../pages/js/utils.js';
import { coalesce } from '@/common/utils/coalesce.js';
import { goBackSafe } from '@/common/utils/nav.js'

const isLoading = ref(true);
const overView = ref(null);
const roomId = ref(null);
const accountId=ref(null);
const selectedBar = ref(null);
const rangeOptions = ['本周', '本月'];
const selectedRangeIndex = ref(0);

/**
 * 顶部维度名称。
 * 这里不用 computed：小程序端对「computed 里做数组下标取值」的绑定不稳定，
 * 直接用 ref 跟着 tab 切换手动维护，渲染最稳。
 */
const rangeLabel = ref(rangeOptions[0]);

onLoad((e) => { 
  roomId.value = e.roomId; 
  accountId.value = e.accountId;
  // 从「我的 · 本月支出」跳进来时直接落在本月（rangeOptions 下标：week=0 / month=1）
  const rangeIndex = { week: 0, month: 1 }[e.range];
  if (rangeIndex !== undefined) {
    selectedRangeIndex.value = rangeIndex;
    rangeLabel.value = rangeOptions[rangeIndex];
  }
});
onMounted(() => { getAllList(); });

const getAllList = async () => {
  isLoading.value = true;
  try {
    const res = await roomApi.getDashBoardList({"roomId": roomId.value,type:getType()});
    if (res && res.code == 0) {
      overView.value = res.data;
    }
  } finally {
    setTimeout(() => { isLoading.value = false; }, 800);
  }
}

const getType=()=>{
	if(selectedRangeIndex.value==0){
		return "week";
	}else if(selectedRangeIndex.value==1){
		return "month";
	}else{
		return "";
	}
}

const onRangeTabChange = (i) => {
  if (selectedRangeIndex.value === i) return;
  selectedRangeIndex.value = i;
  rangeLabel.value = rangeOptions[i] || rangeLabel.value;
  selectedBar.value = null;
  getAllList();
};

const currentViewCode = computed(() => ['week', 'month'][selectedRangeIndex.value]);

const getSegmentHeight = (inc, exp, type) => {
  const i = Math.abs(inc || 0);
  const e = Math.abs(exp || 0);
  const sum = i + e;
  if (sum === 0) return '0%';
  return type === 'inc' ? `${(i / sum) * 100}%` : `${(e / sum) * 100}%`;
};

const maxTotalValue = computed(() => {
  const data = trendData.value;
  if (!data || data.length === 0) return 1;
  const totals = data.map(v => Math.abs(v.income || 0) + Math.abs(v.expense || 0));
  const max = Math.max(...totals);
  return max > 0 ? max : 1;
});

const getMasterHeight = (inc, exp) => {
  const i = Math.abs(inc || 0);
  const e = Math.abs(exp || 0);
  const currentTotal = i + e;
  if (currentTotal === 0) return '0%';
  const val = (currentTotal / maxTotalValue.value) * 90;
  return val < 10 ? '10%' : `${Math.min(val, 100)}%`;
};

/** 趋势点全部来自云端聚合；缺失日期后端已经补 0，前端不再编造数据。 */
const trendData = computed(() => overView.value?.trend?.points || []);

const hasTrendData = computed(() => {
  const data = trendData.value;
  if (!data || data.length === 0) return false;
  return data.some(
    (v) => Math.abs(Number(v.income) || 0) > 0 || Math.abs(Number(v.expense) || 0) > 0
  );
});

const chartEmptyBarHeights = computed(() => {
  if (selectedRangeIndex.value === 1) {
    return ['32rpx', '48rpx', '40rpx', '56rpx'];
  }
  return ['28rpx', '44rpx', '36rpx', '52rpx', '40rpx', '48rpx', '32rpx'];
});

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 横轴标签必须和趋势点一一对应。
 * 短区间每天标一个；长区间只标首 / 中 / 尾几个锚点，避免 31 天挤成一团。
 */
const currentChartLabels = computed(() => {
  const points = trendData.value;
  if (!points.length) return [];
  if (points.length <= 7) {
    return points.map((point) => WEEKDAY_LABELS[new Date(`${point.date}T00:00:00Z`).getUTCDay()]);
  }
  const last = points.length - 1;
  const anchors = [0, Math.floor(last / 3), Math.floor((last * 2) / 3), last];
  return anchors.map((index) => `${Number(points[index].date.slice(8, 10))}号`);
});

const periodIncome = computed(() => Number(coalesce(overView.value?.asset?.income_total, 0)));
const periodExpense = computed(() => Number(coalesce(overView.value?.asset?.expense_total, 0)));
const periodBalance = computed(() => periodIncome.value - periodExpense.value);

/**
 * 账户配色按顺序取用，保证同一账户每次进来颜色稳定。
 * 首色跟着主题主色走，否则换肤后资产矩阵还是旧主题的黛青。
 */
const ACCOUNT_COLORS = computed(() => [
  primaryColor.value,
  '#8C6A3F',
  '#3E7C8C',
  '#B0603F',
  '#4C7A5A',
  '#7A6A9B'
]);

/** 资产分布矩阵：占比优先用后端给的值，缺失时再按资产绝对额现算。 */
const assetRows = computed(() => {
  const list = overView.value?.asset?.categories || [];
  const total = list.reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0);
  return list.map((item, index) => {
    const amount = Number(item.amount) || 0;
    return {
      ...item,
      name: item.name || item.label || '未命名账户',
      amount,
      color: ACCOUNT_COLORS.value[index % ACCOUNT_COLORS.value.length],
      percent: typeof item.percent === 'number'
        ? item.percent
        : (total ? Math.round((Math.abs(amount) / total) * 100) : 0)
    };
  });
});

/** 最近变动明细：把后端字段搬成模板好用的形状。 */
const historyRows = computed(() =>
  (overView.value?.recent?.ledgers || []).map((item) => ({
    ...item,
    title: item.note || item.categoryName || '未分类',
    timeLabel: `${formatSmartTime(item.occurredAt)} · ${item.categoryName || '未分类'}`
  }))
);

const goBack = () => goBackSafe();
/**
 * 「全部流水」就是这个账本的全部，不能带 accountId：
 * 一来后端会按账户过滤，二来这一页多数情况下根本没传 accountId，
 * 拼出来就成了 accountId=undefined 这个字符串，直接过滤成空。
 */
const toLedgerAll = () => uni.navigateTo({
  url: `/pages/ledger-all/ledger-all?roomId=${roomId.value || ''}`
});
</script>

<style scoped>
.details-container {
  background-color: var(--primary-soft, #E9F0F2);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  transition: background-color 0.35s ease;
}

/* 增强背景 */
.mesh-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.blob-1 { top: -10%; left: -10%; width: 300px; height: 300px; background: var(--primary-color, #2F5D6B); }
.blob-3 { top: 30%; right: 20%; width: 200px; height: 200px; background: var(--primary-color, #2F5D6B); opacity: 0.06; }
.noise-overlay { position: absolute; inset: 0; opacity: 0.02; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }

.period-dock { padding: 4px 0 16px; }
.period-capsule {
  position: relative;
  display: flex;
  border-radius: var(--radius-pill, 999px);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line-hairline, #E8EEEF);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
  overflow: hidden;
}

.period-item { 
  padding: 10px 0;
  flex: 1; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  z-index: 2; 
  transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s;
}
.period-txt { 
  font-size: 13px; 
  font-weight: 600; 
  color: var(--text-muted, #94A3B8); 
  transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s;
}
.active .period-txt { 
  color: var(--primary-color, #2F5D6B);
  transform: scale(1.05);
}
.period-slider { 
  top: 4px; 
  left: 0; 
  position: absolute; 
  height: calc(100% - 8px); 
  background: #FFFFFF; 
  border-radius: var(--radius-pill, 999px); 
  z-index: 1; 
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.06); 
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); 
  overflow: hidden;
}
.slider-inner-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%);
  opacity: 0.8;
}

.details-scroll { flex: 1; height: 0; z-index: 1; }
.scroll-content { padding: 0 24px 24px; }

.hero-section { padding: 8px 0 24px; }
.hero-main-card {
  background: rgba(255,255,255,0.75);
  /* 不要用胶囊圆角：里面塞了标题 + 金额 + 三列统计，999px 会把统计行挤得贴边 */
  border-radius: var(--radius-lg, 20px);
  padding: 22px 18px 16px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 25px 60px var(--primary-glow, rgba(47, 93, 107, 0.1));
  text-align: center;
  transition: box-shadow 0.35s ease;
}
.hero-label { font-size: 11px; font-weight: 600; color: var(--text-muted, #94A3B8); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; display: block; }
.hero-sublabel { font-size: 11px; font-weight: 600; color: var(--text-faint, #CBD5E1); display: block; margin-bottom: 8px; }
.hero-amount { display: flex; align-items: baseline; justify-content: center; margin-bottom: 15px; }
/* ¥ 和金额同号：之前 24px vs 52px，视觉上像两个层级 */
.amount-symbol { font-size: 52px; font-weight: 600; color: var(--primary-color, #2F5D6B); margin-right: 6px; }
.amount-val { font-size: 52px; font-weight: 600; color: var(--text-ink, #1E293B); letter-spacing: 0; }

.hero-stats-row {
  display: flex;
  background: var(--primary-soft, #E9F0F2);
  border-radius: var(--radius-md, 14px);
  padding: 14px 8px;
  border: 1px solid var(--primary-soft, #E9F0F2);
  transition: background 0.35s ease, border-color 0.35s ease;
}
.stat-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
.stat-divider { width: 1px; height: 32px; background: var(--line-hairline, #E2E8F0); margin: 0 10px; }
/* 三列标签强制同号同字重，避免中文在等宽/回退字体下看着大小不一 */
.stat-label { font-size: 10px; line-height: 1.2; font-weight: 600; color: var(--text-muted, #94A3B8); white-space: nowrap; }
.stat-val { font-size: 15px; font-weight: 600; }
.income { color: var(--color-income, #3E8E6E); }
.expense { color: var(--color-expense, #C4554D); }

.badge-txt { font-size: 15px; font-weight: 600; }
.up .badge-txt { color: var(--color-expense, #C4554D); }
.down .badge-txt { color: var(--color-income, #3E8E6E); }

/* 图表容器 */
.content-card {
  background: #fff;
  border-radius: var(--radius-lg, 16px);
  padding: 28px;
  border: 1px solid var(--primary-soft, #E9F0F2);
  box-shadow: 0 10px 30px var(--primary-glow, rgba(47, 93, 107, 0.05));
  margin-bottom: 32px;
  transition: border-color 0.35s ease, box-shadow 0.35s ease;
}
.card-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.card-header { display: flex; align-items: center; gap: 10px; }
.header-indicator { width: 4px; height: 18px; border-radius: var(--radius-sm, 8px); }
.header-indicator.purple { background: var(--primary-color, #2F5D6B); transition: background 0.35s ease; }
.header-indicator.blue { background: var(--secondary-color, #416F7B); transition: background 0.35s ease; }
.header-title { font-size: 15px; font-weight: 600; color: var(--text-ink, #1E293B); }

.chart-legend { display: flex; gap: 12px; }
.legend-item { display: flex; align-items: center; gap: 6px; }
.l-dot { width: 8px; height: 8px; border-radius: 50%; }
.l-dot.inc { background: var(--color-income, #3E8E6E); }
.l-dot.exp { background: var(--color-expense, #C4554D); }
/* 图例文字统一字阶：中文在 600 字重下笔画会挤出字面，看起来大小不一 */
.legend-item text {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0;
  color: var(--text-muted, #94A3B8);
}

.chart-container { height: 120px; display: flex; flex-direction: column; }

.chart-skeleton {
  height: 120px;
  display: flex;
  flex-direction: column;
  padding: 0 4px;
}
.chart-sk-bars {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}
.chart-sk-bar {
  flex: 1;
  height: 55%;
  border-radius: var(--radius-sm, 8px) 8px 0 0;
  background: #f1f5f9;
}
.chart-sk-bar:nth-child(odd) { height: 40%; }
.chart-sk-bar:nth-child(3) { height: 70%; }
.chart-sk-labels {
  height: 12px;
  margin-top: 16px;
  border-radius: var(--radius-sm, 8px);
  background: #f1f5f9;
}

.chart-empty-state {
  min-height: 280rpx;
  padding: 32rpx 24rpx 28rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #fff 0%, var(--primary-soft, #e9f0f2) 100%);
  border-radius: 28rpx;
  border: 1.5px dashed var(--primary-soft, #e2e8f0);
  transition: background 0.35s ease, border-color 0.35s ease;
}
.ce-visual {
  width: 100%;
  max-width: 520rpx;
  margin-bottom: 28rpx;
}
.ce-bars-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12rpx;
  height: 120rpx;
  padding: 0 8rpx;
}
.ce-bar-wrap {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: var(--primary-soft, #e9f0f2);
  border-radius: 12rpx 12rpx 0 0;
  opacity: 0.65;
  transition: background 0.35s ease;
}
.ce-bar {
  width: 72%;
  border-radius: 10rpx 10rpx 0 0;
  background: linear-gradient(
    180deg,
    rgba(203, 213, 225, 0.35) 0%,
    rgba(148, 163, 184, 0.2) 100%
  );
}
.ce-axis {
  height: 2rpx;
  margin-top: 16rpx;
  background: linear-gradient(
    90deg,
    transparent,
    var(--primary-color, #2f5d6b) 20%,
    var(--primary-color, #2f5d6b) 80%,
    transparent
  );
  opacity: 0.2;
}
.ce-labels-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 8rpx 0;
  margin-top: 4rpx;
}
.ce-day-label {
  flex: 1;
  text-align: center;
  font-size: 18rpx;
  font-weight: 600;
  color: var(--text-faint, #CBD5E1);
}
.ce-text-box {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-bottom: 24rpx;
}
.ce-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-sub, #475569);
  letter-spacing: 0;
}
.ce-sub {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-muted, #94A3B8);
  line-height: 1.5;
  max-width: 440rpx;
}
.ce-legend-hint {
  display: flex;
  gap: 24rpx;
  padding: 12rpx 24rpx;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 100rpx;
  border: 1px solid #f1f5f9;
}
.chart-bars { flex: 1; display: flex; align-items: flex-end; justify-content: space-between; padding: 0 4px; gap: 8px; position: relative; }
.bar-wrap {
  flex: 1; position: relative; height: 100%;
  display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
  background-color: var(--primary-soft, #E9F0F2);
  border-radius: var(--radius-sm, 8px) 8px 0 0;
  transition: background-color 0.35s ease;
}

/* 维度自适应柱体 */
.view-week .bar-stack-fill { width: 95%; border-radius: var(--radius-sm, 8px) 8px 0 0; }
.view-month { gap: 3px; }
.view-month .bar-stack-fill { width: 100%; border-radius: var(--radius-sm, 8px); }

.bar-stack-fill { 
  background: #F1F5F9; 
  position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); 
  overflow: hidden; display: flex; flex-direction: column-reverse; z-index: 2; 
  transition: height 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275), width 0.4s, border-radius 0.4s;
}
.bar-stack-fill.active { transform: translateX(-50%) scaleX(1.3); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }

.segment { width: 100%; transition: height 1s cubic-bezier(0.32, 0.72, 0, 1); }
.segment.income { background: var(--color-income, #3E8E6E); }
.segment.expense { background: var(--color-expense, #C4554D); }

/* 气泡美化 */
.bar-val-hint { 
  position: absolute; top: -50px; left: 50%; transform: translateX(-50%); 
  background: var(--primary-color, #2F5D6B);
  padding: 8px 12px; border-radius: var(--radius-md, 12px); 
  z-index: 100; box-shadow: 0 8px 24px var(--primary-glow, rgba(47, 93, 107, 0.35));
  white-space: nowrap;
  transition: background 0.35s ease, box-shadow 0.35s ease;
}
.bar-val-hint::after {
  content: '';
  position: absolute; bottom: -5px; left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px; height: 10px;
  background: var(--primary-color, #2F5D6B);
}
.hint-line { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
.hint-line:last-child { margin-bottom: 0; }
.h-l { color: rgba(255,255,255,0.4); font-size: 9px; font-weight: 600; }
.h-v { color: #fff; font-size: 11px; font-weight: 600; letter-spacing: 0.2px; }

.chart-labels { display: flex; justify-content: space-between; padding: 16px 4px 0; border-top: 1px solid var(--primary-soft, #E9F0F2); }
.chart-label { font-size: 9px; font-weight: 600; color: var(--text-faint, #CBD5E1); text-align: center; }

/* 资产列表 */
.section-group { margin-bottom: 40px; }
.group-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; padding-left: 8px; }
.group-title { font-size: 18px; font-weight: 600; color: var(--text-ink, #1E293B); }

.asset-modern-stack { display: flex; flex-direction: column; gap: 16px; }
.asset-modern-item { 
  background: #fff; border-radius: var(--radius-lg, 16px); padding: 10px 20px; 
  display: flex; justify-content: space-between; align-items: center;
  border: 1px solid var(--primary-soft, #E9F0F2);
  box-shadow: 0 8px 24px var(--primary-glow, rgba(47, 93, 107, 0.04));
  transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s;
}
.asset-modern-item:active { transform: scale(0.98); background: var(--primary-soft, #E9F0F2); }

.ami-left { display: flex; align-items: center; gap: 20px; flex: 1; }
.ami-icon-box { width: 40px; height: 40px; border-radius: var(--radius-md, 12px); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.ami-info { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.ami-title-row { display: flex; justify-content: space-between; align-items: center; }
.ami-name { font-size: 15px; font-weight: 600; color: var(--text-ink, #334155); }
.ami-progress-track { height: 7.5px; background: var(--primary-soft, #E9F0F2); border-radius: var(--radius-pill, 999px); overflow: hidden; transition: background 0.35s ease; }
.ami-progress-fill { height: 100%; border-radius: var(--radius-pill, 999px); position: relative; transition: width 1.2s cubic-bezier(0.32, 0.72, 0, 1); }
.ami-shimmer { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); animation: shimmer 2s infinite; }

.ami-right { text-align: right; }
.ami-amount { font-size: 17px; font-weight: 600; color: var(--text-ink, #1E293B); display: block; }
.ami-sub { font-size: 12px; font-weight: 600; color: var(--text-faint, #CBD5E1); letter-spacing: 1px; margin-top: 2px; margin-left: 3px;}

/* 历史列表 */
.history-section { margin-top: 20px; }
.history-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px; }
.history-title { font-size: 16px; font-weight: 600; color: var(--text-ink, #1E293B); }
.history-all { font-size: 12px; font-weight: 600; color: var(--primary-color, #2F5D6B); }
.history-list-card {
  background: #fff;
  border-radius: var(--radius-lg, 16px);
  padding: 12px;
  border: 1px solid var(--primary-soft, #E9F0F2);
  box-shadow: 0 8px 24px var(--primary-glow, rgba(47, 93, 107, 0.04));
  transition: border-color 0.35s ease, box-shadow 0.35s ease;
}
.history-item { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--primary-soft, #E9F0F2); }
.history-item:last-child { border-bottom: none; }

.history-empty-card {
  background: #fff;
  border-radius: var(--radius-lg, 16px);
  padding: 48px 32px;
  border: 1.5px dashed var(--primary-soft, #E9F0F2);
  box-shadow: 0 8px 24px var(--primary-glow, rgba(47, 93, 107, 0.04));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: border-color 0.35s ease, box-shadow 0.35s ease;
}
.he-decoration {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.he-circle {
  position: absolute;
  inset: 0;
  background: var(--primary-soft, #E9F0F2);
  border-radius: 32rpx;
  transform: rotate(12deg);
  transition: background 0.35s ease;
}
.he-emoji {
  font-size: 48rpx;
  position: relative;
  z-index: 1;
  opacity: 0.85;
  animation: floatSmall 3s infinite ease-in-out;
}
.he-text-box { display: flex; flex-direction: column; gap: 8rpx; align-items: center; }
.he-main { font-size: 28rpx; font-weight: 600; color: var(--text-sub, #64748B); }
.he-sub {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-muted, #94A3B8);
  line-height: 1.5;
  max-width: 420rpx;
}

.animate-inner-pop { animation: innerPop 0.5s cubic-bezier(0.32, 0.72, 0, 1) both; }
@keyframes innerPop {
  from { opacity: 0; transform: translateY(20rpx) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes floatSmall {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-6rpx) rotate(-4deg); }
}

.h-left { display: flex; align-items: center; gap: 14px; }
.h-icon { width: 40px; height: 40px; border-radius: var(--radius-md, 12px); display: flex; align-items: center; justify-content: center; font-weight: 600; }
.h-icon.income { background: var(--color-income-soft, #E6F0EB); color: var(--color-income, #3E8E6E); }
.h-icon.expense { background: var(--color-expense-soft, #F6E7E5); color: var(--color-expense, #C4554D); }
.h-info { display: flex; flex-direction: column; }
.h-name { font-size: 14px; font-weight: 600; color: var(--text-ink, #334155); }
.h-meta { font-size: 10px; font-weight: 600; color: var(--text-faint, #CBD5E1); }
.h-amount { font-size: 15px; font-weight: 600; color: var(--text-ink, #1E293B); }
.positive { color: var(--color-income, #3E8E6E); }

.animate-fade-in { animation: fadeIn 0.6s ease-out; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.animate-tooltip-in { animation: tooltipIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
@keyframes tooltipIn { from { opacity: 0; transform: translateX(-50%) scale(0.8) translateY(10px); } to { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); } }

.animate-spring { animation: springIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
@keyframes springIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
.animate-scale-in { animation: scaleIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
.animate-slide-up { animation: slideUp 0.7s cubic-bezier(0.32, 0.72, 0, 1) both; }
@keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
.animate-slide-in { animation: slideIn 0.7s cubic-bezier(0.32, 0.72, 0, 1) both; }
@keyframes slideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }

.shimmer { position: relative; overflow: hidden; background: #F1F5F9 !important; }
.shimmer::after { position: absolute; top: 0; right: 0; bottom: 0; left: 0; transform: translateX(-100%); background-image: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent); animation: shimmerAnim 1.8s infinite; content: ''; }
@keyframes shimmerAnim { 100% { transform: translateX(100%); } }

.skeleton-mode { pointer-events: none; }
</style>
