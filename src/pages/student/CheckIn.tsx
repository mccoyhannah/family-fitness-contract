import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FatigueCards from '../../components/FatigueCards'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { useCheckInEvidence } from '../../hooks/useCheckInEvidence'
import { usePlans } from '../../hooks/usePlans'
import { toISODate } from '../../lib/date'
import { planToExercises } from '../../lib/plan'

type FilePreview = {
  file: File
  url: string
}

export default function CheckIn() {
  const { profile } = useAuth()
  const { upsertCheckIn } = useCheckIns(profile?.id)
  const { uploadEvidence } = useCheckInEvidence(profile?.id ?? 'demo')
  const { plans } = usePlans(profile?.id)
  const [fatigue, setFatigue] = useState(3)
  const [note, setNote] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const today = toISODate(new Date())
  const todayPlan = plans.find((plan) => plan.date === today)

  useEffect(() => {
    const nextPreviews = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }))
    setFilePreviews(nextPreviews)
    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [files])

  const submit = async () => {
    if (!profile || !todayPlan) return
    setSubmitting(true)
    setError('')
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
      if (files.length > 0 && checkIn) await uploadEvidence(checkIn.id, profile.id, files)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  const chooseFiles = (nextFiles: FileList | null) => {
    const images = Array.from(nextFiles ?? []).filter((file) => file.type.startsWith('image/')).slice(0, 3)
    setFiles(images)
  }

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
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
              <input type="checkbox" checked={issues.includes(issue)} onChange={() => toggleIssue(issue)} />
              {issue}
            </label>
          ))}
        </div>
        <label>
          备注
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
        </label>
        <label>
          图片证据，最多 3 张
          <input accept="image/*" multiple type="file" onChange={(event) => chooseFiles(event.target.files)} />
        </label>
        {files.length > 0 && (
          <div className="evidence-grid">
            {filePreviews.map((preview, index) => (
              <figure className="evidence-preview" key={`${preview.file.name}-${preview.file.size}-${index}`}>
                <button aria-label={`移除 ${preview.file.name}`} type="button" onClick={() => removeFile(index)}>
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
