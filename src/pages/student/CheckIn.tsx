import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { toISODate } from '../../lib/date'

export default function CheckIn() {
  const { profile } = useAuth()
  const { upsertCheckIn } = useCheckIns(profile?.id)
  const [fatigue, setFatigue] = useState(3)
  const [note, setNote] = useState('')
  const navigate = useNavigate()

  const submit = async () => {
    if (!profile) return
    await upsertCheckIn({
      user_id: profile.id,
      date: toISODate(new Date()),
      status: 'pending_review',
      fatigue,
      issues: [],
      note: note || '已提交，等待教练确认。',
      leave_reason: null,
    })
    navigate('/')
  }

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>提交打卡</h2>
        <p>本轮不做照片上传，先把云同步状态跑通。</p>
      </div>
      <div className="form-card">
        <label>
          疲劳程度：{fatigue}/5
          <input min="1" max="5" type="range" value={fatigue} onChange={(event) => setFatigue(Number(event.target.value))} />
        </label>
        <label>
          备注
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
        </label>
        <button className="primary-action" type="button" onClick={submit}>
          提交，进入 pending_review
        </button>
      </div>
    </section>
  )
}
