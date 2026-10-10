#!/usr/bin/env node
/**
 * 主题色机械化替换：把 <style> 块里硬编码的主题色改成 var() 引用。
 *
 * 只处理样式块；已在 var() 回退里的色值跳过；App.vue（变量定义处）跳过。
 * 幂等：重复运行不会再改动。
 *
 * 运行：node scripts/normalize-theme-colors.js
 */

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const SKIP = ['node_modules', 'unpackage', 'dist', '.git', '.debug']

const MAP = [
  ['#2F5D6B', '--primary-color'],
  ['#6F5643', '--primary-color'],
  ['#E9F0F2', '--primary-soft'],
  ['#F3EDE7', '--primary-soft'],
  ['#1E293B', '--text-ink'],
  ['#2E2A26', '--text-ink'],
  ['#64748B', '--text-sub'],
  ['#6B625A', '--text-sub'],
  ['#94A3B8', '--text-muted'],
  ['#A1968A', '--text-muted'],
  ['#E8EEEF', '--line-hairline'],
  ['#EFE8E0', '--line-hairline'],
  ['#F6F8F8', '--bg-page'],
  ['#FAF7F3', '--bg-page'],
  ['#C4554D', '--color-expense'],
  ['#C0453C', '--color-expense'],
  ['#3E8E6E', '--color-income'],
  ['#4F8A63', '--color-income']
,

  // 支出/收入：历史上混用了 Tailwind 红绿，统一收口到语义变量
  ['#F43F5E', '--color-expense'],
  ['#EF4444', '--color-expense'],
  ['#DC2626', '--color-expense'],
  ['#E11D48', '--color-expense'],
  ['#FFF1F2', '--color-expense-soft'],
  ['#FEE2E2', '--color-expense-soft'],
  ['#FECDD3', '--color-expense-soft'],
  ['#FFE4E6', '--color-expense-soft'],
  ['#10B981', '--color-income'],
  ['#059669', '--color-income'],
  ['#ECFDF5', '--color-income-soft'],
  ['#D1FAE5', '--color-income-soft'],

  // 次级色 / 危险色：旧字面量
  ['#416F7B', '--secondary-color'],
  ['#8A6B53', '--secondary-color'],
  ['#D96A63', '--color-danger'],
  ['#CE6259', '--color-danger'],

  // 警示文案：纯 amber 在白底上只有 2.15:1，收口到可读的深琥珀色
  ['#F59E0B', '--color-warning'],
  ['#D97706', '--color-warning'],
  ['#FFFBEB', '--color-warning-soft'],

  // 中性文本：历史上混用了 slate / gray 两套灰
  ['#0F172A', '--text-ink'],
  ['#1F2937', '--text-ink'],
  ['#334155', '--text-ink'],
  ['#475569', '--text-sub'],
  ['#607080', '--text-sub'],
  ['#CBD5E1', '--text-faint'],
  ['#a8b3c3', '--text-faint'],
  ['#B6C2D1', '--text-faint'],

  // 分隔线：不同时期的浅灰边框
  ['#E2E8F0', '--line-hairline'],
  ['#dfe5ee', '--line-hairline'],
  ['#d8dee8', '--line-hairline'],

  // 调度模块遗留的紫罗兰配色，收口回主题主色
  ['#635BFF', '--primary-color'],
  ['#F5F3FF', '--primary-soft'],
  ['#EDE9FE', '--primary-soft'],
  ['#E0E7FF', '--primary-soft'],
  ['#F0F9FF', '--primary-soft'],
  ['#DDD6FE', '--primary-soft'],
  ['#C7D2FE', '--primary-soft'],
  ['#C4B5FD', '--primary-soft'],
  ['#A78BFA', '--secondary-color'],
  ['#312E81', '--text-ink'],

  // 收入绿 / 转账暖棕：同样是遗留字面量
  ['#F0FDF4', '--color-income-soft'],
  ['#DCFCE7', '--color-income-soft'],
  ['#A7F3D0', '--color-income-soft'],
  ['#86EFAC', '--color-income-soft'],
  ['#FBF3EC', '--primary-soft'],
  ['#B0603F', '--secondary-color']
]

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, result)
    else if (/\.(vue|css|scss)$/.test(entry.name)) result.push(full)
  }
  return result
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function transformStyleBlock(block) {
  let out = block
  let count = 0
  for (const [hex, cssVar] of MAP) {
    // 不在 var(--xxx,  回退位里的裸色值才替换
    const re = new RegExp(`(?<!var\\(--[a-z-]+,\\s*)${escapeRegex(hex)}(?![0-9A-Fa-f])`, 'gi')
    out = out.replace(re, (match) => {
      count += 1
      return `var(${cssVar}, ${match.toUpperCase()})`
    })
  }
  return { text: out, count }
}

const files = walk(root)
let totalReplacements = 0
let filesChanged = 0

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/')
  // App.vue 定义变量本身，必须保留字面量
  if (rel === 'App.vue') continue

  const source = fs.readFileSync(file, 'utf8')
  let result = source
  let fileCount = 0

  result = result.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (m, open, body, close) => {
    const { text, count } = transformStyleBlock(body)
    fileCount += count
    return open + text + close
  })

  if (fileCount > 0) {
    fs.writeFileSync(file, result, 'utf8')
    filesChanged += 1
    totalReplacements += fileCount
    console.log(`${rel}: ${fileCount} 处`)
  }
}

console.log(`\n共替换 ${totalReplacements} 处，涉及 ${filesChanged} 个文件`)
