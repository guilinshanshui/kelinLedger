<template>
  <view
    v-if="modelValue"
    class="picker-mask"
    :class="[themeClass, { 'mask-fade-out': isClosing }]"
    :style="maskLayerStyle"
    @tap.stop="handleClose"
    @touchmove.stop.prevent
    @wheel.stop.prevent
  >
    <view
      class="picker-panel"
      :class="themeClass"
      :style="panelStyle"
      @tap.stop
    >
      <!-- 【顶部手柄感应区】仅在此区域滑动会触发弹窗关闭 -->
      <view 
        class="drag-handle-zone"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      >
        <view class="picker-handle"></view>
        <view class="picker-header">
          <view class="header-main">
            <text class="picker-title">{{ title }}</text>
            <text class="picker-subtitle">{{ subtitle }}</text>
          </view>
          <view class="picker-close" @tap.stop="handleClose">
            <AppIcon name="close" :size="16" />
          </view>
        </view>
      </view>
      
      <!-- 【中部列表区】强制不响应外层手势，高度锁定，内部独立滚动 -->
      <view class="dual-body">
        <!-- 分类网格：扁平分类直接展示，每行 3 个 -->
        <scroll-view 
          scroll-y 
          class="main-content-list"
          :scroll-top="scrollTop"
          @touchmove.stop
          :show-scrollbar="false"
          enhanced
        >
          <view class="sub-list-stack">
            <view 
              v-for="(sub, sIdx) in gridOptions" 
              :key="sub.id" 
              class="sub-grid-item animate-stagger"
              :class="{ 'sub-grid-active': isItemSelected(sub) }"
              :style="{ 
                '--delay': (sIdx * 0.05) + 's',
                'border-color': isItemSelected(sub) ? accentColor : '#F1F5F9'
              }"
              @tap="onGridClick(sub)"
            >
              <view class="sub-item-left">
                <view class="sub-icon-circle" :style="{ backgroundColor: isItemSelected(sub) ? accentColor : softColor }">
                  <AppIcon
                    :value="sub.icon"
                    :size="24"
                    :color="isItemSelected(sub) ? '#FFFFFF' : accentColor"
                  />
                </view>
                <text class="sub-label-txt" :class="{ 'sub-label-active': isItemSelected(sub) }">{{ sub.label }}</text>
              </view>
              <view v-if="isItemSelected(sub)" class="sub-checkmark-box" :style="{ backgroundColor: accentColor }">
                <AppIcon name="check-2" :size="12" color="#FFFFFF" />
              </view>
            </view>
          </view>
          <view v-if="gridOptions.length === 0" class="empty-hint">
            <text>该分类下暂无可选项</text>
          </view>
        </scroll-view>
      </view>
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup>
import { useAppTheme } from '@/common/themes/useAppTheme.js'
import { playSheetOpen, playSheetClose, sheetPanelTransition } from '@/common/utils/sheetMotion.js'
import AppIcon from './AppIcon.vue'
const { themeClass, primaryColor, softColor, theme } = useAppTheme()

import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: Boolean,
  title: { type: String, default: '选择分类' },
  subtitle: { type: String, default: '请选择一项' },
  options: { type: Array, default: () => [] },
  transactionType: { type: String, default: 'expense' },
  currentSelected: [String, Number], // 支持 ID (Number) 或名称 (String)
  themeColor: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue', 'change']);

const accentColor = computed(() => props.themeColor || primaryColor.value);

const parentCategory = ref('');
const scrollTop = ref(0);
const isClosing = ref(false);
const modalTranslateY = ref(0);
const isSwiping = ref(false);
let startY = 0;

const maskOpacity = computed(() => {
  if (!isSwiping.value && !isClosing.value) return 0.4;
  if (isClosing.value) return 0;
  return Math.max(0.1, 0.4 - (modalTranslateY.value / 1000));
});

const maskLayerStyle = computed(() => ({
  backgroundColor: `rgba(15, 23, 42, ${maskOpacity.value})`
}));

// iOS sheet 风格：统一动画参数见 common/utils/sheetMotion.js
const panelTransform = ref({ transform: 'translateY(100%)', transition: 'none' })
const panelStyle = computed(() => panelTransform.value);


// 判断二级项是否被选中（兼容 ID 和 Label 匹配）
const isItemSelected = (sub) => {
  return props.currentSelected === sub.id || props.currentSelected === sub.label;
};

const level1Options = computed(() => {
  return props.options.filter(cat => cat.type === props.transactionType && !cat.parentId);
});

const level2Options = computed(() => {
  if (!parentCategory.value) return [];
  const parent = level1Options.value.find(o => o.label === parentCategory.value);
  if (!parent) return [];
  return props.options.filter(cat => cat.parentId === parent.id);
});

// 核心回显逻辑：当弹窗打开时，根据当前选中的 ID 或名称，寻找并展开其父类
watch(() => props.modelValue, (val) => {
  if (val) {
    modalTranslateY.value = 0;
    isClosing.value = false;
    playSheetOpen(panelTransform)
    
    if (props.currentSelected) {
      // 1. 在所有选项中找到当前命中的那个对象（匹配 ID 或 Label）
      const current = props.options.find(o => o.id === props.currentSelected || o.label === props.currentSelected);
      
      if (current) {
        if (current.parentId) {
          // 2. 如果是二级分类，找到其父级对象，并设置左侧边栏的选中态
          const parent = props.options.find(p => p.id === current.parentId);
          if (parent) parentCategory.value = parent.label;
        } else {
          // 3. 如果本身就是一级分类，直接设置
          parentCategory.value = current.label;
        }
      }
    } else if (level1Options.value.length > 0) {
      // 默认选中第一个
      parentCategory.value = level1Options.value[0].label;
    }
  }
});

const onLevel1Click = (item) => {
  const children = props.options.filter((cat) => cat.parentId === item.id)
  if (!children.length) {
    emit('change', item)
    handleClose()
    return
  }
  if (parentCategory.value === item.label) return;
  parentCategory.value = item.label;
  scrollTop.value = Math.random(); 
};

/** 
 * 网格展示列表：
 * - 任何分类带子类时：显示当前父类的子项
 * - 完全扁平（无任何子类）时：直接显示一级，点选即完成
 */
const gridOptions = computed(() => {
  const hasHierarchy = props.options.some((cat) => cat.parentId)
  if (hasHierarchy) return level2Options.value
  return level1Options.value
})

const onGridClick = (item) => {
  const children = props.options.filter((cat) => cat.parentId === item.id)
  if (children.length) {
    // 有子类：进入该分类的二级网格
    parentCategory.value = item.label
    scrollTop.value = Math.random()
    return
  }
  // 无子类：直接完成选择
  emit('change', item)
  handleClose()
}
const onLevel2Click = (item) => {
  // 方法：这里直接把整个 item 对象 emit 出去
  // 父组件通过 @change="handler" 接收，在 handler(item) 里访问 item.id 即可
  emit('change', item);
  handleClose();
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

const onTouchStart = (e) => { 
  startY = e.touches[0].clientY; 
  isSwiping.value = true; 
};

const onTouchMove = (e) => {
  const currentY = e.touches[0].clientY;
  const diff = currentY - startY;
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
</script>
<style scoped>
@import '../../common/styles/theme-tokens.css';

/* 隐藏所有滚动条 */
::-webkit-scrollbar {
  display: none;
  width: 0 !important;
  height: 0 !important;
  -webkit-appearance: none;
  background: transparent;
}

.picker-mask { position: fixed; inset: 0;   z-index: 10000; display: flex; align-items: flex-end; transition: opacity 0.3s; }
.mask-fade-out { opacity: 0; }

.picker-panel { 
  width: 100%; background: #fff; border-radius: 44px 44px 0 0; padding: 0; 
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.1); 
  will-change: transform; display: flex; flex-direction: column; 
  max-height: 80vh; overflow: hidden; 
  overscroll-behavior: contain;
}

.drag-handle-zone { padding: 20px 0 0; flex-shrink: 0; cursor: ns-resize; }
.picker-handle { width: 42px; height: 5px; background: var(--line-hairline, #E2E8F0); border-radius: 10px; margin: 0 auto 24px; }
.picker-header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; padding: 0 32px; }

.header-main { display: flex; flex-direction: column; }
.picker-title { font-size: 19px; font-weight: 600; color: var(--text-ink, #1E293B); }
.picker-subtitle { font-size: 12px; color: var(--text-muted, #94A3B8); display: block; margin-top: 4px; }
.picker-close { width: 36px; height: 36px; background: #F1F5F9; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--text-sub, #64748B); font-size: 14px; font-weight: bold; }

.dual-body { 
  height: 60vh; /* 修复真机滑不动的核心：提供显式的、不依赖于父级 flex 计算的高度 */
  display: flex; 
  overflow: hidden; 
  border-top: 1px solid #F8FAFC; 
}

/* 左侧导航美化 */
.side-nav { width: 100px; background: #F8FAFC; height: 100%; flex-shrink: 0; }
.side-nav-inner { padding: 12px 0; }
.side-item { position: relative; padding: 24px 10px; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s; }
.side-item.active { background: #FFFFFF; }
.side-active-indicator { position: absolute; left: 0; top: 25%; bottom: 25%; width: 5px; border-radius: 0 10px 10px 0; }
.side-emoji { font-size: 24px; transition: transform 0.3s; }
.active .side-emoji { transform: scale(1.1); }
.side-icon-img { width: 28px; height: 28px; border-radius: 8px; transition: transform 0.3s; }
.active .side-icon-img { transform: scale(1.1); }
.side-label { font-size: 12px; font-weight: 600; color: var(--text-muted, #94A3B8); text-align: center; }
.active-label { color: var(--text-ink, #1E293B) !important; font-weight: 600; }

/* 右侧列表美化 */
.main-content-list { flex: 1; background: #fff; height: 100%; }
.sub-list-stack { display: flex; flex-direction: row; flex-wrap: wrap; padding: 16px 14px 60px; gap: 12px; }
.sub-grid-item { position: relative; 
  width: calc((100% - 24px) / 3);
  height: 92px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  border-radius: 16px; 
  background: #fff; transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s; 
  border: 1.5px solid #F1F5F9; 
  box-sizing: border-box;
  padding: 8px 4px;
}
.sub-grid-item:active { transform: scale(0.96); background: #F8FAFC; }
.sub-grid-active {
  background: #FFFFFF !important;
  border-color: var(--primary-color, #2F5D6B) !important;
  box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important;
}

.sub-item-left { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; }
.sub-icon-circle { width: 40px; height: 40px; border-radius: 14px; display: flex; align-items: center; justify-content: center; border: 2.5px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.03); overflow: hidden; }
.sub-label-txt { font-size: 12px; font-weight: 500; color: var(--text-sub, #475569); text-align: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub-label-active { color: var(--primary-color, #2F5D6B) !important; font-weight: 600; }


.sub-checkmark-box { position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }


.empty-hint { padding: 80px 0; text-align: center; color: var(--text-faint, #CBD5E1); font-size: 13px; font-weight: 600; }

.animate-stagger { opacity: 0; transform: translateY(15px); animation: slideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards; animation-delay: var(--delay); }
@keyframes slideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
</style>
