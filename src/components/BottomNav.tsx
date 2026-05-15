import { BarChart3, CalendarDays, ClipboardCheck, Home, ReceiptText, WalletCards } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { Role } from '../lib/types'

const studentItems = [
  ['/', '今日', Home],
  ['/plan', '计划', CalendarDays],
  ['/checkin', '打卡', ClipboardCheck],
  ['/ledger', '账本', ReceiptText],
] as const

const coachItems = [
  ['/admin', '总览', Home],
  ['/admin/review', '审核', ClipboardCheck],
  ['/admin/payments', '罚款', WalletCards],
  ['/admin/stats', '统计', BarChart3],
] as const

export default function BottomNav({ role }: { role: Role }) {
  const items = role === 'coach' ? coachItems : studentItems

  return (
    <nav className="bottom-nav">
      {items.map(([to, label, Icon]) => (
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} key={to} to={to} end={to === '/' || to === '/admin'}>
          <Icon size={21} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
