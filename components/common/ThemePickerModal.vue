
<template>
  <view 
    class="picker-mask" 
    v-show="modelValue"
    :class="[themeClass, { 'mask-active': modelValue, 'mask-closing': isClosing }]"
    @click="handleClose"
    @touchmove.stop.prevent
  >
    <view 
      class="picker-panel" 
      :class="{ 'panel-active': modelValue }"
      :style="panelStyle"
      @click.stop
    >
      <!-- 拖拽关闭只绑在头部，主题列表的滚动交给 scroll-view -->
      <view
        class="picker-drag-zone"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view class="picker-handle" :style="{ background: primaryColor }"></view>

          <view class="picker-header">
            <view class="header-icon-wrap">
              <AppIcon name="palette-2" :size="20" />
            </view>
            <text class="main-title">个性空间换肤</text>
            <text class="sub-label">精选配色，一键切换您的家庭氛围</text>
          </view>
      </view>

      <scroll-view scroll-y class="theme-scroll" :show-scrollbar="false">
        <view class="theme-grid">
          <view 
            v-for="(t, index) in themes" 
            :key="t.id"
            :id="'theme-' + t.id"
            class="theme-item"
            hover-class="theme-item-press"
            :class="{ 'active': currentSelected === t.id, 'item-animate': modelValue }"
            :style="[
              { '--delay': index * 0.06 + 's' },
              currentSelected === t.id ? { '--ring-color': t.primary } : {}
            ]"
            @click="selectTheme(t.id)"
          >
            <view class="swatch-card">
              <view class="swatch-preview" :style="{ background: t.soft }">
                <view class="preview-top" :style="{ background: t.primary }"></view>
                <view class="preview-body">
                  <view class="preview-chip" :style="{ background: t.primary, opacity: 0.85 }"></view>
                  <view class="preview-line"></view>
                  <view class="preview-line preview-line-short"></view>
                </view>
              </view>
              <view
                v-if="currentSelected === t.id"
                class="selected-badge"
                :style="{ background: t.primary, boxShadow: `0 4px 12px ${t.primary}55` }"
              >
                <AppIcon name="check-2" :size="14" color="#FFFFFF" />
              </view>
            </view>
            <text class="theme-name">{{ t.name }}</text>
          </view>
        </view>
      </scroll-view>

    <!--  <view class="action-footer">
        <button class="done-btn" @click="handleClose">完成设置</button>
      </view> -->
    </view>
  </view>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { SHEET_CURVE, SHEET_OPEN_MS, playSheetOpen, playSheetClose, sheetPanelTransition } from '@/common/utils/sheetMotion.js';
import { APP_THEME_PRESETS, getStoredAppThemeId, setAppThemeId } from '@/common/themes/appTheme';

// 换肤弹窗自己也要吃主题变量，否则切到暖赭后弹窗仍是黛青兜底色
const { primaryColor, themeClass } = useAppTheme();

const props = defineProps({
  modelValue: Boolean
});
const emit = defineEmits(['update:modelValue']);

watch(() => props.modelValue, (newVal) => {
  if (newVal) playSheetOpen(panelTransform)
})

const currentSelected = ref(getStoredAppThemeId());
const isClosing = ref(false);
const isSwiping = ref(false);
const sheetOpenMs = SHEET_OPEN_MS;
const sheetCurve = SHEET_CURVE;
const panelY = ref(0);
let startY = 0;

const themes = APP_THEME_PRESETS;

const selectTheme = (id) => {
  if (currentSelected.value === id) return;
  currentSelected.value = id;
  setAppThemeId(id);
  handleClose();
};

const panelTransform = ref({ transform: 'translateY(100%)', transition: 'none' });
const panelStyle = computed(() => panelTransform.value);

const handleClose = () => {
  if (isClosing.value) return;
  isClosing.value = true;
  const ms = playSheetClose(panelTransform);
  setTimeout(() => {
    emit('update:modelValue', false);
    isClosing.value = false;
    panelY.value = 0;
  }, 300);
};

const onTouchStart = (e) => { startY = e.touches[0].clientY; isSwiping.value = true; };
const onTouchMove = (e) => {
  const diff = e.touches[0].clientY - startY;
  if (diff > 0) {
    panelY.value = diff * 0.8;
    panelTransform.value = { transform: 'translateY(' + (diff * 0.8) + 'px)', transition: 'none' };
  }
};
const onTouchEnd = () => {
  isSwiping.value = false;
  if (panelY.value > 120) handleClose();
  else {
    panelY.value = 0;
    panelTransform.value = { transform: 'translateY(0)', transition: sheetPanelTransition() };
  }
};
</script>

<style scoped>
@import '../../common/styles/theme-tokens.css';
.picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 10050;
  display: flex;
  align-items: flex-end;
  opacity: 0;
  transition: opacity 0.25s ease-out;
  pointer-events: none;
}
.mask-active { opacity: 1; pointer-events: auto; }
.mask-closing { opacity: 0; }

.picker-panel {
  width: 100%;
  background: var(--bg-card, #FFFFFF);
  border-radius: 48rpx 48rpx 0 0;
  padding: 16rpx 32rpx calc(env(safe-area-inset-bottom) + 28rpx);
  box-shadow: 0 -24rpx 80rpx rgba(15, 23, 42, 0.12);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 拖拽关闭只在这个区域生效，主题列表滚动不再被面板拖走 */
.picker-drag-zone {
  position: relative;
  z-index: 1;
}

.picker-handle {
  width: 72rpx;
  height: 10rpx;
  background: var(--primary-color, #2F5D6B);
  border-radius: 20rpx;
  margin: 0 auto 28rpx;
  flex-shrink: 0;
  opacity: 0.65;
  transition: background 0.35s ease;
}

.picker-header {
  margin-bottom: 32rpx;
  text-align: center;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.header-icon-wrap {
  width: 88rpx;
  height: 88rpx;
  border-radius: 28rpx;
  background: var(--primary-soft, #E9F0F2);
  border: 1px solid var(--line-hairline, #E8EEEF);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.06);
}

.header-icon { font-size: 40rpx; }

.main-title {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--text-ink, #1E293B);
  letter-spacing: 0;
}

.sub-label {
  font-size: 24rpx;
  font-weight: 400;
  color: var(--text-muted, #94A3B8);
  margin-top: 10rpx;
  display: block;
  line-height: 1.5;
}

.theme-scroll {
  flex-shrink: 0;
  max-height: 56vh;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24rpx;
  padding: 8rpx 4rpx 24rpx;
}

.theme-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16rpx;
  opacity: 0;
  transform: translateY(20rpx);
}

.item-animate {
  animation: slideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  animation-delay: var(--delay);
}

@keyframes slideUp {
  to { opacity: 1; transform: translateY(0); }
}

.theme-item-press { opacity: 0.88; transform: scale(0.98); }

.swatch-card {
  position: relative;
  border-radius: 32rpx;
  padding: 6rpx;
  background: #fff;
  border: 2rpx solid var(--line-hairline, #E8EEEF);
  box-shadow: 0 8rpx 28rpx rgba(15, 23, 42, 0.06);
  transition: transform 0.28s cubic-bezier(0.34, 1.2, 0.64, 1), box-shadow 0.28s ease, border-color 0.28s ease;
}

.active .swatch-card {
  border: 3rpx solid var(--ring-color, #2F5D6B);
  box-shadow: 0 16rpx 40rpx rgba(15, 23, 42, 0.12);
  transform: translateY(-4rpx);
}

.swatch-preview {
  border-radius: 26rpx;
  overflow: hidden;
  height: 168rpx;
  display: flex;
  flex-direction: column;
}

.preview-top {
  height: 36rpx;
  flex-shrink: 0;
  opacity: 0.95;
}

.preview-body {
  flex: 1;
  padding: 20rpx 20rpx 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.preview-chip {
  width: 48rpx;
  height: 12rpx;
  border-radius: 8rpx;
}

.preview-line {
  height: 10rpx;
  border-radius: 6rpx;
  background: rgba(255, 255, 255, 0.75);
  width: 88%;
}

.preview-line-short { width: 56%; opacity: 0.65; }

.selected-badge {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3rpx solid #fff;
  animation: badgePop 0.32s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes badgePop {
  from { opacity: 0; transform: scale(0.4); }
  to { opacity: 1; transform: scale(1); }
}


.theme-name {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-sub, #64748B);
  text-align: center;
  transition: color 0.2s ease;
}

.active .theme-name {
  color: var(--text-ink, #1E293B);
  font-weight: 600;
}

.action-footer {
  padding: 10px 0 20px;
}

.done-btn {
  width: 100%;
  height: 56px;
  line-height: 56px;
  border-radius: 20px;
  background: var(--primary-color, #2F5D6B);
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
  border: none;
  transition: transform 0.2s, opacity 0.2s;
}

.done-btn:active { transform: scale(0.98); opacity: 0.9; }
</style>
import AppIcon from './AppIcon.vue';
