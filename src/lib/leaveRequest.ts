export type LeaveRequestDraft = {
  fatigue: number | null
  offWorkTime: string
  reason: string
}

export function validateLeaveRequest(draft: LeaveRequestDraft) {
  if (!draft.offWorkTime.trim()) return '请填写今天的下班时间，管理端会按这个判断是否准假。'
  if (!draft.offWorkTime.match(/^([01]\d|2[0-3]):[0-5]\d$/)) return '请填写有效的下班时间。'
  if (!draft.fatigue || draft.fatigue < 1 || draft.fatigue > 5) return '请选择今天的疲劳度。'
  return null
}

export function buildLeaveRequestReason(draft: LeaveRequestDraft) {
  const reason = draft.reason.trim() || '未填写'
  return `下班时间 ${draft.offWorkTime.trim()}；疲劳度 ${draft.fatigue}/5；理由：${reason}`
}
