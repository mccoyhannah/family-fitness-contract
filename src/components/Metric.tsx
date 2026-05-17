import type { ReactNode } from 'react'

export default function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <div className="metric-copy">
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
      <span className="metric-bar" aria-hidden="true" />
    </div>
  )
}
