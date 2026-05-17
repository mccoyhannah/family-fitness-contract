import StatusPill from '../../components/StatusPill'
import { notifyApp } from '../../components/AppNotice'
import { useAuth } from '../../hooks/useAuth'
import { usePenalties } from '../../hooks/usePenalties'
import { formatDay } from '../../lib/date'

export default function Ledger() {
  const { profile } = useAuth()
  const { penalties, updatePenalty } = usePenalties(profile?.id)
  const total = penalties.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0)
  const settled = penalties.filter((item) => item.status !== 'pending').length

  const markPaid = async (penaltyId: string) => {
    try {
      await updatePenalty(penaltyId, 'paid')
      notifyApp({ tone: 'success', message: '已提交付款确认，管理端会看到状态。' })
    } catch {
      notifyApp({ tone: 'warning', message: '付款确认失败，请检查网络后再试。' })
    }
  }

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <span className="hero-kicker">账本</span>
        <h2>待支付 ¥{total}</h2>
        <p>v2 先保留账本，不做微信收款码付款页。</p>
      </div>
      <div className="status-card action-card">
        <strong>{penalties.length} 条账款记录</strong>
        <p>{settled} 条已处理；如已线下付款，可先点“我已付款”等管理端确认。</p>
      </div>
      <div className="penalty-list">
        {penalties.length === 0 && <p className="muted">暂无罚款记录。请假不会生成待支付罚款。</p>}
        {penalties.map((penalty) => (
          <article className="penalty-card" key={penalty.id}>
            <div>
              <strong>¥{penalty.amount}</strong>
              <span>{formatDay(penalty.date)} · 连续第 {penalty.consecutive_count} 天</span>
            </div>
            <StatusPill status={penalty.status} />
            {penalty.status === 'pending' && (
              <div className="row-actions">
                <button type="button" onClick={() => void markPaid(penalty.id)}>我已付款</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
