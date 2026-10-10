<template>
  <view 
    v-if="modelValue" 
    class="modal-mask" 
    :class="[themeClass, { 'mask-closing': isClosing }]"
    @click="handleCancel"
    @touchmove.stop.prevent
  >
    <view 
      class="modal-panel" 
      :style="panelStyle"
      @click.stop
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <view class="modal-handle"></view>

      <view class="modal-header">
        <view class="title-area">
          <text class="sub-label">{{ isEdit ? '个人信息管理' : '完善您的资料' }}</text>
          <text class="main-title">{{ isEdit ? '修改资料' : '开启家庭协作' }}</text>
        </view>
      </view>

      <view class="modal-body">
        <!-- 头像上传 -->
		<view class="avatar-upload-section">
			<button class="avatar-button" open-type="chooseAvatar" @chooseavatar="chooseAvatarEvent">
          <view class="avatar-wrapper">
            <UserAvatar :src="userInfo.avatar" :name="userInfo.nickname" :size="100" radius="35px" class="preview-avatar" />
            <view class="camera-badge"><AppIcon name="camera" :size="16" color="#FFFFFF" /></view>
          </view>
		  </button>
          <text class="upload-tip">点击选择头像，可直接用微信头像</text>
        </view>

        <!-- 昵称输入 -->
        <view class="input-section">
          <text class="input-label">您的昵称</text>
          <view class="nickname-input-box">
            <input 
              @blur="bindblur" @input="handleInputChange" v-model="userInfo.nickname" 
              type="nickname"
              class="nickname-input" 
              placeholder="请输入您的昵称" 
              placeholder-style="color: var(--text-faint, #66788D)"
              maxlength="10"
            />
            <view v-if="userInfo.nickname" class="clear-btn" @click="userInfo.nickname = ''">
              <AppIcon name="close" :size="14" />
            </view>
          </view>
        </view>
      </view>

      <view class="modal-footer">
        <button class="save-btn" @click="handleSave">
          <text class="btn-txt">{{ isEdit ? '保存修改' : '开始使用' }}</text>
        </button>
      </view>
      
      <view class="safe-area-bottom"></view>
    </view>
  </view>
</template>

<script setup>
import { useAppTheme } from '@/common/themes/useAppTheme.js'
const { themeClass } = useAppTheme()

import { ref, watch, reactive, computed } from 'vue';
import { uploadApi, userApi } from '@/common/api';
import UserAvatar from './UserAvatar.vue';
import AppIcon from './AppIcon.vue';
import { getStoredUser } from '@/common/utils/session';
import { playSheetOpen, playSheetClose, sheetPanelTransition } from '@/common/utils/sheetMotion.js';
import { useUserStore } from '@/store/user';

const props = defineProps({
  modelValue: Boolean,
  userInfo:{type:Object,default:null},
  isEdit: { type: Boolean, default: false },
  initialAvatar: { type: String, default: '' },
  initialNickname: { type: String, default: '' }
});

const userInfo = reactive({
  avatar: '',
  nickname: ''
});

const emit = defineEmits(['update:modelValue', 'complete']);

const isClosing = ref(false);
const isSwiping = ref(false);
const panelY = ref(0);
let startY = 0;

const panelTransform = ref({ transform: 'translateY(100%)', transition: 'none' });
const panelStyle = computed(() => panelTransform.value);

// 当弹窗打开时，从 props 或本地存储初始化用户信息。
// immediate 不能省：登录页用 v-if="pendingUserInfo" 挂载本组件，
// 挂载瞬间 modelValue 已经是 true，普通 watch 不会触发，
// 弹窗就会停在屏幕下方（界面上只剩一层遮罩，看不到内容）。
watch(() => props.modelValue, (val) => {
  if (val) {
    panelY.value = 0;
    isClosing.value = false;
    playSheetOpen(panelTransform);

    // 优先使用传入的props.userInfo
    if (props.userInfo && typeof props.userInfo === 'object') {
      userInfo.avatar = props.userInfo.avatar || props.initialAvatar || '';
      userInfo.nickname = props.userInfo.nickname || props.initialNickname || '';
    } else {
      // 尝试从本地存储读取
      try {
        const stored = getStoredUser() || {};
        userInfo.avatar = stored.avatar || props.initialAvatar || '';
        userInfo.nickname = stored.nickname || props.initialNickname || '';
      } catch (e) {
        userInfo.avatar = props.initialAvatar || '';
        userInfo.nickname = props.initialNickname || '';
      }
    }
  }
}, { immediate: true });
const bindblur=(e)=>{
		userInfo.nickname=e.detail.value;
	}

// 头像选择
	const chooseAvatarEvent = (e) => {
		userInfo.avatar = e.detail.avatarUrl
	}
	const handleInputChange=(val)=>{
	}


/**
 * 判断头像地址是否已经落在云存储上。
 *
 * 微信头像选择器（open-type="chooseAvatar"）交回来的是本机临时路径：
 * 真机是 wxfile://tmp_xxx，开发者工具是 http://tmp/xxx.jpeg。
 * 这种路径只在当前设备当前会话有效，直接存库会让头像在真机上变空白，
 * 因此只有 cloud:// 和云存储自有域名才算“已上传”。
 */
const CLOUD_FILE_RE = /^cloud:\/\//
const CLOUD_HTTP_RE = /^https:\/\/[^/]*\.(tcb\.qcloud\.la|tcloudbase\.com|myqcloud\.com)\//
const isUploadedAvatar = (url) => CLOUD_FILE_RE.test(url) || CLOUD_HTTP_RE.test(url)

const handleSave = async () => {
  const nickname = String(userInfo.nickname || '').trim()
  if (!nickname) {
    uni.showToast({ title: '请输入昵称', icon: 'none' })
    return
  }
  if (!userInfo.avatar) {
    uni.showToast({ title: '请选择头像', icon: 'none' })
    return
  }

  uni.showLoading({ title: '保存中…', mask: true })
  try {
    let avatar = userInfo.avatar
    // 临时路径（wxfile:// 或 http://tmp/…）先传云存储，已上传的直接复用。
    if (!isUploadedAvatar(avatar)) {
      const uploaded = await uploadApi.uploadImage(avatar, 'avatar')
      if (uploaded.code !== 0) throw new Error(uploaded.message || '头像上传失败')
      avatar = uploaded.data.url || uploaded.data.fileID
    }

    const result = await userApi.updateUserInfo({ nickname, avatar })
    if (result.code !== 0) throw new Error(result.message || '保存失败')
    const userStore = useUserStore()
    userStore.setUser({ ...(getStoredUser() || {}), ...result.data })
    handleCancel()
    emit('complete', result.data)
  } catch (error) {
    uni.showToast({ title: error.message || '保存失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
};


const handleCancel = () => {
  if (isClosing.value) return;
  isClosing.value = true;
  const ms = playSheetClose(panelTransform);
  setTimeout(() => {
    emit('update:modelValue', false);
    isClosing.value = false;
  }, ms);
};

/* --- 手势逻辑 --- */
const onTouchStart = (e) => { startY = e.touches[0].clientY; isSwiping.value = true; };
const onTouchMove = (e) => {
  const diff = e.touches[0].clientY - startY;
  if (diff > 0) panelY.value = diff;
  if (diff > 0) panelTransform.value = { transform: 'translateY(' + diff + 'px)', transition: 'none' };
};
const onTouchEnd = () => {
  isSwiping.value = false;
  if (panelY.value > 150) handleCancel();
  else {
    panelY.value = 0;
    panelTransform.value = { transform: 'translateY(0)', transition: sheetPanelTransition() };
  }
};
</script>

<style scoped>
@import '../../common/styles/theme-tokens.css';

.modal-mask {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4);
   z-index: 9999; display: flex; align-items: flex-end;
  transition: opacity 0.25s ease-out;
}
.mask-closing { opacity: 0; }

.modal-panel {
  width: 100%; background: #fff; border-radius: 44px 44px 0 0; padding: 20px 24px;
  box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.1); will-change: transform;
}

.modal-handle { width: 42px; height: 5px; background: #F1F5F9; border-radius: 10px; margin: 0 auto 32px; }

.modal-header { margin-bottom: 32px; }
.sub-label { font-size: 11px; font-weight: 600; color: var(--text-muted, #94A3B8); text-transform: uppercase; letter-spacing: 2px; }
.main-title { font-size: 24px; font-weight: 600; color: var(--text-ink, #1E293B); margin-top: 4px; display: block; }

.modal-body { display: flex; flex-direction: column; align-items: center; }

.avatar-upload-section { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 40px; }
/* 头像按钮样式 - 完全移除视觉效果 */
.avatar-button {
  /* 移除所有背景相关样式 */
  background: none !important;
  background-color: transparent !important;

  /* 移除所有边框相关样式 */
  border: none !important;
  border-width: 0 !important;
  border-style: none !important;
  border-color: transparent !important;

  /* 移除内边距和外边距 */
  padding: 0 !important;
  margin: 0 !important;

  /* 移除轮廓和阴影 */
  outline: none !important;
  box-shadow: none !important;

  /* 确保在所有状态下都没有样式 */
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
}
.avatar-wrapper { position: relative; width: 100px; height: 100px; overflow: hidden; }
.preview-avatar { 
  width: 100%; 
  height: 100%; 
  border-radius: 35px; 
  border: none !important; 
  box-shadow: none !important; 
  display: block;
}
.camera-badge { 
  position: absolute; bottom: -8px; right: -8px; width: 32px; height: 32px; 
  background: #fff; border-radius: 50%; display: flex; align-items: center; 
  justify-content: center; font-size: 14px; box-shadow: none !important; border: none !important;
}
.upload-tip { font-size: 12px; font-weight: 600; color: var(--text-faint, #CBD5E1); }

.input-section { width: 100%; margin-bottom: 32px; }
.input-label { font-size: 11px; font-weight: 600; color: var(--text-muted, #94A3B8); text-transform: uppercase; margin-bottom: 12px; display: block; }
.nickname-input-box { 
  background: #F8FAFC; height: 64px; border-radius: 20px; border: 1px solid #F1F5F9; 
  padding: 0 20px; display: flex; align-items: center; gap: 12px;
}
.nickname-input { flex: 1; font-size: 17px; font-weight: 600; color: var(--text-ink, #1E293B); }
.clear-btn { width: 20px; height: 20px; background: var(--line-hairline, #E2E8F0); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; }

.save-btn { 
  width: 100%; height: 64px; background: var(--primary-color, #2F5D6B); border-radius: 22px; 
  display: flex; align-items: center; justify-content: center; border: none;
  box-shadow: 0 10px 25px var(--primary-glow, rgba(47, 93, 107, 0.2));
}
.save-btn:active { transform: scale(0.96); opacity: 0.9; }
.btn-txt { color: #fff; font-size: 16px; font-weight: 600; }

.safe-area-bottom { height: env(safe-area-inset-bottom); margin-top: 10px; }

</style>
