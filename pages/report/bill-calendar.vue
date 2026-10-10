<template>
  <view :class="themeClass" class="cal-page">
    <!-- 顶部：账本名 + 月份导航 -->
    <view class="cal-head" :style="{ paddingTop: navMetrics.statusBarHeight + 'px' }">
      <view class="head-top" :style="{ height: navMetrics.navBarHeight + 'px' }">
        <view class="back-btn" @click="goBack">
          <view class="back-chevron"></view>
        </view>
        <text class="head-title">{{ roomName || '账单日历' }}</text>
        <view class="head-top-spacer"></view>
      </view>

      <view class="month-nav">
        <view class="nav-arrow" @click="shiftMonth(-1)">
          <view class="chevron chevron-left"></view>
        </view>
        <picker mode="date" fields="month" :value="pickerMonth" @change="onMonthPicked">
          <view class="month-label">
            <text class="month-text">{{ year }} 年 {{ month }} 月</text>
            <view class="caret"></view>
          </view>
        </picker>
        <view class="nav-arrow" @click="shiftMonth(1)">
          <view class="chevron chevron-right"></view>
        </view>
        <view class="head-today" @click="goToday">
          <text class="today-txt">今天</text>
        </view>
      </view>

      <!-- 视图切换：结余 / 收入 / 支出 -->
      <view class="mode-switch">
        <view
          v-for="mode in modes"
          :key="mode.key"
          class="mode-item"
          :class="{ on: viewMode === mode.key }"
          @click="viewMode = mode.key"
        >
          <text class="mode-txt">{{ mode.label }}</text>
        </view>
      </view>
    </view>

    <!-- 月汇总 -->
    <view class="month-summary">
      <view class="ms-col">
        <text class="ms-label">本月收入</text>
        <text class="ms-value income">{{ formatMoneyShort(monthIncome) }}</text>
      </view>
      <view class="ms-divider"></view>
      <view class="ms-col">
        <text class="ms-label">本月支出</text>
        <text class="ms-value expense">{{ formatMoneyShort(monthExpense) }}</text>
      </view>
      <view class="ms-divider"></view>
      <view class="ms-col">
        <text class="ms-label">本月结余</text>
        <text class="ms-value">{{ formatMoneyShort(monthBalance) }}</text>
      </view>
    </view>

    <!-- 日历主体 -->
    <scroll-view scroll-y class="cal-scroll" :show-scrollbar="false">
      <view class="cal-card">
        <!-- 星期表头：周一为首日 -->
        <view class="week-head">
          <text v-for="w in weekLabels" :key="w" class="week-cell">{{ w }}</text>
        </view>

        <!-- 日期网格 -->
        <view class="day-grid">
          <view
            v-for="cell in calendarCells"
            :key="cell.key"
            class="day-cell"
            :class="{
              blank: !cell.day,
              today: cell.isToday,
              selected: cell.day && cell.day === selectedDay,
              'has-data': cell.hasData
            }"
            @click="cell.day && selectDay(cell.day)"
          >
            <template v-if="cell.day">
              <text class="day-num">{{ cell.day }}</text>
              <text class="day-val" :class="valueClass(cell.value)">{{ cell.valueText }}</text>
            </template>
          </view>
        </view>

        <!-- 无数据提示（区分「本月没记账」与「有记账但当天为 0」） -->
        <view v-if="!loading && monthCount === 0" class="empty-note">
          <text class="empty-txt">本月还没有记账</text>
          <text class="empty-sub">记一笔后，每天的收支会出现在这里</text>
        </view>
      </view>

      <!-- 选中日详情 -->
      <view class="day-detail">
        <view class="detail-head">
          <text class="detail-date">{{ selectedDateLabel }}</text>
          <text class="detail-sum">
            收 {{ formatMoneyShort(selectedIncome) }} · 支 {{ formatMoneyShort(selectedExpense) }} ·
            余 {{ formatMoneyShort(selectedIncome - selectedExpense) }}
          </text>
        </view>

        <view v-if="selectedEntries.length" class="entry-list">
          <view v-for="item in selectedEntries" :key="item.id" class="entry-row">
            <view class="entry-icon">
                      <AppIcon :value="item.categoryIcon" :size="20" />
            </view>
            <view class="entry-main">
              <text class="entry-name">{{ item.categoryName || '未分类' }}</text>
              <text v-if="item.note" class="entry-note">{{ item.note }}</text>
            </view>
            <text class="entry-amount" :class="item.type === 'income' ? 'income' : 'expense'">
              {{ item.type === 'income' ? '+' : '-' }}{{ formatMoneyShort(item.amount) }}
            </text>
          </view>
        </view>

        <view v-else class="detail-empty">
          <text class="detail-empty-txt">这一天没有记账</text>
        </view>
      </view>

      <view class="safe-bottom"></view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import AppIcon from '../../components/common/AppIcon.vue'
import { roomApi } from '../../common/api'
import { STORAGE_KEYS } from '../../common/config'
import { formatMoneyShort } from '../../pages/js/utils.js'
import { getNavMetrics } from '@/common/utils/navMetrics.js'
import { goBackSafe } from '@/common/utils/nav.js'

const { themeClass } = useAppTheme()
const navMetrics = getNavMetrics()

const modes = [
  { key: 'balance', label: '结余' },
  { key: 'income', label: '收入' },
  { key: 'expense', label: '支出' }
]

const weekLabels = ['一', '二', '三', '四', '五', '六', '日']

const roomId = ref('')
const roomName = ref('')
const viewMode = ref('balance')
const loading = ref(true)

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const selectedDay = ref(now.getDate())

/** date(YYYY-MM-DD) -> { income, expense, entries[] } */
const dayMap = ref({})
const monthIncome = ref(0)
const monthExpense = ref(0)
const monthCount = ref(0)

const pad = (n) => String(n).padStart(2, '0')
const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

const pickerMonth = computed(() => `${year.value}-${pad(month.value)}`)

const monthBalance = computed(() => monthIncome.value - monthExpense.value)

const selectedKey = computed(() => dateKey(year.value, month.value, selectedDay.value))
const selectedBucket = computed(() => dayMap.value[selectedKey.value] || { income: 0, expense: 0, entries: [] })
const selectedIncome = computed(() => selectedBucket.value.income)
const selectedExpense = computed(() => selectedBucket.value.expense)
const selectedEntries = computed(() => selectedBucket.value.entries || [])

const selectedDateLabel = computed(() => `${year.value} 年 ${month.value} 月 ${selectedDay.value} 日`)

/**
 * 生成日历格子。
 * 以周一为每周第一天，前置补空格，保证 7 列对齐。
 */
const calendarCells = computed(() => {
  const y = year.value
  const m = month.value
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7 // 周一=0
  const daysInMonth = new Date(y, m, 0).getDate()
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m

  const cells = []
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ key: `blank-${i}`, day: 0 })
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    const bucket = dayMap.value[dateKey(y, m, d)]
    const income = bucket ? bucket.income : null
    const expense = bucket ? bucket.expense : null
    const hasData = !!bucket && (bucket.entries || []).length > 0

    let value = 0
    if (hasData) {
      if (viewMode.value === 'income') value = income || 0
      else if (viewMode.value === 'expense') value = expense || 0
      else value = (income || 0) - (expense || 0)
    }

    cells.push({
      key: `${y}-${m}-${d}`,
      day: d,
      hasData,
      value,
      isToday: isCurrentMonth && today.getDate() === d,
      // 没有数据的日期显示占位符，避免和「当天确实是 0」混淆
      valueText: hasData ? formatDayValue(value) : '—'
    })
  }

  return cells
})

/**
 * 日历格子很窄（约 46px），不能直接复用两位小数的金额格式。
 * 格子内只给概览：过万用「万」，其余取整且不加千分位；精确值在下方当日明细里。
 */
const formatDayValue = (value) => {
  const num = Number(value) || 0
  if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(1)}万`
  return String(Math.round(num))
}

const valueClass = (value) => {
  if (viewMode.value === 'balance') return value < 0 ? 'expense' : value > 0 ? 'income' : 'neutral'
  return viewMode.value === 'income' ? 'income' : 'expense'
}

/** 拉取该月流水并按天分组 */
const loadMonth = async () => {
  if (!roomId.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await roomApi.getLedgerWeekList(
      { roomId: roomId.value, year: year.value, month: month.value },
      'month'
    )
    if (res.code !== 0) return

    const groups = (res.data && res.data.groups) || []
    const map = {}
    groups.forEach((group) => {
      map[group.date] = {
        income: group.income || 0,
        expense: group.expense || 0,
        entries: (group.list || []).map((item) => ({
          id: item.id,
          type: item.type,
          amount: item.amount,
          categoryName: item.categoryName,
          categoryIcon: item.categoryIcon,
          note: item.note
        }))
      }
    })
    dayMap.value = map

    const summary = (res.data && res.data.summary) || {}
    monthIncome.value = summary.totalIncome || 0
    monthExpense.value = summary.totalExpense || 0
    monthCount.value = summary.count || 0
  } catch (error) {
    console.error('[账单日历] 加载失败', error)
  } finally {
    loading.value = false
  }
}

/** 切换月份后把选中日收敛到合法范围 */
const applyMonth = (y, m, keepDay) => {
  year.value = y
  month.value = m
  const daysInMonth = new Date(y, m, 0).getDate()
  selectedDay.value = keepDay ? Math.min(selectedDay.value, daysInMonth) : 1
  loadMonth()
}

const shiftMonth = (delta) => {
  let y = year.value
  let m = month.value + delta
  if (m < 1) {
    m = 12
    y -= 1
  } else if (m > 12) {
    m = 1
    y += 1
  }
  applyMonth(y, m, true)
}

const onMonthPicked = (e) => {
  const [y, m] = String(e.detail.value).split('-').map(Number)
  if (y && m) applyMonth(y, m, false)
}

const selectDay = (day) => {
  selectedDay.value = day
}

const goToday = () => {
  const t = new Date()
  applyMonth(t.getFullYear(), t.getMonth() + 1, false)
  selectedDay.value = t.getDate()
}

const goBack = () => goBackSafe();

onLoad((options) => {
  roomId.value = (options && options.roomId) || ''

  if (!roomId.value) {
    try {
      const saved = uni.getStorageSync(STORAGE_KEYS.CURRENT_ROOM)
      roomId.value = (saved && saved.id) || ''
      roomName.value = (saved && saved.name) || ''
    } catch (error) {
      roomName.value = ''
    }
  } else {
    roomName.value = (options && decodeURIComponent(options.roomName || '')) || '账单日历'
  }

  loadMonth()
})
</script>

<style scoped>
.cal-page {
  min-height: 100vh;
  background: var(--bg-page, #F6F8F8);
  display: flex;
  flex-direction: column;
}

/* ---------- 顶部 ---------- */
.cal-head {
  background: var(--primary-color, #2F5D6B);
  padding: 0 16px 16px;
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
.head-today {
  margin-left: 8px;
  padding: 3px 10px;
  border-radius: var(--radius-md, 12px);
  background: rgba(255, 255, 255, 0.22);
}
.today-txt {
  font-size: 12px;
  color: #fff;
}

.month-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}
.nav-arrow {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-arrow:active {
  opacity: 0.6;
}
.chevron {
  width: 9px;
  height: 9px;
  border-top: 2px solid #fff;
  border-right: 2px solid #fff;
}
.chevron-left {
  transform: rotate(-135deg);
}
.chevron-right {
  transform: rotate(45deg);
}
.month-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.month-text {
  font-size: 17px;
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

.mode-switch {
  display: flex;
  gap: 6px;
  margin-top: 14px;
}
.mode-item {
  flex: 1;
  height: 30px;
  border-radius: var(--radius-lg, 16px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
}
.mode-item.on {
  background: #fff;
}
.mode-txt {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}
.mode-item.on .mode-txt {
  color: var(--primary-color, #2F5D6B);
  font-weight: 600;
}

/* ---------- 月汇总 ---------- */
.month-summary {
  display: flex;
  align-items: center;
  margin: 10px 16px 0;
  padding: 12px 0;
  background: #fff;
  border-radius: var(--radius-md, 12px);
}
.ms-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ms-label {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
}
.ms-value {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.ms-divider {
  width: 1px;
  height: 22px;
  background: #EEF1F5;
}

/* ---------- 日历 ---------- */
.cal-scroll {
  flex: 1;
  height: 0;
}
.cal-card {
  margin: 10px 16px 0;
  padding: 12px 10px 14px;
  background: #fff;
  border-radius: var(--radius-md, 12px);
}

.week-head {
  display: flex;
}
.week-cell {
  flex: 1;
  text-align: center;
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
  padding-bottom: 6px;
}

.day-grid {
  display: flex;
  flex-wrap: wrap;
}
.day-cell {
  width: 14.2857%;
  height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm, 8px);
}
.day-cell.blank {
  visibility: hidden;
}
.day-num {
  font-size: 13px;
  color: var(--text-ink, #334155);
  font-variant-numeric: tabular-nums;
}
.day-val {
  margin-top: 2px;
  font-size: 10px;
  color: var(--text-faint, #CBD5E1);
  font-variant-numeric: tabular-nums;
  max-width: 46px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.day-val.income {
  color: var(--color-income, #3E8E6E);
}
.day-val.expense {
  color: var(--color-expense, #C4554D);
}
.day-val.neutral {
  color: var(--text-muted, #94A3B8);
}

.day-cell.has-data {
  background: #F8FAFC;
}

/* 今天：内描边标记，与选中实心态区分开 */
.day-cell.today {
  box-shadow: inset 0 0 0 1.5px var(--primary-color, #2F5D6B);
}
.day-cell.today .day-num {
  font-weight: 600;
  color: var(--primary-color, #2F5D6B);
}
/* 选中时描边让位给实心底色，避免双层轮廓 */
.day-cell.today.selected {
  box-shadow: none;
}

/* 选中：整块主题色底 + 反白，不使用左侧竖线 */
.day-cell.selected {
  background: var(--primary-color, #2F5D6B);
}
.day-cell.selected .day-num,
.day-cell.selected .day-val {
  color: #fff;
}

.empty-note {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0 4px;
}
.empty-txt {
  font-size: 13px;
  color: var(--text-muted, #94A3B8);
}
.empty-sub {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-faint, #CBD5E1);
}

/* ---------- 选中日详情 ---------- */
.day-detail {
  margin: 10px 16px 0;
  background: #fff;
  border-radius: var(--radius-md, 12px);
  overflow: hidden;
}
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #F7F9FC;
}
.detail-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}
.detail-sum {
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
  font-variant-numeric: tabular-nums;
}

.entry-row {
  display: flex;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid #F7F9FC;
}
.entry-row:last-child {
  border-bottom: none;
}
.entry-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm, 8px);
  background: var(--primary-soft, #E9F0F2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.entry-emoji {
  font-size: 15px;
}
.entry-main {
  flex: 1;
  min-width: 0;
  margin-left: 10px;
  display: flex;
  flex-direction: column;
}
.entry-name {
  /* 和收支流水的 .cell-title 对齐：同一类“分类名”全站同字号同字重 */
  font-size: 15px;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
}
.entry-note {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted, #94A3B8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-amount {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex: none;
}
.entry-amount.income {
  color: var(--color-income, #3E8E6E);
}
.entry-amount.expense {
  color: var(--text-ink, #1E293B);
}

.detail-empty {
  padding: 18px 0;
  display: flex;
  justify-content: center;
}
.detail-empty-txt {
  font-size: 12px;
  color: var(--text-faint, #CBD5E1);
}

.safe-bottom {
  height: calc(30px + env(safe-area-inset-bottom));
}

@media (prefers-reduced-motion: reduce) {
  .nav-arrow:active {
    opacity: 1;
  }
}
</style>
