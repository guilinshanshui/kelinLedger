<template>
  <view class="ua" :class="themeClass" :style="boxStyle">
    <image
      v-if="src && !loadFailed"
      :src="src"
      mode="aspectFill"
      class="ua-img"
      @error="handleImageError"
    />
    <text v-else class="ua-txt" :style="textStyle">{{ initial }}</text>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAppTheme } from '@/common/themes/useAppTheme.js'

const { themeClass } = useAppTheme()

/**
 * 统一头像：有图用图，没有就用昵称首字渲染主题色圆形。
 * 避免使用外部随机头像服务（会显示陌生人照片，也依赖网络）。
 */
const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: Number, default: 40 },
  radius: { type: String, default: '12px' }
})

/**
 * 头像加载失败兜底：历史上存过 wxfile:// / http://tmp 这类临时路径，
 * 或者云存储文件被删，image 会静默渲染成空白方块，看起来像「头像丢了」。
 * 失败时退回昵称首字，保证任何时候都有一个可见头像。
 */
const loadFailed = ref(false)

watch(
  () => props.src,
  () => {
    loadFailed.value = false
  }
)

const handleImageError = () => {
  loadFailed.value = true
}

const initial = computed(() => {
  const n = String(props.name || '').trim()
  return n ? n.slice(0, 1) : '友'
})

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: props.radius
}))

const textStyle = computed(() => ({
  fontSize: `${Math.round(props.size * 0.42)}px`
}))
</script>

<style scoped>
@import '../../common/styles/theme-tokens.css';
.ua {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex: none;
  background: var(--primary-soft, #E9F0F2);
  border: 1px solid var(--line-hairline, #EEF1F5);
  box-sizing: border-box;
}
.ua-img {
  width: 100%;
  height: 100%;
}
.ua-txt {
  font-weight: 600;
  color: var(--primary-color, #2F5D6B);
  line-height: 1;
}
</style>
