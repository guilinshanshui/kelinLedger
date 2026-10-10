
<template>
  <view
    v-if="modelValue"
    class="picker-mask"
    :class="[themeClass, { 'mask-fade-out': isClosing }]"
    :style="maskLayerStyle"
    @tap.stop="handleClose"
  >
    <view
      class="picker-panel"
      :class="themeClass"
      :style="panelStyle"
      @tap.stop
    >
      <!--
        拖拽关闭只绑在头部。
        之前绑在整个面板上，列表里往下滑（想看上面的选项）会先把面板拖走，
        同时每帧都在改面板 transform，滚动也跟着发涩。
      -->
      <view
        class="picker-drag-zone"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <view class="picker-handle" :style="{ background: primaryColor }"></view>

        <view class="picker-header">
          <view class="picker-header-main">
            <text class="picker-title">{{ title }}</text>
            <text class="picker-subtitle">{{ subtitle || (multiple ? '支持多选' : '请选择一项') }}</text>
          </view>
          <view v-if="multiple" class="picker-confirm-btn" @click="handleConfirm">
            <text class="confirm-txt">确定</text>
          </view>
          <view v-else class="picker-close-btn" @click="handleClose">
            <AppIcon name="close" :size="16" />
          </view>
        </view>
      </view>

      <scroll-view scroll-y class="picker-scroll-area">
        <!-- 列表布局模式 -->
        <view v-if="layout === 'list'" class="layout-list">
          <view 
            v-for="(item, index) in options" 
            :key="index"
            class="list-item"
            :class="{ 'item-active': isSelected(item) }"
            @click="onSelect(item)"
          >
            <view class="item-content">
              <!-- avatar 优先；其余图标交给 AppIcon，兼容 mc: 矢量 / 图片 / emoji -->
              <image v-if="item.avatar" :src="item.avatar" mode="aspectFill" class="item-avatar" />
              <view v-else class="item-icon-wrap">
                <AppIcon :value="item.icon" :size="24" />
              </view>
              <text class="item-label">{{ item.label || item }}</text>
            </view>
            <view v-if="isSelected(item)" class="item-check">
              <AppIcon name="check-2" :size="14" color="#FFFFFF" />
            </view>
          </view>
        </view>

        <!-- 网格布局模式 -->
        <view v-else-if="layout === 'grid'" class="layout-grid" :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }">
          <view 
            v-for="(item, index) in options" 
            :key="index"
            class="grid-item"
            :class="{ 'item-active': isSelected(item) }"
            @click="onSelect(item)"
          >
            <view class="grid-icon-box" :style="{ backgroundColor: item.bgColor || softColor }">
<AppIcon :value="item.icon || item.emoji || 'mc:puzzled'" :size="26" />
              <view v-if="isSelected(item)" class="grid-selected-dot"></view>
              <view v-if="multiple && isSelected(item)" class="grid-badge">
                <AppIcon name="check-2" :size="11" color="#FFFFFF" />
              </view>
            </view>
            <text class="grid-label">{{ item.label || item.name || item }}</text>
          </view>
        </view>
      </scroll-view>
      
      <view class="picker-footer-spacer"></view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { playSheetOpen, playSheetClose, sheetPanelTransition, sheetMaskTransition } from '@/common/utils/sheetMotion.js';
import AppIcon from './AppIcon.vue';

const props = defineProps({
  modelValue: Boolean,
  title: { type: String, default: '请选择' },
  subtitle: { type: String, default: '' },
  layout: { type: String, default: 'list' }, 
  multiple: { type: Boolean, default: false },
  cols: { type: Number, default: 3 },       
  options: { type: Array, default: () => [] },
  currentSelected: [String, Object, Array]
});

const emit = defineEmits(['update:modelValue', 'change', 'confirm']);

const { themeClass, softColor, primaryColor } = useAppTheme();

const modalTranslateY = ref(0);
const isSwiping = ref(false);
const isClosing = ref(false);
let startY = 0;

const maskOpacity = computed(() => {
  if (!isSwiping.value) return 0.4;
  return Math.max(0.1, 0.4 - (modalTranslateY.value / 1000));
});

const maskLayerStyle = computed(() => ({
  backgroundColor: `rgba(15, 23, 42, ${maskOpacity.value})`
}));

// iOS sheet 风格：统一动画参数见 common/utils/sheetMotion.js
const panelTransform = ref({ transform: 'translateY(100%)', transition: 'none' })
const panelStyle = computed(() => panelTransform.value);


const localSelected = ref([]);

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    modalTranslateY.value = 0;
    isClosing.value = false;
    playSheetOpen(panelTransform)
    if (props.multiple) {
      localSelected.value = Array.isArray(props.currentSelected) ? [...props.currentSelected] : [];
    }
  }
});

const isSelected = (item) => {
  if (item === undefined || item === null) return false;
  if (props.currentSelected === undefined || props.currentSelected === null) return false;

  const getIdentifier = (val) => {
    if (!val || typeof val !== 'object') return val;
    return val.id !== undefined ? val.id : (val.label !== undefined ? val.label : val);
  };

  const itemKey = getIdentifier(item);

  if (props.multiple) {
    return localSelected.value.some(s => getIdentifier(s) === itemKey);
  }

  if (Array.isArray(props.currentSelected)) {
    return props.currentSelected.some(s => getIdentifier(s) === itemKey);
  }

  const currentKey = getIdentifier(props.currentSelected);
  
  if (typeof props.currentSelected === 'string') {
    return item.label === props.currentSelected || item.id === props.currentSelected || item === props.currentSelected;
  }
  
  return itemKey === currentKey;
};

const onTouchStart = (e) => {
  startY = e.touches[0].clientY;
  isSwiping.value = true;
};

const onTouchMove = (e) => {
  const diff = e.touches[0].clientY - startY;
  if (diff > 0) {
    panelTransform.value = { transform: 'translateY(' + diff + 'px)', transition: 'none' }
    modalTranslateY.value = diff;
  }
};

const onTouchEnd = () => {
  isSwiping.value = false;
  if (modalTranslateY.value > 150) handleClose();
  else { modalTranslateY.value = 0; panelTransform.value = { transform: 'translateY(0)', transition: sheetPanelTransition() } }
};

const handleClose = () => {
  if (isClosing.value) return
  isClosing.value = true;
  const ms = playSheetClose(panelTransform)
  setTimeout(() => {
    emit('update:modelValue', false);
    isClosing.value = false;
  }, ms);
};

const onSelect = (item) => {
  if (props.multiple) {
    const itemKey = item.id || item.label || item;
    const index = localSelected.value.findIndex(s => (s.id || s.label || s) === itemKey);
    if (index > -1) {
      localSelected.value.splice(index, 1);
    } else {
      localSelected.value.push(item);
    }
  } else {
    emit('change', item);
    handleClose();
  }
};

const handleConfirm = () => {
  emit('confirm', localSelected.value);
  handleClose();
};
</script>

<style scoped>
@import '../../common/styles/theme-tokens.css';

.picker-mask {
  position: fixed; inset: 0; 
   z-index: 9999; display: flex; align-items: flex-end; transition: opacity 0.3s;
}
.mask-fade-out { opacity: 0; }
.picker-panel {
  width: 100%; background: #fff; border-radius: 44px 44px 0 0; padding: 20px 24px;
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.1); will-change: transform; position: relative;
}
/* 拖拽关闭只在这个区域生效，列表滚动交给 scroll-view 自己处理 */
.picker-drag-zone {
  position: relative;
  z-index: 1;
}
.picker-handle {
  width: 40px;
  height: 5px;
  border-radius: 100px;
  margin: 0 auto 20px;
  opacity: 0.85;
  transition: background 0.35s ease;
}
.picker-header {
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.picker-header-main { flex: 1; min-width: 0; }
.picker-title { font-size: 18px; font-weight: 600; color: var(--text-ink, #1E293B); display: block; line-height: 1.3; }
.picker-subtitle {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #94A3B8);
  display: block;
  margin-top: 6px;
  line-height: 1.45;
  letter-spacing: 0;
  text-transform: none;
}
.picker-close-btn, .picker-confirm-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.picker-close-btn {
  background: var(--primary-soft, #e9f0f2);
  color: var(--text-sub, #64748B);
}
.picker-confirm-btn {
  background: var(--primary-color, #2F5D6B);
  color: #fff;
  box-shadow: 0 6px 12px var(--primary-glow, rgba(47, 93, 107, 0.2));
  transition: background 0.35s ease;
}
.confirm-txt { font-size: 14px; font-weight: 600; }

.picker-scroll-area { max-height: 480px; }

.layout-list { display: flex; flex-direction: column; gap: 12px; }
.list-item {
  height: 68px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
  background: var(--primary-soft, #E9F0F2); border-radius: 22px; border: 2px solid transparent; transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s;
}
.item-content { display: flex; align-items: center; gap: 14px; }
.item-avatar { width: 44px; height: 44px; border-radius: 14px; border: 3px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.item-icon-wrap { font-size: 20px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
.item-label { font-size: 15px; font-weight: 600; color: var(--text-ink, #334155); }
.item-check {
  width: 24px; height: 24px;
  background: var(--primary-color, #2F5D6B);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.35s ease;
}

.layout-grid {
  display: grid;
  gap: 10px;
  padding: 4px 0 20px;
  width: 100%;
}
.grid-item {
  background: #fff;
  border-radius: 20px;
  padding: 14px 8px 12px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1.5px solid #f1f5f9;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
  transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
  position: relative;
}
.grid-item:active { transform: scale(0.98); }
.grid-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  position: relative;
  overflow: visible;
}
.grid-selected-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary-color, #2f5d6b);
  border: 2px solid #fff;
  box-shadow: 0 2px 6px var(--primary-glow, rgba(47, 93, 107, 0.35));
}
.grid-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 18px;
  height: 18px;
  background: var(--primary-color, #2F5D6B);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: bold;
  border: 2px solid #fff;
  z-index: 1;
  transition: background 0.35s ease;
}
.grid-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub, #64748B);
  text-align: center;
  line-height: 1.35;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-item.item-active {
  background: var(--primary-soft, #e9f0f2) !important;
  border-color: var(--primary-color, #2f5d6b) !important;
}
.grid-item.item-active {
  border-color: var(--primary-color, #2F5D6B);
  background: #fff;
  box-shadow: 0 8px 24px var(--primary-glow, rgba(47, 93, 107, 0.14));
}
.item-active .grid-label,
.item-active .item-label {
  color: var(--primary-color, #2F5D6B);
}

.picker-footer-spacer { height: calc(30px + env(safe-area-inset-bottom)); }
</style>
