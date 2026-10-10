#!/usr/bin/env node
/**
 * 生成 MingCute 图标视觉对照页 design-previews/icon-mapping.html。
 *
 * 数据源：@iconify-json/mingcute（Apache-2.0）
 * 运行：node scripts/generate-icon-mapping.js
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const root = path.resolve(__dirname, '..')
const dataFile = process.argv[2] || path.join(os.tmpdir(), 'mingcute-icons.json')

if (!fs.existsSync(dataFile)) {
  console.error('缺少图标数据，请先下载：')
  console.error('  Invoke-WebRequest "https://cdn.jsdelivr.net/npm/@iconify-json/mingcute@1.2.2/icons.json" -OutFile "$env:TEMP\\mingcute-icons.json"')
  process.exit(1)
}

const iconset = JSON.parse(fs.readFileSync(dataFile, 'utf8'))

/** 每个条目：[mingcute 名, 中文语义, 被替代的 emoji] */
const GROUPS = {
  支出分类: [
    ['dinner', '餐饮', '🍜'],
    ['fork-knife', '餐具 / 外食', '🍜'],
    ['bowl', '面碗 / 便餐', '🍜'],
    ['car', '交通', '🚗'],
    ['shopping-bag-3', '购物', '🛍'],
    ['home-5', '居住', '🏠'],
    ['flash', '水电', '💡'],
    ['first-aid-kit', '医疗', '💊'],
    ['book-2', '教育', '📚'],
    ['game-2', '娱乐', '🎮'],
    ['gift-2', '人情', '🎁'],
    ['cat', '宠物', '🐾'],
    ['puzzled', '其他 / 未分类', '📦']
  ],
  收入分类: [
    ['receive-money', '工资', '💰'],
    ['pig-money', '存钱 / 工资备选', '💰'],
    ['trophy', '奖金', '🏆'],
    ['chart-line', '投资收益', '📈'],
    ['file-certificate', '兼职', '🧾'],
    ['red-packet', '红包', '🧧'],
    ['counter-2', '报销', '🧮'],
    ['card-refund', '退款', '💳'],
    ['add-circle', '其他收入', '➕']
  ],
  支付方式: [
    ['wechat', '微信支付', '💚'],
    ['alipay', '支付宝', '💙'],
    ['bank-card', '银行卡', '💳'],
    ['wallet-3', '信用卡', '💳'],
    ['cash-2', '现金', '💵'],
    ['coin', '零钱 / 备用金', '🪙']
  ],
  空间与成员: [
    ['home-1', '家庭', '🏠'],
    ['home-2', '家宅', '🏡'],
    ['group-2', '成员组合', '👨‍👩‍👧'],
    ['love', '情侣', '💞'],
    ['sofa', '合租', '🛋'],
    ['airplane', '旅行', '✈️'],
    ['baby', '宝宝', '🍼'],
    ['briefcase', '工作', '💼'],
    ['run', '运动', '🏃'],
    ['luggage', '旅行箱', '🧳'],
    ['star-2', '星星', '⭐'],
    ['leaf', '植物', '🌱'],
    ['aiming-2', '目标', '🎯'],
    ['ticket', '票据', '🧾'],
    ['notebook-2', '账本', '📒'],
    ['palette-2', '自定义', '🎨']
  ],
  功能模块: [
    ['bill', '家庭账本', '💰'],
    ['list-check-3', '家庭清单', '📋'],
    ['calendar-2', '日程提醒', '📅'],
    ['sparkles-2', '家庭动态', '✨']
  ],
  页面UI: [
    ['notification', '通知铃铛', '🔔'],
    ['search-2', '搜索', '🔍'],
    ['chart-pie', '统计分析', '📊'],
    ['bank-card', '资产账户', '💳'],
    ['transfer-horizontal', '切换账本', '⇄'],
    ['user-2', '成员 / 经办', '👤'],
    ['safe-shield', '权限 / 安全', '🔐'],
    ['download-2', '导入账单', '📥'],
    ['file-upload', '导出账单', '📤'],
    ['settings-3', '设置', '⚙️'],
    ['camera', '改头像', '📸'],
    ['rocket', '版本发布', '🚀'],
    ['bug', 'Bug 修复', '🐞'],
    ['fire', '连续记录', '🔥'],
    ['alert', '预算预警', '⚠️'],
    ['vip-2', '创建者', '👑'],
    ['eye', '只读角色', '👁'],
    ['exit-door', '退出登录', '🚪'],
    ['mail', '消息', '📬'],
    ['sun', '白天提醒', '☀'],
    ['moon', '夜间提醒', '🌙'],
    ['finger-swipe', '左滑引导', '👆'],
    ['question', '帮助', '❓'],
    ['information', '提示', 'ℹ'],
    ['check-2', '选中勾', '✓'],
    ['history', '历史', '🕘'],
    ['idcard', '身份', '🪪'],
    ['cellphone', '设备', '📲'],
    ['air-balloon', '庆祝', '🎈'],
    ['medal', '勋章', '🏅'],
    ['arrow-right-up', '跳转', '↗'],
    ['arrow-right', '右箭头', '→'],
    ['arrow-down', '下拉', '▾'],
    ['attachment', '附件', '📎'],
    ['file', '文件', '📄'],
    ['pencil', '编辑', '✏'],
    ['edit-2', '编辑任务', '✏️'],
    ['delete-2', '删除', '🗑️'],
    ['lock', '锁定', '🔒'],
    ['cake', '生日', '🎂'],
    ['clock-2', '倒计时', '⏳'],
    ['clock', '时钟（圆形）', '🕐'],
    ['tag', '标签', '🏷️'],
    ['mail-open', '空信箱', '📭'],
    ['shopping-cart-2', '购物车', '🛒'],
    ['alert-octagon', '紧急提醒', '🚨'],
    ['close', '关闭', '✕'],
    ['add', '新增', '＋'],
    ['arrow-up', '上升', '↑'],
    ['arrow-right-down', '右下', '↘'],
    ['arrow-left', '左箭头', '←']
  ]
}

const THEMES = {
  daiqing: { name: '黛青（默认）', primary: '#2F5D6B', soft: '#E9F0F2', bg: '#F6F8F8' },
  nuanzhe: { name: '暖赭', primary: '#6F5643', soft: '#F3EDE7', bg: '#FAF7F3' }
}

const okGroups = {}
let total = 0
let missing = []
for (const [cat, items] of Object.entries(GROUPS)) {
  okGroups[cat] = []
  for (const [name, cn, emoji] of items) {
    const line = iconset.icons[`${name}-line`]
    const fill = iconset.icons[`${name}-fill`]
    if (line) {
      okGroups[cat].push({ name, cn, emoji, line: line.body, fill: fill ? fill.body : null })
      total += 1
    } else {
      missing.push(`${cat}/${name}`)
    }
  }
}

const svgJson = JSON.stringify(okGroups).replace(/<\//g, '<\\/')

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MingCute 图标对照表 · Roomie</title>
<style>
  :root {
    --ink:#1E293B; --sub:#64748B; --muted:#94A3B8; --line:#E8EEEF;
    --page:#F6F8F8; --card:#fff; --primary:#2F5D6B; --soft:#E9F0F2;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif; background:var(--page); color:var(--ink); padding:24px 20px 80px; line-height:1.6; transition: background-color .2s; }
  .wrap { max-width:1080px; margin:0 auto; }
  h1 { font-size:22px; font-weight:600; margin-bottom:4px; }
  .sub { font-size:13px; color:var(--sub); margin-bottom:20px; }
  .bar { position:sticky; top:0; background:var(--page); padding:12px 0; display:flex; gap:8px; align-items:center; flex-wrap:wrap; z-index:10; border-bottom:1px solid var(--line); margin-bottom:16px; transition: background-color .2s; }
  .bar .label { font-size:13px; color:var(--sub); }
  .btn { border:1px solid var(--line); background:var(--card); border-radius:999px; padding:6px 16px; font-size:13px; cursor:pointer; color:var(--ink); }
  .btn.on[data-theme] { background:var(--primary); color:#fff; border-color:var(--primary); }
  .btn.on[data-fill] { background:var(--ink); color:#fff; border-color:var(--ink); }
  h2 { font-size:16px; font-weight:600; margin:28px 0 12px; padding-left:10px; border-left:3px solid var(--primary); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px; }
  .cell { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; display:flex; align-items:center; gap:12px; transition: background-color .2s, border-color .2s; }
  .ico-wrap { width:44px; height:44px; border-radius:10px; background:var(--soft); display:flex; align-items:center; justify-content:center; flex:none; transition: background-color .2s; }
  .ico-wrap svg { width:24px; height:24px; }
  .ico-wrap.big svg { width:32px; height:32px; }
  .meta { min-width:0; flex:1; }
  .cn { font-size:14px; font-weight:500; }
  .name { font-size:11px; color:var(--muted); font-family:ui-monospace,'SFMono-Regular',monospace; margin-top:2px; }
  .old { font-size:12px; color:var(--sub); margin-top:2px; }
  .old .emoji { font-size:16px; }
  .pair { margin-top:6px; display:flex; gap:6px; align-items:center; }
  .pair svg { width:15px; height:15px; }
  .pair .tag { font-size:10px; color:var(--muted); }
  .note { font-size:12px; color:var(--sub); background:var(--card); border:1px dashed var(--line); border-radius:10px; padding:10px 14px; margin-top:24px; line-height:1.8; }
  .note b { color: var(--ink); }
  @media (max-width:600px){ .grid{ grid-template-columns:1fr 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>MingCute 图标对照表</h1>
  <div class="sub">Roomie 记账小程序 · emoji 替换方案 · ${total} 个图标 · 线性 / 填充双态 · 颜色跟随主题</div>
  <div class="bar">
    <span class="label">主题：</span>
    <button class="btn on" data-theme="daiqing">黛青</button>
    <button class="btn" data-theme="nuanzhe">暖赭</button>
    <span style="width:16px"></span>
    <span class="label">形态：</span>
    <button class="btn on" data-fill="line">线性（默认态）</button>
    <button class="btn" data-fill="fill">填充（选中态）</button>
  </div>
  <div id="content"></div>
  <div class="note">
    <b>说明</b><br>
    · 表内是 MingCute 真实 SVG 渲染，非截图；<b>currentColor</b> 上色，切主题即见真实跟随效果。<br>
    · 每格右下角小图标是该图标的 <b>line / fill</b> 双态预览，加亮的一侧是当前形态。tabBar 未选中用 line，选中用 fill。<br>
    · 需要更强层次感时，Solar 的 <b>-bold-duotone</b> 变体是主色 + 50% 副色（可另出对照）。<br>
    ${missing.length ? `<b style="color:#C4554D">缺失未列入：${missing.join('、')}</b>` : '所需图标在 MingCute 中全部成对可用。'}
  </div>
</div>
<script>
const DATA = INJECT_SVG_JSON;
const GROUPS = INJECT_SVG_JSON;
let currentFill = 'line';
let currentTheme = 'daiqing';

const THEMES = {
  daiqing: { name: '黛青（默认）', primary: '#2F5D6B', soft: '#E9F0F2', bg: '#F6F8F8' },
  nuanzhe: { name: '暖赭', primary: '#6F5643', soft: '#F3EDE7', bg: '#FAF7F3' }
};

function render() {
  const t = THEMES[currentTheme];
  const r = document.documentElement.style;
  r.setProperty('--primary', t.primary);
  r.setProperty('--soft', t.soft);
  r.setProperty('--page', t.bg);
  const el = document.getElementById('content');
  let html = '';
  for (const [cat, items] of Object.entries(GROUPS)) {
    if (!items.length) continue;
    html += '<h2>' + cat + '</h2><div class="grid">';
    for (const it of items) {
      const d = it;
      if (!d) continue;
      const body = d[currentFill] || d.line;
      html += '<div class="cell"><div class="ico-wrap' + (currentFill === 'fill' ? ' big' : '') + '">'
        + '<svg viewBox="0 0 24 24" fill="currentColor">' + body + '</svg></div>'
        + '<div class="meta"><div class="cn">' + it.cn + '</div>'
        + '<div class="name">' + it.name + '</div>'
        + '<div class="old">替代 <span class="emoji">' + it.emoji + '</span></div>'
        + '<div class="pair">';
      if (d.line) html += '<svg viewBox="0 0 24 24" fill="currentColor" style="opacity:' + (currentFill === 'line' ? 1 : .35) + '">' + d.line + '</svg>';
      if (d.fill) html += '<svg viewBox="0 0 24 24" fill="currentColor" style="opacity:' + (currentFill === 'fill' ? 1 : .35) + '">' + d.fill + '</svg>';
      html += '</div></div></div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

document.querySelectorAll('.btn[data-theme]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.btn[data-theme]').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  currentTheme = b.dataset.theme;
  render();
}));
document.querySelectorAll('.btn[data-fill]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.btn[data-fill]').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  currentFill = b.dataset.fill;
  render();
}));
render();
</script>
</body>
</html>
`

const finalHtml = html
  .split('INJECT_SVG_JSON').join(svgJson)
  .split('INJECT_SVG_JSON').join(svgJson)

const outDir = path.join(root, 'design-previews')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'icon-mapping.html')
fs.writeFileSync(outFile, finalHtml, 'utf8')
console.log(`生成 ${path.relative(root, outFile)}`)
console.log(`图标数: ${total}${missing.length ? `（缺失: ${missing.join(', ')}）` : ''}`)
console.log(`大小: ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`)
