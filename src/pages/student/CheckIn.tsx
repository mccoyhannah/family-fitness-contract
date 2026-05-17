import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FatigueCards from '../../components/FatigueCards'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { useCheckInEvidence } from '../../hooks/useCheckInEvidence'
import { usePlans } from '../../hooks/usePlans'
import { toISODate } from '../../lib/date'
import { planToExercises } from '../../lib/plan'

type EvidenceFile = {
  id: string
  file: File
  url: string
}

export default function CheckIn() {
  const { profile } = useAuth()
  const { upsertCheckIn } = useCheckIns(profile?.id)
  const { uploadEvidence } = useCheckInEvidence(profile?.id ?? 'demo')
  const { loading: plansLoading, plans } = usePlans(profile?.id)
  const [fatigue, setFatigue] = useState(3)
  const [note, setNote] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([])
  const evidenceFilesRef = useRef<EvidenceFile[]>([])
  const mountedRef = useRef(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const today = toISODate(new Date())
  const todayPlan = plans.find((plan) => plan.date === today)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      evidenceFilesRef.current.forEach((entry) => URL.revokeObjectURL(entry.url))
      evidenceFilesRef.current = []
    }
  }, [])

  const makeEvidenceId = () =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

  const submit = async () => {
    if (submitting || !profile || !todayPlan) return
    setSubmitting(true)
    setError('')
    let savedCheckInId: string | null = null
    try {
      const checkIn = await upsertCheckIn({
        user_id: profile.id,
        plan_id: todayPlan.id,
        date: today,
        status: 'pending_review',
        fatigue,
        issues,
        note: note || '已提交，等待教练确认。',
        leave_reason: null,
      })
      if (!checkIn) throw new Error('打卡保存失败，请稍后重试。')
      savedCheckInId = checkIn.id
      const files = evidenceFiles.map((entry) => entry.file)
      if (files.length > 0) await uploadEvidence(checkIn.id, profile.id, files)
      navigate('/')
    } catch (err) {
      if (mountedRef.current) {
        setError(
          savedCheckInId
            ? '打卡已保存，但图片证据上传失败。你可以重新选择图片再提交一次，或回到今日页等待审核。'
            : err instanceof Error
              ? err.message
              : '提交失败，请稍后重试。',
        )
      }
    } finally {
      if (mountedRef.current) setSubmitting(false)
    }
  }

  const chooseFiles = (nextFiles: FileList | null) => {
    evidenceFilesRef.current.forEach((entry) => URL.revokeObjectURL(entry.url))
    const next = Array.from(nextFiles ?? [])
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, 3)
      .map((file) => ({
        id: makeEvidenceId(),
        file,
        url: URL.createObjectURL(file),
      }))
    evidenceFilesRef.current = next
    setEvidenceFiles(next)
  }

  const removeFile = (id: string) => {
    const removed = evidenceFiles.find((entry) => entry.id === id)
    if (removed) URL.revokeObjectURL(removed.url)
    const next = evidenceFiles.filter((entry) => entry.id !== id)
    evidenceFilesRef.current = next
    setEvidenceFiles(next)
  }

  const toggleIssue = (issue: string) => {
    setIssues((current) => (current.includes(issue) ? current.filter((item) => item !== issue) : [...current, issue]))
  }

  const changeFatigue = (nextFatigue: number) => {
    setFatigue(nextFatigue)
    if (nextFatigue === 5) {
      setIssues((current) => (current.includes('不舒服') ? current : [...current, '不舒服']))
    }
  }

  if (plansLoading && plans.length === 0) return <CheckInLoadingSkeleton />

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>提交打卡</h2>
        <p>打卡会关联今日计划，并把图片证据上传到 Supabase Storage。</p>
      </div>
      {!todayPlan && (
        <div className="status-card">
          <strong>今天还没有计划</strong>
          <p>先回到今日页，让教练制定计划，或自己制定今日计划后再打卡。</p>
        </div>
      )}
      {todayPlan && (
        <div className="day-card">
          <div className="day-head">
            <strong>{todayPlan.title}</strong>
            <span>{todayPlan.source === 'coach' ? '教练制定' : '自己制定'}</span>
          </div>
          <p className="muted">{todayPlan.focus}</p>
          <div className="exercise-list compact-list">
            {planToExercises(todayPlan).map((exercise) => (
              <span className="mini-chip" key={exercise.id}>{exercise.name}</span>
            ))}
          </div>
        </div>
      )}
      <div className="form-card">
        <FatigueCards value={fatigue} onChange={changeFatigue} />
        <div className="check-grid">
          {['疼痛', '头晕', '胸闷', '不舒服'].map((issue) => (
            <label className="switch-row" key={issue}>
              <input
                checked={issues.includes(issue)}
                disabled={submitting}
                type="checkbox"
                onChange={() => toggleIssue(issue)}
              />
              {issue}
            </label>
          ))}
        </div>
        <label>
          备注
          <textarea disabled={submitting} value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
        </label>
        <label>
          图片证据，最多 3 张
          <input
            accept="image/*"
            disabled={submitting}
            multiple
            type="file"
            onChange={(event) => {
              chooseFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />
        </label>
        {evidenceFiles.length > 0 && (
          <div className="evidence-grid">
            {evidenceFiles.map((preview) => (
              <figure className="evidence-preview" key={preview.id}>
                <button aria-label={`移除 ${preview.file.name}`} type="button" onClick={() => removeFile(preview.id)}>
                  ×
                </button>
                <img alt={preview.file.name} src={preview.url} />
                <figcaption>{preview.file.name}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {error && <strong className="form-error">{error}</strong>}
        <button className="primary-action" disabled={!todayPlan || submitting} type="button" onClick={submit}>
          {submitting ? '提交中...' : '提交打卡，等待审核'}
        </button>
      </div>
    </section>
  )
}

function CheckInLoadingSkeleton() {
  return (
    <section className="screen with-nav" aria-busy="true">
      <div className="page-title">
        <h2>提交打卡</h2>
        <p>正在同步今日计划。</p>
      </div>
      <div className="day-card skeleton-card">
        <span className="skeleton-line medium" />
        <span className="skeleton-line" />
        <div className="skeleton-grid">
          <span className="skeleton-tile" />
          <span className="skeleton-tile" />
        </div>
      </div>
      <div className="form-card skeleton-card">
        <span className="skeleton-line title" />
        <span className="skeleton-row" />
        <span className="skeleton-row" />
      </div>
    </section>
  )
}
