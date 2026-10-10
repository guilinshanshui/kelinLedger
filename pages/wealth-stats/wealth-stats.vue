<template>
  <view :class="themeClass" class="stats-page">
    <!-- 顶部：范围切换 -->
    <view class="stats-head" :style="{ paddingTop: navMetrics.statusBarHeight + 'px' }">
      <view class="head-top" :style="{ height: navMetrics.navBarHeight + 'px' }">
        <view class="back-btn" @click="goBack">
          <view class="back-chevron"></view>
        </view>
        <text class="head-title">统计分析</text>
        <view class="head-top-spacer"></view>
      </view>

      <!-- 四种查询范围 -->
      <view class="range-tabs">
        <view
          v-for="tab in rangeTabs"
          :key="tab.key"
          class="range-tab"
          :class="{ on: rangeType === tab.key }"
          @click="switchRange(tab.key)"
        >
          <text class="range-txt">{{ tab.label }}</text>
        </view>
      </view>

      <!-- 范围详情：按类型显示不同选择器 -->
      <view class="range-detail">
        <!-- 自然月 -->
        <picker
          v-if="rangeType === 'month'"
          mode="date"
          fields="month"
          :value="monthValue"
          @change="onMonthChange"
        >
          <view class="picker-line">
            <text class="picker-txt">{{ rangeLabel }}</text>
            <view class="caret"></view>
          </view>
        </picker>

        <!-- 自然年 -->
        <picker
          v-else-if="rangeType === 'year'"
          mode="date"
          fields="year"
          :value="yearValue"
          @change="onYearChange"
        >
          <view class="picker-line">
            <text class="picker-txt">{{ rangeLabel }}</text>
            <view class="caret"></view>
          </view>
        </picker>

        <!-- 全部 -->
        <view v-else-if="rangeType === 'all'" class="picker-line is-static">
          <text class="picker-txt">{{ rangeLabel }}</text>
        </view>

        <!-- 自定义：起止两个原生日期选择器 -->
        <view v-else class="custom-range">
          <picker mode="date" :value="customStart" @change="onStartChange">
            <view class="date-chip">
              <text class="date-chip-txt">{{ customStart || '开始日期' }}</text>
            </view>
          </picker>
          <text class="custom-sep">至</text>
          <picker mode="date" :value="customEnd" @change="onEndChange">
            <view class="date-chip">
              <text class="date-chip-txt">{{ customEnd || '结束日期' }}</text>
            </view>
          </picker>
        </view>
      </view>

      <text v-if="rangeType === 'custom'" class="range-hint">查询区间最大跨度为 12 个月</text>
    </view>

    <scroll-view scroll-y class="stats-scroll" :show-scrollbar="false">
      <!-- 未选择账本：给出下一步动作，不要停在骨架屏 -->
      <view v-if="noRoom" class="empty-state">
        <view class="empty-mark"></view>
        <text class="empty-title">还没有选择账本</text>
        <text class="empty-desc">先到「账本」创建或选择一个账本，再回来查看统计</text>
        <button class="empty-btn" @click="goBooks">
          <text class="empty-btn-txt">去选择账本</text>
        </button>
      </view>

      <!-- 加载态：保持版式的骨架，不用空白页 -->
      <view v-else-if="loading" class="skeleton-wrap">
        <view class="skeleton-card" style="height: 92px"></view>
        <view class="skeleton-card" style="height: 148px"></view>
        <view class="skeleton-card" style="height: 200px"></view>
      </view>

      <template v-else>
        <!-- 无数据：区分「区间内没有账单」 -->
        <view v-if="stats.isEmpty" class="empty-state">
          <view class="empty-mark"></view>
          <text class="empty-title">这个区间还没有账单</text>
          <text class="empty-desc">{{ rangeLabel }} 内没有记录，换个范围或先记一笔</text>
          <button class="empty-btn" @click="goAddEntry">
            <text class="empty-btn-txt">去记一笔</text>
          </button>
        </view>

        <template v-else>
          <!-- KPI：带单位、范围与环比 -->
          <view class="kpi-card">
            <view class="kpi-row">
              <view class="kpi-col">
                <text class="kpi-label">支出（元）</text>
                <text class="kpi-value expense">{{ formatMoneyShort(summary.expense) }}</text>
                <text v-if="compare" class="kpi-delta" :class="deltaClass(compare.expense, summary.expense, true)">
                  {{ deltaText(compare.expense, summary.expense, compare.label, true) }}
                </text>
              </view>
              <view class="kpi-divider"></view>
              <view class="kpi-col">
                <text class="kpi-label">收入（元）</text>
                <text class="kpi-value income">{{ formatMoneyShort(summary.income) }}</text>
                <text v-if="compare" class="kpi-delta" :class="deltaClass(compare.income, summary.income, false)">
                  {{ deltaText(compare.income, summary.income, compare.label, false) }}
                </text>
              </view>
              <view class="kpi-divider"></view>
              <view class="kpi-col">
                <text class="kpi-label">结余（元）</text>
                <text class="kpi-value">{{ formatMoneyShort(summary.balance) }}</text>
                <text class="kpi-delta muted">{{ summary.count }} 笔</text>
              </view>
            </view>

            <view class="kpi-foot">
              <text class="foot-txt">{{ rangeLabel }} · 共 {{ summary.count }} 笔</text>
              <text v-if="summary.avgExpense !== null" class="foot-txt">
                日均支出 {{ formatMoneyShort(summary.avgExpense) }} 元
              </text>
            </view>
          </view>

          <!-- 趋势：按天或按月的收支柱状图 -->
          <view class="chart-card">
            <view class="card-head">
              <text class="card-title">收支趋势</text>
              <view class="head-right">
                <!-- 自然月下可以按周看：按日精确定位到哪天，按周把 31 列压成 5-6 列 -->
                <view v-if="canSwitchWeek" class="granularity">
                  <view
                    class="granularity-item"
                    :class="{ on: !weekMode }"
                    @click="weekMode = false"
                  >
                    <text class="granularity-txt">按日</text>
                  </view>
                  <view
                    class="granularity-item"
                    :class="{ on: weekMode }"
                    @click="weekMode = true"
                  >
                    <text class="granularity-txt">按周</text>
                  </view>
                </view>
                <view class="legend">
                  <view class="legend-item">
                    <view class="legend-dot expense"></view>
                    <text class="legend-txt">支出</text>
                  </view>
                  <view class="legend-item">
                    <view class="legend-dot income"></view>
                    <text class="legend-txt">收入</text>
                  </view>
                </view>
              </view>
            </view>

            <view v-if="chartTrend.length" class="trend-chart">
              <view class="trend-bars">
                <!-- 中线参考线 -->
                <view class="trend-grid half"></view>
                <view v-for="(point, index) in chartTrend" :key="point.raw" class="trend-col">
                  <view class="bar-pair">
                    <!-- 该时段没有任何账单：留空位，不用 0 柱冒充 -->
                    <template v-if="!point.empty">
                      <!--
                        固定两个槽位：支出在左、收入在右。缺数据的一侧占位但不画，
                        这样每根柱子的宽度全图一致，不会出现“只有支出那天柱子特别胖”。
                      -->
                      <view
                        class="bar expense"
                        :class="{ blank: !hasAmount(point.expense) }"
                        :style="{ height: barHeight(point.expense) }"
                      ></view>
                      <view
                        class="bar income"
                        :class="{ blank: !hasAmount(point.income) }"
                        :style="{ height: barHeight(point.income) }"
                      ></view>
                    </template>
                  </view>
                </view>
              </view>
              <!--
                绘图区与刻度分成两层：
                柱子只受绘图区高度约束，底边严格贴基线；
                日期放在下面独立一行，不会把柱子顶上去。
              -->
              <view class="trend-axis"></view>
              <view class="trend-axis-labels">
                <view
                  v-for="(point, index) in chartTrend"
                  :key="'tick-' + point.raw"
                  class="axis-cell"
                  :class="{ first: index === 0, last: index === trend.length - 1 }"
                >
                  <text v-if="showLabel(index)" class="axis-tick">{{ point.label }}</text>
                </view>
              </view>
              <text class="axis-unit">
                纵轴单位：元；横轴为{{ granularityLabel }}；空白表示该时段无账单
              </text>
            </view>

            <view v-else class="chart-empty">
              <text class="chart-empty-txt">区间内没有可绘制的数据</text>
            </view>

            <text class="chart-summary">{{ trendSummary }}</text>
          </view>

          <!-- 分类排行：横向条形 -->
          <view class="chart-card">
            <view class="card-head">
              <text class="card-title">支出分类排行</text>
              <text class="card-sub">占总支出的比例</text>
            </view>

            <view v-if="expenseCategories.length" class="rank-list">
              <view v-for="item in expenseCategories" :key="item.id" class="rank-row">
                <view class="rank-top">
                  <view class="rank-name-wrap">
                    <AppIcon :value="item.icon" :size="14" tone="muted" />
                    <text class="rank-name">{{ item.name }}</text>
                  </view>
                  <text class="rank-amount">{{ formatMoneyShort(item.amount) }}</text>
                </view>
                <view class="rank-track">
                  <view class="rank-fill" :style="{ width: item.percent + '%' }"></view>
                </view>
                <text class="rank-meta">{{ item.percent }}% · {{ item.count }} 笔</text>
              </view>
            </view>

            <view v-else class="chart-empty">
              <text class="chart-empty-txt">该区间没有支出记录</text>
            </view>
          </view>

          <!-- 收入构成（有收入时才显示） -->
          <view v-if="incomeCategories.length" class="chart-card">
            <view class="card-head">
              <text class="card-title">收入构成</text>
            </view>
            <view class="rank-list">
              <view v-for="item in incomeCategories" :key="item.id" class="rank-row">
                <view class="rank-top">
                  <view class="rank-name-wrap">
                    <AppIcon :value="item.icon" :size="14" tone="muted" />
                    <text class="rank-name">{{ item.name }}</text>
                  </view>
                  <text class="rank-amount income">{{ formatMoneyShort(item.amount) }}</text>
                </view>
                <view class="rank-track">
                  <view class="rank-fill income" :style="{ width: item.percent + '%' }"></view>
                </view>
                <text class="rank-meta">{{ item.percent }}% · {{ item.count }} 笔</text>
              </view>
            </view>
          </view>

          <!-- 成员对比（多人账本才显示） -->
          <view v-if="members.length > 1" class="chart-card">
            <view class="card-head">
              <text class="card-title">成员支出对比</text>
            </view>
            <view class="rank-list">
              <view v-for="item in members" :key="item.userId" class="rank-row">
                <view class="rank-top">
                  <text class="rank-name">{{ item.nickname }}</text>
                  <text class="rank-amount">{{ formatMoneyShort(item.expense) }}</text>
                </view>
                <view class="rank-track">
                  <view class="rank-fill" :style="{ width: memberPercent(item.expense) + '%' }"></view>
                </view>
              </view>
            </view>
          </view>

          <text class="data-note">
            数据来源：本账本全部流水（含手动记账、账单导入与周期账单）；金额单位统一为元。
          </text>
        </template>
      </template>

      <view class="safe-bottom"></view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { statsApi } from '../../common/api'
import { STORAGE_KEYS } from '../../common/config'
import { formatMoneyShort } from '../../pages/js/utils.js'
import AppIcon from '../../components/common/AppIcon.vue'
import { getNavMetrics } from '@/common/utils/navMetrics.js'
import { goBackSafe } from '@/common/utils/nav.js'

const { themeClass } = useAppTheme()
const navMetrics = getNavMetrics()

const rangeTabs = [
  { key: 'month', label: '自然月' },
  { key: 'year', label: '自然年' },
  { key: 'all', label: '全部' },
  { key: 'custom', label: '自定义' }
]

const roomId = ref('')
// 筛选状态持久化：返回页面时恢复上次的查询范围，不重置成默认值
const STATS_FILTER_KEY = 'roomie_stats_filter'
const loading = ref(true)
/** 没有选中账本时给出明确引导，避免停在骨架屏 */
const noRoom = ref(false)
const rangeType = ref('month')

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)

const pad = (n) => String(n).padStart(2, '0')
const monthValue = computed(() => `${selectedYear.value}-${pad(selectedMonth.value)}`)
const yearValue = computed(() => String(selectedYear.value))

/** 自定义区间默认给最近 30 天，避免用户面对两个空选择器 */
const customStart = ref('')
const customEnd = ref('')

const stats = ref({
  range: { label: '' },
  summary: { expense: 0, income: 0, balance: 0, count: 0, avgExpense: null },
  trend: [],
  expenseCategories: [],
  incomeCategories: [],
  members: [],
  compare: null,
  granularity: 'day',
  isEmpty: true
})

const summary = computed(() => stats.value.summary)
const trend = computed(() => stats.value.trend || [])
const expenseCategories = computed(() => stats.value.expenseCategories || [])
const incomeCategories = computed(() => stats.value.incomeCategories || [])
const members = computed(() => stats.value.members || [])
const compare = computed(() => stats.value.compare || null)

/** 范围文案由服务端返回，前端不自己拼，避免两边口径不一致 */
const rangeLabel = computed(() => stats.value.range.label || '')
/**
 * 自然月下允许在「按日 / 按周」之间切：
 * 按日能看到具体哪天花的钱；按周把 31 列压成 5-6 列，柱子能撑开。
 * 其它范围（自然年 / 全部 / 自定义）沿用服务端给的口径。
 */
const weekMode = ref(false)
const canSwitchWeek = computed(
  () => rangeType.value === 'month' && stats.value.granularity === 'day'
)
const showWeekly = computed(() => canSwitchWeek.value && weekMode.value)

const granularityLabel = computed(() => {
  if (showWeekly.value) return '自然周'
  return stats.value.granularity === 'month' ? '月份' : '日期'
})

/* ---------- 环比 ---------- */
const deltaClass = (prev, current, isExpense) => {
  if (!prev) return 'muted'
  const up = current > prev
  // 支出上涨是负面信号，收入上涨是正面信号
  return (isExpense ? up : !up) ? 'up-bad' : 'up-good'
}

const deltaText = (prev, current, label, isExpense) => {
  if (!prev) return `无${label}可比`
  const pct = Math.round(((current - prev) / prev) * 100)
  if (pct === 0) return `与${label}持平`
  // 用「上升 / 下降」而不是箭头符号，避免和矢量图标混用显得不统一
  const trendWord = pct > 0 ? '上升' : '下降'
  return `较${label}${trendWord} ${Math.abs(pct)}%`
}

/* ---------- 图表 ---------- */

/** '2026-10-05' → { month, day, weekday }（ weekday 周一=1 ... 周日=7） */
const parseBucketDay = (raw) => {
  const [y, m, d] = String(raw || '').split('-').map(Number)
  const date = new Date(y || 1970, (m || 1) - 1, d || 1)
  return { month: m, day: d, weekday: date.getDay() || 7 }
}

/**
 * 周聚合：以周一为一周起点，月初第一天也开一个新桶（否则第一周会跨到上个月）。
 * empty 标记要一并继承，否则“N 个时段无账单”的统计会失真。
 */
const weeklyTrend = computed(() => {
  const list = trend.value
  if (!list.length) return []
  const buckets = []
  let current = null
  list.forEach((point) => {
    const { month, day, weekday } = parseBucketDay(point.raw)
    if (!current || weekday === 1) {
      current = {
        raw: point.raw,
        month,
        startDay: day,
        endDay: day,
        income: 0,
        expense: 0,
        empty: true
      }
      buckets.push(current)
    }
    current.endDay = day
    current.expense += Number(point.expense) || 0
    current.income += Number(point.income) || 0
    if (!point.empty) current.empty = false
  })
  const round2 = (n) => Math.round(n * 100) / 100
  return buckets.map((b) => {
    const sameDay = b.startDay === b.endDay
    return {
      raw: b.raw,
      label: sameDay ? `${b.startDay}日` : `${b.startDay}-${b.endDay}日`,
      summaryLabel: `${b.month}月${b.startDay}${sameDay ? '' : `-${b.endDay}`}日`,
      income: round2(b.income),
      expense: round2(b.expense),
      empty: b.empty
    }
  })
})

/** 图表实际渲染的桶：按日就是服务端原始数据，按周是本地聚合的结果 */
const chartTrend = computed(() => (showWeekly.value ? weeklyTrend.value : trend.value))

const trendMax = computed(() => {
  // 只统计有账单的时段；空时段（null）不参与最大值计算
  const values = chartTrend.value
    .filter((p) => !p.empty)
    .flatMap((p) => [p.expense || 0, p.income || 0])
  const max = Math.max(...values, 0)
  return max > 0 ? max : 1
})

/** 柱高按当前图表的峰值归一化，最小 2px，避免极小金额完全看不见 */
const barHeight = (value) => {
  const v = Math.abs(Number(value) || 0)
  return `${Math.max(2, (v / trendMax.value) * 100)}%`
}

/**
 * 只有这一向真的有金额才画柱。
 * 细柱图里给 0 值留 2px 小疙瘩只会变成噪点：一天只花钱不赚钱时，
 * 收入那侧不该再冒一个绿色小方块。
 */
const hasAmount = (value) => Math.abs(Number(value) || 0) > 0

/** 标签抽稀：柱子多时每 5 个显示一个，避免文字互相压住 */
const showLabel = (index) => {
  const total = chartTrend.value.length
  const step = total > 12 ? 5 : total > 7 ? 2 : 1
  if (index % step === 0) return true
  // 末尾补一个刻度，但要和上一个拉开距离。
  // 31 天时最后一根柱是 10/31、上一个刻度是 10/30，硬补会两个日期叠在一起。
  if (index === total - 1) {
    const prevTick = Math.floor((total - 1) / step) * step
    return total - 1 - prevTick >= Math.ceil(step / 2)
  }
  return false
}

const memberMax = computed(() => {
  const max = Math.max(...members.value.map((m) => m.expense || 0), 0)
  return max > 0 ? max : 1
})
const memberPercent = (value) => Math.max(2, Math.round(((value || 0) / memberMax.value) * 100))

/** 文本摘要：让不看图的人也能拿到结论 */
const trendSummary = computed(() => {
  const points = chartTrend.value.filter((p) => !p.empty)
  if (!points.length) return ''
  const top = [...points].sort((a, b) => (b.expense || 0) - (a.expense || 0))[0]
  const s = summary.value
  const parts = [`${rangeLabel.value}支出 ${formatMoneyShort(s.expense)} 元`]
  if (top && top.expense > 0) {
    // 按周时用“10月5-11日”这种说法，按日时直接用日期
    const when = top.summaryLabel || top.raw
    parts.push(`最高为 ${when}（${formatMoneyShort(top.expense)} 元）`)
  }
  const gap = chartTrend.value.filter((p) => p.empty).length
  if (gap) parts.push(`其中 ${gap} 个时段无账单`)
  if (s.income > 0) parts.push(`结余 ${formatMoneyShort(s.balance)} 元`)
  return `${parts.join('，')}。`
})

/* ---------- 数据加载 ---------- */
const buildQuery = () => {
  const query = { roomId: roomId.value, rangeType: rangeType.value }
  if (rangeType.value === 'month') {
    query.year = selectedYear.value
    query.month = selectedMonth.value
  } else if (rangeType.value === 'year') {
    query.year = selectedYear.value
  } else if (rangeType.value === 'custom') {
    query.startDate = customStart.value
    query.endDate = customEnd.value
  }
  return query
}

const saveFilter = () => {
  try {
    uni.setStorageSync(STATS_FILTER_KEY, {
      rangeType: rangeType.value,
      year: selectedYear.value,
      month: selectedMonth.value,
      startDate: customStart.value,
      endDate: customEnd.value,
      weekMode: weekMode.value
    })
  } catch (error) {
    // 存储失败不影响主流程
  }
}

const loadStats = async () => {
  if (!roomId.value) {
    noRoom.value = true
    loading.value = false
    return
  }
  noRoom.value = false
  if (rangeType.value === 'custom' && (!customStart.value || !customEnd.value)) return

  loading.value = true
  try {
    const res = await statsApi.overview(buildQuery())
    saveFilter()
    if (res.code === 0 && res.data) {
      stats.value = res.data
    }
  } catch (error) {
    console.error('[统计] 加载失败', error)
  } finally {
    loading.value = false
  }
}

const switchRange = (key) => {
  if (rangeType.value === key) return
  rangeType.value = key

  // 自定义范围首次进入时补一个默认区间，避免空选择器
  if (key === 'custom' && (!customStart.value || !customEnd.value)) {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 29)
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    customStart.value = fmt(start)
    customEnd.value = fmt(end)
  }

  loadStats()
}

const onMonthChange = (e) => {
  const [y, m] = String(e.detail.value).split('-').map(Number)
  if (!y || !m) return
  selectedYear.value = y
  selectedMonth.value = m
  loadStats()
}

const onYearChange = (e) => {
  const y = Number(e.detail.value)
  if (!y) return
  selectedYear.value = y
  loadStats()
}

const onStartChange = (e) => {
  customStart.value = e.detail.value
  loadStats()
}

const onEndChange = (e) => {
  customEnd.value = e.detail.value
  loadStats()
}

const goAddEntry = () =>
  uni.navigateTo({ url: `/pages/add-entry/add-entry?roomId=${roomId.value}` })
const goBack = () => goBackSafe();
const goBooks = () => uni.switchTab({ url: '/pages/room-list/room-list' })

onLoad((options) => {
  roomId.value = (options && options.roomId) || ''
  try {
    const saved = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
    if (!roomId.value) roomId.value = (saved && saved.id) || ''
  } catch (error) {
  }

  // 自定义区间的默认值
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 29)
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  customStart.value = fmt(start)
  customEnd.value = fmt(end)

  // 恢复上次的筛选条件（同一账本内）
  try {
    const saved = uni.getStorageSync(STATS_FILTER_KEY)
    if (saved && saved.rangeType) {
      rangeType.value = saved.rangeType
      if (saved.year) selectedYear.value = saved.year
      if (saved.month) selectedMonth.value = saved.month
      if (saved.startDate) customStart.value = saved.startDate
      if (saved.endDate) customEnd.value = saved.endDate
      weekMode.value = saved.weekMode === true
    }
  } catch (error) {
    // 读取失败则用默认范围
  }

  loadStats()
})
</script>

<style scoped>
.stats-page {
  min-height: 100vh;
  background: var(--bg-page, #F6F8F8);
  display: flex;
  flex-direction: column;
}

/* ---------- 顶部 ---------- */
.stats-head {
  background: var(--primary-color, #2F5D6B);
  padding: 0 16px 14px;
}
.head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
}
.head-top-spacer {
  width: 30px;
  flex: none;
}
.back-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.back-chevron {
  width: 9px;
  height: 9px;
  border-left: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg);
}
.head-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.range-tabs {
  display: flex;
  gap: 6px;
  margin-top: 12px;
}
.range-tab {
  flex: 1;
  height: 30px;
  border-radius: var(--radius-lg, 16px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
}
.range-tab.on {
  background: #fff;
}
.range-txt {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}
.range-tab.on .range-txt {
  color: var(--primary-color, #2F5D6B);
  font-weight: 600;
}

.range-detail {
  margin-top: 12px;
}
.picker-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
}
.picker-line.is-static {
  justify-content: flex-start;
}
.picker-txt {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}
.caret {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid rgba(255, 255, 255, 0.9);
}

.custom-range {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.date-chip {
  padding: 6px 14px;
  border-radius: var(--radius-lg, 16px);
  background: rgba(255, 255, 255, 0.2);
}
.date-chip-txt {
  font-size: 13px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.custom-sep {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.range-hint {
  display: block;
  margin-top: 6px;
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
}

/* ---------- 滚动区 ---------- */
.stats-scroll {
  flex: 1;
  height: 0;
}

/* ---------- 骨架 ---------- */
.skeleton-wrap {
  padding: 12px 16px 0;
}
.skeleton-card {
  background: #fff;
  border-radius: var(--radius-md, 12px);
  margin-bottom: 12px;
  opacity: 0.6;
}

/* ---------- 空态 ---------- */
.empty-state {
  margin: 40px 16px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-mark {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg, 16px);
  background: var(--primary-soft, #E9F0F2);
  position: relative;
}
.empty-mark::before {
  content: '';
  position: absolute;
  left: 16px;
  top: 22px;
  width: 24px;
  height: 2px;
  background: var(--primary-color, #2F5D6B);
  box-shadow: 0 6px 0 var(--primary-color, #2F5D6B), 0 12px 0 rgba(47, 93, 107, 0.45);
}
.empty-title {
  margin-top: 14px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-ink, #334155);
}
.empty-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted, #94A3B8);
  text-align: center;
  line-height: 1.6;
  padding: 0 20px;
}
.empty-btn {
  margin-top: 18px;
  height: 38px;
  padding: 0 28px;
  border-radius: var(--radius-lg, 16px);
  background: var(--primary-color, #2F5D6B);
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-btn::after {
  border: none;
}
.empty-btn-txt {
  font-size: 14px;
  color: #fff;
}

/* ---------- KPI ---------- */
.kpi-card {
  margin: 12px 16px 0;
  padding: 14px 12px 10px;
  background: #fff;
  border-radius: var(--radius-md, 12px);
}
.kpi-row {
  display: flex;
  align-items: flex-start;
}
.kpi-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.kpi-label {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
}
.kpi-value {
  margin-top: 5px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  font-variant-numeric: tabular-nums;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-value.expense {
  color: var(--color-expense, #C4554D);
}
.kpi-value.income {
  color: var(--color-income, #3E8E6E);
}
.kpi-delta {
  margin-top: 4px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.kpi-delta.up-bad {
  color: var(--color-expense, #C4554D);
}
.kpi-delta.up-good {
  color: var(--color-income, #3E8E6E);
}
.kpi-delta.muted {
  color: var(--text-faint, #CBD5E1);
}
.kpi-divider {
  width: 1px;
  height: 34px;
  background: #EEF1F5;
  margin-top: 4px;
}
.kpi-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #F7F9FC;
}
.foot-txt {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
}

/* ---------- 图表卡 ---------- */
.chart-card {
  margin: 12px 16px 0;
  padding: 14px;
  background: #fff;
  border-radius: var(--radius-md, 12px);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card-title {
  flex: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}
.card-sub {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
}
.legend {
  display: flex;
  gap: 12px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-sm, 8px);
}
.legend-dot.expense {
  background: var(--color-expense, #C4554D);
}
.legend-dot.income {
  background: var(--color-income, #3E8E6E);
}
.legend-txt {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
}

/* 卡片右上角：粒度切换 + 图例，两者共处一行 */
.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.granularity {
  display: flex;
  flex: none;
  padding: 2px;
  border-radius: var(--radius-pill, 999px);
  background: var(--primary-soft, #E9F0F2);
}
.granularity-item {
  padding: 3px 9px;
  border-radius: var(--radius-pill, 999px);
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}
.granularity-txt {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #5D6E84);
}
.granularity-item.on {
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.granularity-item.on .granularity-txt {
  color: var(--primary-color, #2F5D6B);
}

/* 趋势柱 */
.trend-chart {
  margin-top: 14px;
}
/* 绘图区：所有柱子的底边都落在这 120px 的底部，和下面的基线严格对齐 */
.trend-bars {
  position: relative;
  display: flex;
  align-items: flex-end;
  height: 120px;
  gap: 2px;
}
/* 中线参考线：不参与布局，只给眼睛一个“最大值一半”的参照 */
.trend-grid {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--line-soft, #F1F5F5);
}
.trend-grid.half {
  top: 50%;
}
.trend-col {
  position: relative;
  /* 参考线是绝对定位元素，会盖在普通元素上面；这里抬一层让柱子画在参考线之上 */
  z-index: 1;
  flex: 1;
  min-width: 0;
  height: 100%;
}
.bar-pair {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 1px;
  width: 100%;
  height: 100%;
}
/*
 * 一个槽位固定占列宽的一半（减掉 1px 槽间距），再用 max-width 封顶：
 * 这样 31 天时两根刚好填满一列，12 个月时也不会胖成方块，
 * 而且“只有支出的一天”和“收支都有的一天”柱宽完全相同。
 */
.bar {
  flex: none;
  width: calc(50% - 0.5px);
  max-width: 12px;
  min-height: 2px;
  border-radius: 3px 3px 0 0;
}
/* 该方向没金额：槽位保留但不画，保证红在左、绿在右永远对得上 */
.bar.blank {
  visibility: hidden;
}
.bar.expense {
  background: var(--color-expense, #C4554D);
}
.bar.income {
  background: var(--color-income, #3E8E6E);
}
/* 支出 / 收入两种柱只允许颜色不同：宽高、圆角、最小高度全部共用 .bar */
/* 基线：紧贴绘图区底边，柱子和横线在同一条线上 */
.trend-axis {
  height: 1px;
  background: var(--line-hairline, #E8EEEF);
}

/* 刻度行：和上面的绘图区用同一套 flex 列，保证日期对准自己的柱子 */
.trend-axis-labels {
  display: flex;
  gap: 2px;
  margin-top: 6px;
}
.axis-cell {
  flex: 1;
  min-width: 0;
  text-align: center;
}
/* 首尾两个刻度向外溢出会顶出卡片，改成贴边对齐 */
.axis-cell.first {
  text-align: left;
}
.axis-cell.last {
  text-align: right;
}
.axis-tick {
  font-size: 9px;
  color: var(--text-faint, #66788D);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.axis-unit {
  display: block;
  margin-top: 6px;
  font-size: 10px;
  color: var(--text-faint, #CBD5E1);
}
.chart-summary {
  display: block;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #F7F9FC;
  font-size: 12px;
  color: var(--text-sub, #64748B);
  line-height: 1.6;
}
.chart-empty {
  padding: 24px 0;
  display: flex;
  justify-content: center;
}
.chart-empty-txt {
  font-size: 12px;
  color: var(--text-faint, #CBD5E1);
}

/* 排行 */
.rank-list {
  margin-top: 12px;
}
.rank-row {
  margin-bottom: 14px;
}
.rank-row:last-child {
  margin-bottom: 0;
}
.rank-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.rank-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.rank-name {
  font-size: 13px;
  color: var(--text-ink, #334155);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rank-amount {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.rank-amount.income {
  color: var(--color-income, #3E8E6E);
}
.rank-track {
  margin-top: 6px;
  height: 6px;
  border-radius: var(--radius-sm, 8px);
  background: #F1F5F9;
  overflow: hidden;
}
.rank-fill {
  height: 100%;
  border-radius: var(--radius-sm, 8px);
  background: var(--color-expense, #C4554D);
}
.rank-fill.income {
  background: var(--color-income, #3E8E6E);
}
.rank-meta {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  color: var(--text-muted, #94A3B8);
  font-variant-numeric: tabular-nums;
}

.data-note {
  display: block;
  margin: 14px 16px 0;
  font-size: 10px;
  color: var(--text-faint, #B6C2D1);
  line-height: 1.6;
}

.safe-bottom {
  height: calc(30px + env(safe-area-inset-bottom));
}

@media (prefers-reduced-motion: reduce) {
  .range-tab,
  .date-chip {
    transition: none;
  }
}
</style>
