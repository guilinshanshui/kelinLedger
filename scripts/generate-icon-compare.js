#!/usr/bin/env node
/**
 * 三套图标真实渲染对照：MingCute（单色线性）/ Solar line-duotone（双色线性）/ Fluent Color（真彩色）。
 * 输出 design-previews/icon-style-compare.html，开浏览器即看差异。
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const root = path.resolve(__dirname, '..')
const mcFile = path.join(os.tmpdir(), 'mingcute-icons.json')
const slFile = path.join(os.tmpdir(), 'solar-icons.json')
const fcFile = path.join(os.tmpdir(), 'fluent-color.json')

const mc = JSON.parse(fs.readFileSync(mcFile, 'utf8'))
const sl = JSON.parse(fs.readFileSync(slFile, 'utf8'))
const fc = JSON.parse(fs.readFileSync(fcFile, 'utf8'))

const ICONS = [
  { key: 'dinner',    cn: '餐饮', emoji: '🍜' },
  { key: 'bill',      cn: '账单/账本', emoji: '📒' },
  { key: 'home-5',    cn: '居住/家庭', emoji: '🏠' },
  { key: 'car',       cn: '交通', emoji: '🚗' },
  { key: 'shopping-bag-3', cn: '购物', emoji: '🛍' },
  { key: 'flash',     cn: '水电', emoji: '💡' },
  { key: 'book-2',    cn: '教育', emoji: '📚' },
  { key: 'cat',       cn: '宠物', emoji: '🐾' },
  { key: 'notification', cn: '通知', emoji: '🔔' },
  { key: 'calendar-2', cn: '日程', emoji: '📅' },
  { key: 'bank-card', cn: '银行卡', emoji: '💳' },
  { key: 'chart-pie', cn: '统计', emoji: '📊' },
  { key: 'receive-money', cn: '工资/收入', emoji: '💰' },
  { key: 'gift-2',    cn: '礼物', emoji: '🎁' },
  { key: 'star-2',    cn: '星星', emoji: '⭐' },
  { key: 'leaf',      cn: '植物', emoji: '🌱' },
  { key: 'notebook-2', cn: '笔记本', emoji: '📒' },
  { key: 'pig-money', cn: '存钱', emoji: '🐷' },
  { key: 'red-packet', cn: '红包', emoji: '🧧' }
]

function pickMc(key) {
  const n = `${key}-line`
  return mc.icons[n] ? mc.icons[n].body : null
}
function pickSl(key) {
  // solar 命名多为 wallet-line-duotone / car-line-duotone / home-line-duotone
  const candidates = [`${key}-line-duotone`, `${key}-duotone`, `wallet-${key}-line-duotone`, `${key}-linear`]
  for (const c of candidates) {
    if (sl.icons[c]) return { body: sl.icons[c].body, width: sl.icons[c].width || 24, height: sl.icons[c].height || 24 }
  }
  // 个别名字不同：wallet -> wallet-line-duotone 已在上面；receive-money -> bill-line-duotone
  const alias = {
    'receive-money': 'bill-line-duotone',
    'bank-card': 'card-line-duotone',
    'shopping-bag-3': 'bag-line-duotone',
    'notification': 'bell-line-duotone',
    'calendar-2': 'calendar-line-duotone',
    'book-2': 'book-2-line-duotone',
    'pig-money': 'piggy-bank-line-duotone',
    'red-packet': 'gift-line-duotone',
    'chart-pie': 'chart-line-duotone'
  }
  const a = alias[key]
  if (a && sl.icons[a]) return { body: sl.icons[a].body, width: sl.icons[a].width || 24, height: sl.icons[a].height || 24 }
  return null
}
function pickFc(key) {
  // fluent-color 带尺寸后缀；优先 24
  const sizes = ['-24', '-32', '-20', '-28', '-16', '-48']
  const alias = {
    'dinner': 'food',
    'bill': 'receipt',
    'home-5': 'home',
    'car': null,
    'shopping-bag-3': 'gift-card',
    'flash': 'alert',
    'book-2': 'book',
    'cat': null,
    'notification': 'alert',
    'calendar-2': 'calendar',
    'bank-card': 'contact-card',
    'chart-pie': 'data-pie',
    'receive-money': 'coin-multiple',
    'gift-2': 'gift-card',
    'star-2': 'star',
    'leaf': 'leaf',
    'notebook-2': 'notebook',
    'pig-money': null,
    'red-packet': 'gift'
  }
  const base = alias[key]
  if (!base) return null
  for (const s of sizes) {
    const n = base + s
    if (fc.icons[n]) return { body: fc.icons[n].body, width: fc.icons[n].width || 24, height: fc.icons[n].height || 24 }
  }
  return null
}

const rows = []
let mcOk = 0, slOk = 0, fcOk = 0
for (const it of ICONS) {
  const m = pickMc(it.key)
  const s = pickSl(it.key)
  const f = pickFc(it.key)
  if (m) mcOk++
  if (s) slOk++
  if (f) fcOk++
  rows.push({
    key: it.key, cn: it.cn, emoji: it.emoji,
    mc: m,
    sl: s ? s.body : null,
    slW: s ? s.width : 24, slH: s ? s.height : 24,
    fc: f ? f.body : null,
    fcW: f ? f.width : 24, fcH: f ? f.height : 24
  })
}

const payload = JSON.stringify(rows).replace(/<\//g, '<\\/')

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>图标风格三选一对照</title>
<style>
  :root { --ink:#1E293B; --sub:#64748B; --muted:#94A3B8; --line:#E8EEEF; --page:#F6F8F8; --card:#fff; --primary:#2F5D6B; --soft:#E9F0F2; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif; background:var(--page); color:var(--ink); padding:24px 20px 80px; }
  .wrap { max-width:1100px; margin:0 auto; }
  h1 { font-size:22px; font-weight:600; margin-bottom:4px; }
  .sub { font-size:13px; color:var(--sub); margin-bottom:18px; }
  .legend { display:flex; gap:14px; flex-wrap:wrap; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 16px; margin-bottom:18px; font-size:13px; color:var(--sub); }
  .legend b { color:var(--ink); }
  table { width:100%; border-collapse:separate; border-spacing:0; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  th, td { padding:12px 14px; text-align:left; border-bottom:1px solid var(--line); vertical-align:middle; }
  th { background:var(--soft); font-size:13px; font-weight:600; color:var(--ink); }
  tr:last-child td { border-bottom:none; }
  .emoji { font-size:18px; }
  .cn { font-size:14px; font-weight:500; }
  .name { font-size:11px; color:var(--muted); font-family:ui-monospace,monospace; margin-top:2px; }
  .cell-ico { width:56px; height:56px; border-radius:10px; background:var(--soft); display:flex; align-items:center; justify-content:center; }
  .cell-ico svg { width:28px; height:28px; }
  .miss { font-size:12px; color:#C4554D; }
  .note { margin-top:20px; font-size:12px; color:var(--sub); background:var(--card); border:1px dashed var(--line); border-radius:10px; padding:12px 16px; line-height:1.9; }
</style>
</head>
<body>
<div class="wrap">
  <h1>图标风格三选一对照</h1>
  <div class="sub">每行同一个语义，三列分别是 MingCute 单色线性 / Solar 双色线性（line-duotone）/ Fluent Color 真彩色（多色填充）。真实 SVG 渲染，非截图。</div>
  <div class="legend">
    <span><b>MingCute</b>：单色线性，最轻，主题色 100% 跟随</span>
    <span><b>Solar line-duotone</b>：双色线性，主色描边 + 50% 副色，主题色跟随</span>
    <span><b>Fluent Color</b>：真彩色多色填充，颜色固定，切肤不变</span>
  </div>
  <table>
    <thead>
      <tr><th style="width:160px">语义 / 现 emoji</th><th>MingCute 单色</th><th>Solar 双色线性</th><th>Fluent Color 彩色</th></tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <div class="note">
    <b>怎么选：</b><br>
    · 想要<b>彩色</b>：整页用 Fluent Color 做主图标（切肤时颜色不变，但多彩本身信息量大）；或只把空态插画/资产页这类展示位换彩色，列表、tabBar、分类这些操作位仍用单色，保持工具感。<br>
    · 想要<b>双色层次</b>又不想太实：用 Solar <b>*-line-duotone</b>（不是 bold-duotone），描边 + 半透明副色，比 MingCute 纯线多一点层次，比实心 fill 清爽。<br>
    · MingCute fill 选中态嫌粗壮，是库的特性；tabBar 也可以考虑用「线条变色 + 轻微加粗」而不是切到 fill。<br><br>
    <b>覆盖提醒：</b>微信支付、支付宝、红包、存钱罐这类带中文/品牌语义，MingCute 独一份，Solar 与 Fluent Color 没有完全对应，需混搭或自定义。本表覆盖率：MingCute ${mcOk}/18，Solar ${slOk}/18，Fluent Color ${fcOk}/18。
  </div>
</div>
<script>
const ROWS = ${payload};
const tbody = document.getElementById('rows');
ROWS.forEach(r => {
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><div class="emoji">' + r.emoji + '</div><div class="cn">' + r.cn + '</div><div class="name">' + r.key + '</div></td>' +
    '<td><div class="cell-ico">' + (r.mc ? '<svg viewBox="0 0 24 24" fill="currentColor">' + r.mc + '</svg>' : '<span class="miss">无</span>') + '</div></td>' +
    '<td><div class="cell-ico">' + (r.sl ? '<svg viewBox="0 0 ' + r.slW + ' ' + r.slH + '" fill="currentColor">' + r.sl + '</svg>' : '<span class="miss">无</span>') + '</div></td>' +
    '<td><div class="cell-ico">' + (r.fc ? '<svg viewBox="0 0 ' + r.fcW + ' ' + r.fcH + '" fill="currentColor">' + r.fc + '</svg>' : '<span class="miss">无</span>') + '</div></td>';
  tbody.appendChild(tr);
});
</script>
</body>
</html>
`

const outDir = path.join(root, 'design-previews')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'icon-style-compare.html')
fs.writeFileSync(outFile, html, 'utf8')
console.log(`生成 ${path.relative(root, outFile)}`)
console.log(`MingCute 可用 ${mcOk}/18 | Solar 可用 ${slOk}/18 | Fluent Color 可用 ${fcOk}/18`)
