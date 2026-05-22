import type { CheckInStatus, PenaltyStatus } from '../lib/types'

const checkInLabel: Record<CheckInStatus, string> = {
  completed: '已完成',
  excused: '已请假',
  missed: '缺卡',
  pending_review: '待审核',
}

const penaltyLabel: Record<PenaltyStatus, string> = {
  pending: '待贡献',
  payment_reported: '等待入账',
  paid: '已入账',
  waived: '已豁免',
}

export default function StatusPill({ status }: { status: CheckInStatus | PenaltyStatus }) {
  const label = status in checkInLabel ? checkInLabel[status as CheckInStatus] : penaltyLabel[status as PenaltyStatus]
  return (
    <span className={`status-pill ${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  )
}
