export type LeaveRequestDraft = {
  fatigue: number | null
  offWorkTime: string
  reason: string
}

export type ParsedLeaveRequest = {
  arrivalRange: string
  fatigueText: string
  reason: string
}

export const WAIVER_REQUEST_PREFIX = '[免罚申请]'

export type LeaveArrangementStatus = 'excused' | 'pending_review'

export function validateLeaveRequest(draft: LeaveRequestDraft) {
  if (!draft.offWorkTime.trim()) return '请选择今天的到家时间段，管理端会按这个判断是否准假。'
  if (!isValidTimeRange(draft.offWorkTime)) return '请选择有效的到家时间段。'
  if (!draft.fatigue || draft.fatigue < 1 || draft.fatigue > 5) return '请选择今天的疲劳度。'
  return null
}

export function buildLeaveRequestReason(draft: LeaveRequestDraft) {
  const parts = [
    `到家时间段 ${draft.offWorkTime.trim()}`,
    `疲劳度 ${draft.fatigue}/5`,
  ]
  const reason = draft.reason.trim()
  if (reason) parts.push(`理由：${reason}`)
  return parts.join('；')
}

export function isWaiverRequestReason(value?: string | null) {
  return Boolean(value?.includes(WAIVER_REQUEST_PREFIX))
}

export function hasLeaveRequestReason(value?: string | null) {
  const trimmed = value?.trim() || ''
  return Boolean(trimmed && !isWaiverRequestReason(trimmed))
}

export function isLeaveArrangementCheckIn<T extends { leave_reason?: string | null; status: string }>(
  checkIn?: T | null,
): checkIn is T & { leave_reason: string; status: LeaveArrangementStatus } {
  return Boolean(
    checkIn &&
    (checkIn.status === 'excused' || checkIn.status === 'pending_review') &&
    hasLeaveRequestReason(checkIn.leave_reason),
  )
}

export function leaveArrangementStatusLabel(status: LeaveArrangementStatus | string) {
  return status === 'pending_review' ? '请假待审核' : '已请假'
}

export function parseLeaveRequestReason(value?: string | null): ParsedLeaveRequest {
  const cleaned = value?.trim() || ''
  if (!cleaned || isWaiverRequestReason(cleaned)) return { arrivalRange: '', fatigueText: '', reason: '' }

  const unmatched: string[] = []
  let arrivalRange = ''
  let fatigueText = ''

  cleaned
    .split(/[；;]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .forEach((segment) => {
      const arrivalMatch = segment.match(/^(?:到家时间段|到家时间|下班时间)\s*[:：]?\s*(.+)$/)
      if (arrivalMatch?.[1]) {
        arrivalRange = arrivalMatch[1].trim()
        return
      }

      const fatigueMatch = segment.match(/^疲劳(?:度)?\s*[:：]?\s*(.+)$/)
      if (fatigueMatch?.[1]) {
        fatigueText = fatigueMatch[1].trim()
        return
      }

      const reasonMatch = segment.match(/^理由\s*[:：]\s*(.+)$/)
      if (reasonMatch?.[1]) {
        const reasonText = reasonMatch[1].trim()
        if (!isEmptyDisplayText(reasonText)) unmatched.push(reasonText)
        return
      }

      if (!isEmptyDisplayText(segment)) unmatched.push(segment)
    })

  return {
    arrivalRange,
    fatigueText,
    reason: unmatched.join('；'),
  }
}

export function formatLeaveRequestSummary(value?: string | null, fallbackFatigue?: number | null) {
  const parsed = parseLeaveRequestReason(value)
  const parts = []
  if (parsed.arrivalRange) parts.push(`到家 ${parsed.arrivalRange}`)
  if (parsed.fatigueText) parts.push(`疲劳 ${parsed.fatigueText}`)
  else if (fallbackFatigue) parts.push(`疲劳 ${fallbackFatigue}/5`)
  if (parsed.reason) parts.push(parsed.reason)
  return parts.join(' · ')
}

function isEmptyDisplayText(value: string) {
  return ['未填写', '无', '没有'].includes(value.trim())
}

function isValidTimeRange(value: string) {
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return false
  const start = Number(match[1]) * 60 + Number(match[2])
  const end = Number(match[3]) * 60 + Number(match[4])
  return end > start
}
