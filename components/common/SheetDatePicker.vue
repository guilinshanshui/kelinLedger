<template>
  <view
    v-if="modelValue"
    class="sheet-mask"
    :class="[themeClass, { 'mask-fade-out': isClosing }]"
    :style="maskLayerStyle"
    @tap.stop="handleClose"
    @touchmove.stop.prevent
  >
    <view
      class="sheet-panel"
      :class="themeClass"
      :style="panelStyle"
      @tap.stop
    >
      <!--
        拖拽关闭的手势只绑在头部。
        之前绑在整个面板上，滚轮每滑动一帧都会走一次 onTouchMove
        并更新面板 transform，150 行年份的 picker-view 被反复重渲染，
        所以滑动发涩。头部手势区把它隔开。
      -->
      <view
        class="sheet-drag-zone"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view class="sheet-handle" :style="{ background: primaryColor }"></view>

        <view class="sheet-header">
          <view class="header-main">
            <text class="sheet-title">{{ title }}</text>
            <text class="sheet-subtitle">{{ subtitle }}</text>
          </view>
          <view class="sheet-close-btn" @tap.stop="handleClose">
            <AppIcon name="close" :size="16" />
          </view>
        </view>
      </view>

      <picker-view
        class="date-picker-view"
        :value="pickerValue"
        :indicator-style="indicatorStyle"
        @change="onPickerChange"
      >
        <picker-view-column>
          <view v-for="y in years" :key="y" class="pv-item">{{ y }}年</view>
        </picker-view-column>
        <picker-view-column>
          <view v-for="m in 12" :key="m" class="pv-item">{{ m }}月</view>
        </picker-view-column>
        <picker-view-column>
          <view v-for="d in daysInMonth" :key="d" class="pv-item">{{ d }}日</view>
        </picker-view-column>
      </picker-view>

      <view class="sheet-actions">
        <button class="confirm-btn" @click="handleConfirm">
          <text class="confirm-txt">确定</text>
        </button>
      </view>

      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup>
/**
 * SheetDatePicker —— iOS 风格的底部滚轮日期选择弹层。
 * 与 BottomPicker / CategoryPicker / GlobalDrawer 共用 sheetMotion 参数，
 * 统一从底部滑入、支持拖拽关闭，替代原生 mode="date" picker 的系统弹窗。
 */
import { ref, watch, computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { playSheetOpen, playSheetClose, sheetPanelTransition } from '@/common/utils/sheetMotion.js'

const { themeClass, primaryColor } = useAppTheme()

const props = defineProps({
  modelValue: Boolean,
  title: { type: String, default: '选择日期' },
  subtitle: { type: String, default: '' },
  /** 当前选中的日期字符串 yyyy-MM-dd */
  value: { type: String, default: '' },
  /** 最早可选日期 yyyy-MM-dd，为空不限制 */
  start: { type: String, default: '' },
  /** 最晚可选日期 yyyy-MM-dd，为空不限制 */
  end: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'change'])

const panelTransform = ref({ transform: 'translateY(100%)', transition: 'none' })
const panelStyle = computed(() => panelTransform.value)

const isClosing = ref(false)
const isSwiping = ref(false)
const dragY = ref(0)
let startY = 0

const YEARS = 150
const BASE_YEAR = 1970

const years = Array.from({ length: YEARS }, (_, i) => BASE_YEAR + i)

const today = new Date()
const parseDate = (str) => {
  if (!str) return null
  const m = String(str).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  return { y: +m[1], m: +m[2], d: +m[3] }
}

const clampDate = (y, m, d) => {
  let yy = y
  let mm = m
  let dd = d
  if (props.start) {
    const s = parseDate(props.start)
    if (s && (yy < s.y || (yy === s.y && mm < s.m) || (yy === s.y && mm === s.m && dd < s.d))) {
      yy = s.y; mm = s.m; dd = s.d
    }
  }
  if (props.end) {
    const e = parseDate(props.end)
    if (e && (yy > e.y || (yy === e.y && mm > e.m) || (yy === e.y && mm === e.m && dd > e.d))) {
      yy = e.y; mm = e.m; dd = e.d
    }
  }
  const dim = new Date(yy, mm, 0).getDate()
  if (dd > dim) dd = dim
  return { y: yy, m: mm, d: dd }
}

const pickerValue = ref([0, 0, 0])
const draftDate = ref('')

watch(() => props.modelValue, (val) => {
  if (!val) return
  isClosing.value = false
  dragY.value = 0
  const cur = parseDate(props.value) || { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() }
  const c = clampDate(cur.y, cur.m, cur.d)
  pickerValue.value = [c.y - BASE_YEAR, c.m - 1, c.d - 1]
  draftDate.value = `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`
  playSheetOpen(panelTransform)
})

const currentY = computed(() => BASE_YEAR + pickerValue.value[0])
const currentM = computed(() => pickerValue.value[1] + 1)
const daysInMonth = computed(() => new Date(currentY.value, currentM.value, 0).getDate())

const onPickerChange = (e) => {
  const [yi, mi, di] = e.detail.value
  const y = BASE_YEAR + yi
  const m = mi + 1
  const dim = new Date(y, m, 0).getDate()
  const d = Math.min(di + 1, dim)
  const c = clampDate(y, m, d)
  pickerValue.value = [c.y - BASE_YEAR, c.m - 1, c.d - 1]
  draftDate.value = `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`
}

/**
 * 指示条高度必须和 .pv-item 的 44px 对齐。
 *
 * 注意：不要自定义 mask-style。微信 picker-view 的蒙层几何是它自己算的，
 * 自己给渐变反而会把中间那一行也洗白（实测选中行变成 #A1A6AD，对比度只有 2.3:1）。
 * 用官方默认蒙层，中心行保持 --text-ink 全黑，只淡化远离中心的行。
 */
const indicatorStyle =
  'height: 44px; border-top: 1px solid rgba(15, 23, 42, 0.12); border-bottom: 1px solid rgba(15, 23, 42, 0.12);'

const maskOpacity = computed(() => {
  if (isClosing.value) return 0
  if (!isSwiping.value) return 0.4
  return Math.max(0.1, 0.4 - dragY.value / 1000)
})
const maskLayerStyle = computed(() => ({ backgroundColor: `rgba(15, 23, 42, ${maskOpacity.value})` }))

const onTouchStart = (e) => {
  startY = e.touches[0].clientY
  isSwiping.value = true
}
const onTouchMove = (e) => {
  const diff = e.touches[0].clientY - startY
  if (diff > 0) {
    dragY.value = diff
    panelTransform.value = { transform: `translateY(${diff}px)`, transition: 'none' }
  }
}
const onTouchEnd = () => {
  isSwiping.value = false
  if (dragY.value > 120) handleClose()
  else {
    dragY.value = 0
    panelTransform.value = { transform: 'translateY(0)', transition: sheetPanelTransition() }
  }
}

const handleConfirm = () => {
  emit('change', draftDate.value)
  handleClose()
}

const handleClose = () => {
  if (isClosing.value) return
  isClosing.value = true
  const ms = playSheetClose(panelTransform)
  setTimeout(() => {
    emit('update:modelValue', false)
    isClosing.value = false
    dragY.value = 0
  }, ms)
}
</script>

<style scoped>
@import '../../common/styles/theme-tokens.css';

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  transition: opacity 0.25s ease-out;
}
.mask-fade-out { opacity: 0; }

.sheet-panel {
  width: 100%;
  background: #fff;
  border-radius: 44px 44px 0 0;
  padding: 20px 24px 0;
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.1);
  will-change: transform;
  display: flex;
  flex-direction: column;
}

/* 拖拽关闭只在这个区域生效，滚轮区域完整交给原生控件，不再抢手势 */
.sheet-drag-zone {
  flex: none;
}

.sheet-handle {
  width: 40px;
  height: 5px;
  border-radius: 100px;
  margin: 0 auto 20px;
  opacity: 0.85;
  transition: background 0.35s ease;
}

.sheet-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.header-main { flex: 1; min-width: 0; }
.sheet-title { font-size: 18px; font-weight: 600; color: var(--text-ink, #1E293B); display: block; line-height: 1.3; }
.sheet-subtitle { font-size: 12px; font-weight: 600; color: var(--text-muted, #94A3B8); display: block; margin-top: 6px; line-height: 1.45; }

.sheet-close-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--primary-soft, #e9f0f2);
  color: var(--text-sub, #64748B);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.date-picker-view {
  height: 220px;
  width: 100%;
}

.pv-item {
  height: 44px;
  line-height: 44px;
  text-align: center;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-ink, #1E293B);
}

.sheet-actions { padding: 16px 0 8px; }

.confirm-btn {
  width: 100%;
  height: 52px;
  background: var(--primary-color, #2F5D6B);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: 0 8px 20px var(--primary-glow, rgba(47, 93, 107, 0.2));
}
.confirm-btn:active { transform: scale(0.97); opacity: 0.92; }
.confirm-txt { color: #fff; font-size: 16px; font-weight: 600; }

.safe-area-bottom { height: calc(12px + env(safe-area-inset-bottom)); }
</style>
