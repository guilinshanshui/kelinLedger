<template>
  <view :class="themeClass" class="login-wrapper">
    <!-- 增加：悬浮返回按钮 -->
    <view class="floating-back-btn animate-fade-in" @click="goBack">
      <image src="../../static/back/icon_back.png" style="height: 20px;width: 20px;"/>
    </view>

    <!-- 2. 全屏流式内容 -->
    <scroll-view scroll-y class="login-scroll-view" :show-scrollbar="false">
      <view class="content-container">
        
        <!-- 品牌区 -->
        <view class="brand-section animate-slide-down">
          <view class="brand-logo-wrap">            <image class="brand-logo-img" src="/static/brand/logo-144.png" mode="aspectFit" />
          </view>
          <view class="brand-titles">
            <text class="app-name">可林记账本</text>
            <text class="app-motto">记录点滴，连接家庭</text>
          </view>
        </view>

        <!-- 交互表单区 -->
        <view class="form-area animate-fade-in">
          <!-- 微信登录视图 -->
          <view v-if="loginMode === 'wechat'" class="mode-view animate-pop">
            <view class="welcome-text">
              <text class="h1">欢迎加入</text>
              <!-- <text class="p">与 24,000+ 家庭一起高效管理生活</text> -->
            </view>
            
            <button class="btn-main btn-wx" @click="handleWechatLogin">
              <text class="btn-emoji"></text>
              <text class="btn-txt">微信一键登录</text>
            </button>
          </view>

          <!-- 账号密码视图 -->
          <view v-else class="mode-view animate-fade-in">
            <view class="input-stack">
              <view class="field-item" :class="{ 'is-focus': focused === 'u' }">
                <AppIcon name="user-2" :size="18" />
                <input v-model="credentials.account" class="f-input" placeholder="手机号 / 用户名" placeholder-style="color: var(--text-faint, #66788D)" @focus="focused='u'" @blur="focused=''" />
              </view>
              <view class="field-item" :class="{ 'is-focus': focused === 'p' }">
                <AppIcon name="lock" :size="18" />
                <input v-model="credentials.password" type="password" class="f-input" placeholder="请输入登录密码" placeholder-style="color: var(--text-faint, #66788D)" @focus="focused='p'" @blur="focused=''" />
              </view>
            </view>
            
            <button class="btn-main btn-login" @click="handlePasswordLogin">
              <text class="btn-txt">登 录</text>
            </button>
            
            <!-- <view class="form-links">
              <text class="link-txt">找回密码</text>
              <text class="link-txt">新用户注册</text>
            </view> -->
          </view>
        </view>

        <!-- 模式切换触发器 -->
        <view class="switcher-zone animate-fade-in">
          <view class="line-divider">
            <view class="l-line"></view>
            <text class="l-txt">更多登录方式</text>
            <view class="l-line"></view>
          </view>
          
          <view class="mode-toggle-btn" @click="toggleLoginMode">
            <view class="toggle-icon-bg">
              <AppIcon :value="loginMode === 'wechat' ? 'mc:wechat' : 'mc:cellphone'" :size="18" />
            </view>
            <text class="t-label">{{ loginMode === 'wechat' ? '账号密码登录' : '返回微信一键登录' }}</text>
          </view>
        </view>

        <!-- 3. 协议区：流式排版，避免重叠 -->
       <!-- <view class="agreement-footer animate-fade-in" :class="{ 'shake-active': showShake }">
          <view class="check-box-outer" @click="isAgreed = !isAgreed">
            <view class="check-box-inner" :class="{ 'is-checked': isAgreed }">
              <AppIcon v-if="isAgreed" name="check-2" :size="12" color="#FFFFFF" />
            </view>
          </view>
         <view class="agreement-content">
            <text class="ag-gray">我已阅读并同意</text>
            <text class="ag-blue" @click.stop="openDoc('user')">《用户协议》</text>
            <text class="ag-gray">与</text>
            <text class="ag-blue" @click.stop="openDoc('privacy')">《隐私政策》</text>
          </view>
        </view> -->
        
        <view class="bottom-safe-area"></view>
      </view>
    </scroll-view>

    <!-- 资料完善弹窗 -->
    <!-- 不用 v-if 挂载：组件在 modelValue 已经是 true 的情况下挂载，
         弹层动画拿不到「从隐藏到归位」的过渡，面板会停在屏幕外面。
         和「我的-编辑资料」保持同一套打开方式，行为可预期。 -->
    <ProfileEditModal
      v-model="showEditModal"
      @complete="onLoginComplete"
      :userInfo="pendingUserInfo || {}"
    />
  </view>
</template>

<script setup>
import { useAppTheme } from '@/common/themes/useAppTheme.js'
const { themeClass, primaryColor, softColor, theme } = useAppTheme()

import { ref, reactive } from 'vue';
import ProfileEditModal from '../../components/common/ProfileEditModal.vue';
import AppIcon from '../../components/common/AppIcon.vue';
import { userApi } from '@/common/api';
import { useUserStore } from '@/store/user';
import { onLoad } from "@dcloudio/uni-app";

const userStore = useUserStore();
const loginMode = ref('wechat'); 
const isAgreed = ref(false);
const showEditModal = ref(false);
const showShake = ref(false);
// 防连点：慢网下重复点「微信一键登录」会重复请求云函数
const loginning = ref(false);
const pendingUserInfo = ref(null);
const focused = ref('');
const inviteCode=ref(null);

onLoad((e)=>{
	if(e&&e.inviteCode){
		inviteCode.value=e.inviteCode;
	}
})

const credentials = reactive({ account: '', password: '' });

// 增加：返回上一级逻辑
const goBack = () => {
  uni.navigateBack({
    fail: () => {
      uni.reLaunch({ url: '/pages/index/index' });
    }
  });
};

const toggleLoginMode = () => {
  loginMode.value = loginMode.value === 'wechat' ? 'password' : 'wechat';
};

const triggerShake = () => {
  showShake.value = true;
  setTimeout(() => { showShake.value = false; }, 500);
};

const handleWechatLogin = async () => {
  if (loginning.value) return
  loginning.value = true
  uni.showLoading({ title: '安全连接中', mask: true })
  let failure = null
  try {
    // 云开发由平台把 openid 注入云函数，不需要 uni.login 换 code；
    // 少一次往返，也避开部分基础库 getProvider / onlyAuthorize 的兼容问题。
    const loginResult = await userApi.login({ invitedCode: inviteCode.value })
    if (loginResult.code === 0) {
      processLoginSuccess(loginResult.data, true)
    } else if (loginResult.code === 333) {
      // 新用户 / 资料未完善：先不发登录态，弹窗选头像 + 填昵称
      pendingUserInfo.value = loginResult.data
      showEditModal.value = true
    } else {
      failure = new Error(loginResult.message || '登录失败')
    }
  } catch (e) {
    failure = e
  } finally {
    uni.hideLoading()
    loginning.value = false
  }
  if (failure) {
    console.error('[login] 微信登录失败', failure)
    const msg = (failure && (failure.errMsg || failure.message)) || '登录失败，请稍后重试'
    uni.showToast({ title: String(msg).slice(0, 40), icon: 'none', duration: 3000 })
  }
};

const handlePasswordLogin = async() => {
	if(!credentials.account){
		uni.showToast({
			title:"请输入用户名",
			icon:'none'
		})
		return ;
	}
	if(!credentials.password){
		uni.showToast({
			title:"请输入密码",
			icon:'none'
		})
		return ;
	}
  // if (!isAgreed.value) { triggerShake(); return; }
  try {
	  uni.showLoading({ title: '安全连接中' });
	  if(inviteCode.value){
		  credentials.invitedCode=inviteCode.value;
	  }
	   var res=await userApi.accountLogin(credentials);
	  // 关掉 loading 再进成功分支：processLoginSuccess 只负责登录态与跳转，
	  // 加载态由各自的调用方负责（微信登录在 finally 中统一关闭）。
	  uni.hideLoading();
	  if (res.code === 0) processLoginSuccess(res.data,true);
	   // uni.showToast({ title: '正在演示账号登录', icon: 'none' });
  }catch(e){
	 uni.hideLoading();
	 console.error('[login] 账号登录失败', e);
	 uni.showToast({ title: String((e && (e.errMsg || e.message)) || '登录失败').slice(0, 40), icon: 'none' });
  }
 
};
const processLoginSuccess = (userData,isBack) => {
  userStore.setUser(userData);

  if(isBack){
	  uni.showToast({ title: '欢迎回家', icon: 'success' });
	  loginIndex();
  }
};

const loginIndex = () => {
  const pages = getCurrentPages()
  const goHome = () => {
    uni.$emit('user_login', true)
    uni.switchTab({ url: '/pages/home/home' })
  }

  if (pages.length > 1) {
    uni.navigateBack({
      success: goHome,
      fail: goHome
    })
    return
  }

  goHome()
}


const onLoginComplete = (userData) => {
	processLoginSuccess(userData, true);
};
const openDoc = (t) => uni.showToast({ title: '协议加载中...', icon: 'none' });
</script>

<style scoped>
.login-wrapper {
  position: fixed;
  inset: 0;
  background: var(--primary-soft, #ffffff);
  overflow: hidden;
  transition: background-color 0.35s ease;
}

/* 增加：悬浮返回按钮样式 */
.floating-back-btn {
  position: fixed;
  top: 54px; /* 适配灵动岛下方 */
  left: 24px;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: var(--radius-lg, 16px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  border: 1px solid rgba(241, 245, 249, 0.5);
  box-shadow: 0 8px 24px rgba(0,0,0,0.04);
  transition: transform 0.2s;
}
.floating-back-btn:active { transform: scale(0.9); }
.back-arrow { font-size: 32px; color: var(--text-ink, #1E293B); font-weight: 300; margin-top: -4px; margin-right: 2px; }


/* 2. 布局逻辑 */
.login-scroll-view { position: relative; z-index: 10; height: 100%; }
.content-container { 
  min-height: 100%; display: flex; flex-direction: column; 
  padding: 0 44px;
}

/* 品牌区 */
.brand-section { padding-top: 100px; margin-bottom: 50px; display: flex; flex-direction: column; align-items: center; }
.brand-logo-wrap { 
  /* logo 已改用透明底，插图自带落地阴影；
     这里再留 box-shadow 会画出一圈方形光晕，反而不融合。 */
  width: 90px; height: 90px;
}
.brand-logo-img { width: 100%; height: 100%; display: block; }

.brand-titles { text-align: center; margin-top: 24px; }
.app-name { font-size: 34px; font-weight: 600; color: var(--text-ink, #1E293B); letter-spacing: 0; }
.app-motto { font-size: 14px; font-weight: 600; color: var(--text-muted, #94A3B8); margin-top: 8px; display: block; letter-spacing: 1px; }

/* 交互区 */
.form-area { margin-top: 20px; margin-bottom: 20px; }
.welcome-text { text-align: center; margin-bottom: 44px; }
.h1 { font-size: 26px; font-weight: 600; color: var(--text-ink, #1E293B); display: block; }
.p { font-size: 14px; font-weight: 600; color: var(--text-muted, #94A3B8); margin-top: 12px; display: block; }

.btn-main {
  width: 100%;
  height: 72px;
  border-radius: var(--radius-lg, 16px);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--primary-color, #2f5d6b);
  box-shadow: 0 14px 36px var(--primary-glow, rgba(47, 93, 107, 0.32));
  transition: transform 0.25s ease, background 0.35s ease, box-shadow 0.35s ease;
}
.btn-main::after { border: none; }
.btn-main:active { transform: scale(0.97); opacity: 0.92; }
.btn-wx,
.btn-login {
  background: var(--primary-color, #2f5d6b);
}
.btn-emoji { font-size: 24px; }
.btn-txt { font-size: 17px; font-weight: 600; color: #FFFFFF; letter-spacing: 0.5px; }

.security-hint { font-size: 11px; font-weight: 600; color: var(--text-faint, #CBD5E1); text-align: center; display: block; margin-top: 24px; text-transform: uppercase; }

/* 账号密码模式 */
.input-stack { display: flex; flex-direction: column; gap: 18px; margin-bottom: 32px; }
.field-item { 
  background: rgba(248, 250, 252, 0.6); border: 1.5px solid #F1F5F9; 
  height: 68px; border-radius: var(--radius-lg, 16px); padding: 0 24px; 
  display: flex; align-items: center; gap: 16px; transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s, opacity 0.3s, transform 0.3s;
}
.field-item.is-focus { border-color: var(--primary-color, #2F5D6B); background: #fff; box-shadow: 0 10px 30px var(--primary-glow, rgba(47, 93, 107, 0.05)); }
.f-icon { font-size: 18px; opacity: 0.3; }
.f-input { flex: 1; font-size: 16px; font-weight: 600; color: var(--text-ink, #1E293B); }

.form-links { display: flex; justify-content: space-between; padding: 0 10px; margin-top: 10px; }
.link-txt { font-size: 13px; font-weight: 600; color: var(--text-muted, #94A3B8); }

/* 切换区 */
.switcher-zone { margin-bottom: 40px; }
.line-divider { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
.l-line { flex: 1; height: 1rpx; background: rgba(226, 232, 240, 0.8); }
.l-txt { font-size: 11px; font-weight: 600; color: var(--text-faint, #CBD5E1); text-transform: uppercase; letter-spacing: 1.5px; }

.mode-toggle-btn { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 10px; }
.toggle-icon-bg {
  width: 40px;
  height: 40px;
  background: var(--primary-soft, #e9f0f2);
  border-radius: var(--radius-md, 12px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  border: 1px solid transparent;
  transition: background 0.35s ease;
}
.t-label { font-size: 15px; font-weight: 600; color: var(--primary-color, #2F5D6B); }

/* 协议区 - 底部流式锚定 */
.agreement-footer { 
  margin-top: auto; padding-bottom: 30px; 
  display: flex; align-items: flex-start; justify-content: center; gap: 12px;
}
.check-box-outer { padding-top: 2px; }
.check-box-inner { 
  width: 20px; height: 20px; border-radius: var(--radius-sm, 8px); border: 2px solid var(--line-hairline, #E2E8F0);
  display: flex; align-items: center; justify-content: center; transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s, transform 0.2s;
  background: #FFFFFF;
}
.check-box-inner.is-checked { background: var(--primary-color, #2F5D6B); border-color: var(--primary-color, #2F5D6B); }

.agreement-content { font-size: 12px; font-weight: 600; line-height: 1.6; }
.ag-gray { color: var(--text-muted, #94A3B8); }
.ag-blue { color: var(--text-ink, #1E293B); border-bottom: 1px solid #F1F5F9; margin: 0 4px; }

.bottom-safe-area { height: env(safe-area-inset-bottom); margin-top: 10px; }

/* 动画库 */
.animate-slide-down { animation: slideDown 0.8s cubic-bezier(0.32, 0.72, 0, 1) both; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }

.animate-fade-in { animation: fadeIn 0.8s ease-out both; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.animate-pop { margin-top: 40px;animation: pop 0.6s cubic-bezier(0.32, 0.72, 0, 1) both; }
@keyframes pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }

.shake-active { animation: shake 0.5s both; }
@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  30%, 70% { transform: translate3d(-3px, 0, 0); }
  50% { transform: translate3d(2px, 0, 0); }
}
</style>
