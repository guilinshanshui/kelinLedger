/**
 * 账单导入页的数据适配层。
 *
 * 云函数返回的是可持久化的原始结构；页面需要的是带编辑状态、重复标记和
 * 商户批处理提示的视图模型。这里集中处理转换，避免页面散落临时字段判断。
 */

export function sanitizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .replace(/^[-—/]+$/, '')
}

export function getApiMessage(response) {
  if (!response) return '操作失败'
  return response.message || response.msg || '操作失败'
}

function amountOf(row) {
  const value = Number(row.amount)
  if (Number.isFinite(value)) return value
  const minor = Number(row.amountMinor)
  return Number.isFinite(minor) ? minor / 100 : 0
}

export function displayRowCounterparty(row = {}) {
  return (
    sanitizeText(row.merchant) ||
    sanitizeText(row.product) ||
    sanitizeText(row.note) ||
    '未知交易对方'
  )
}

export function getRowMerchantKey(row = {}) {
  return sanitizeText(row.merchantKey) || sanitizeText(row.merchant).toLowerCase()
}

export function toEditableRow(raw = {}, index = 0) {
  const categoryId = raw.categoryId || ''
  const payMethodId = raw.payMethodId || ''
  const categorySource = categoryId ? (raw.remembered ? 'remembered' : 'fallback') : ''
  const needsReview = !categoryId

  return {
    ...raw,
    index,
    status: raw.duplicate ? 'duplicate' : 'importable',
    statusMessage: raw.duplicate ? '已导入' : '',
    selected: raw.duplicate ? false : raw.selected !== false,
    amount: amountOf(raw),
    entryTime: raw.occurredAt || raw.createTime || '',
    product: sanitizeText(raw.product || raw.note),
    merchant: sanitizeText(raw.merchant),
    merchantKey: getRowMerchantKey(raw),
    type: raw.type === 'income' ? 'income' : 'expense',
    categoryId,
    categoryLabel: sanitizeText(raw.categoryLabel || raw.categoryName),
    payMethodId,
    payLabel: sanitizeText(raw.payMethodName || raw.payLabel),
    editedCategoryId: categoryId,
    editedCategoryLabel: sanitizeText(raw.categoryLabel || raw.categoryName),
    editedPayId: payMethodId,
    editedPayLabel: sanitizeText(raw.payMethodName || raw.payLabel),
    categorySource,
    needsReview,
    reviewHint: needsReview ? '请选择分类' : ''
  }
}

export function toConfirmRow(row = {}) {
  return {
    rowId: row.rowId,
    selected: true,
    type: row.type === 'income' ? 'income' : 'expense',
    amountMinor: Number(row.amountMinor) || Math.round(amountOf(row) * 100),
    amount: amountOf(row),
    occurredAt: row.occurredAt || row.entryTime,
    merchant: row.merchant || '',
    merchantKey: getRowMerchantKey(row),
    product: row.product || '',
    note: row.note || '',
    tradeNo: row.tradeNo || '',
    categoryId: row.editedCategoryId || row.categoryId || '',
    payMethodId: row.editedPayId || row.payMethodId || '',
    payMethodName: row.editedPayLabel || row.payLabel || ''
  }
}

export function markRowCategoryResolved(row, categoryId, categoryLabel) {
  return {
    ...row,
    editedCategoryId: categoryId,
    editedCategoryLabel: categoryLabel,
    categorySource: 'manual',
    needsReview: false,
    reviewHint: ''
  }
}

export function countReviewRows(rows = []) {
  return rows.filter((row) => row.status !== 'duplicate' && row.needsReview).length
}

export function countMerchantPendingRows(rows = [], merchantKey, exceptIndex) {
  if (!merchantKey) return 0
  return rows.filter(
    (row) =>
      row.index !== exceptIndex &&
      row.status !== 'duplicate' &&
      getRowMerchantKey(row) === merchantKey &&
      !row.editedCategoryId
  ).length
}

export function applyCategoryToMerchantRows(rows = [], merchantKey, categoryId, categoryLabel, exceptIndex) {
  let count = 0
  const next = rows.map((row) => {
    if (
      row.index === exceptIndex ||
      row.status === 'duplicate' ||
      getRowMerchantKey(row) !== merchantKey
    ) {
      return row
    }
    count += 1
    return markRowCategoryResolved(row, categoryId, categoryLabel)
  })
  return { rows: next, count }
}

export function recomputeMerchantHints(rows = [], existingHints = []) {
  const groups = new Map()
  rows.forEach((row) => {
    if (row.status === 'duplicate') return
    const key = getRowMerchantKey(row)
    if (!key) return
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  })

  const computed = []
  groups.forEach((items, merchantKey) => {
    if (items.length < 2) return
    const ids = [...new Set(items.map((item) => item.editedCategoryId || item.categoryId).filter(Boolean))]
    const suggestedCategoryId = ids.length === 1 ? ids[0] : ''
    const categoryLabel = items.find((item) => item.editedCategoryLabel)?.editedCategoryLabel || ''
    const merchant = items[0].merchant || items[0].product || '该商户'

    if (ids.length > 1) {
      computed.push({
        merchantKey,
        merchant,
        hintMessage: `「${merchant}」的 ${items.length} 条记录分类不一致`,
        suggestedCategoryId,
        suggestedCategoryLabel: categoryLabel
      })
    } else if (!ids.length) {
      computed.push({
        merchantKey,
        merchant,
        hintMessage: `「${merchant}」有 ${items.length} 条记录待选择分类`,
        suggestedCategoryId: '',
        suggestedCategoryLabel: ''
      })
    }
  })

  const known = new Set(computed.map((item) => item.merchantKey))
  const preserved = (existingHints || []).filter((item) => item.merchantKey && !known.has(item.merchantKey))
  return [...computed, ...preserved]
}

export function applyMerchantSuggestion(rows = [], hint = {}) {
  if (!hint.merchantKey || !hint.suggestedCategoryId) return { rows, count: 0 }
  return applyCategoryToMerchantRows(
    rows,
    hint.merchantKey,
    hint.suggestedCategoryId,
    hint.suggestedCategoryLabel || '',
    -1
  )
}

export function getCategorySourceTag(source) {
  return {
    manual: '手动选择',
    remembered: '已记住',
    fallback: '待确认'
  }[source] || ''
}
