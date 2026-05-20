import { CheckCircle2, ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FatigueCards from '../../components/FatigueCards'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { useCheckInEvidence } from '../../hooks/useCheckInEvidence'
import { usePlans } from '../../hooks/usePlans'
import { toISODate } from '../../lib/date'
import { formatFileSize, MAX_EVIDENCE_FILES, prepareEvidenceFile } from '../../lib/evidenceFiles'
import { planToExercises } from '../../lib/plan'
import { formatPlanFocusText, formatPlanSourceLabel } from '../../lib/planDisplay'
import { rawErrorMessage } from '../../lib/supabaseErrors'

type EvidenceFile = {
  id: string
  file: File
  originalName: string
  url: string
  warning?: string
}

type SubmitStage = 'idle' | 'saving' | 'uploading'

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
  const [fileMessage, setFileMessage] = useState('')
  const [pendingEvidenceCheckInId, setPendingEvidenceCheckInId] = useState<string | null>(null)
  const [processingFiles, setProcessingFiles] = useState(false)
  const [submitStage, setSubmitStage] = useState<SubmitStage>('idle')
  const navigate = useNavigate()
  const fileInputId = useId()
  const today = toISODate(new Date())
  const todayPlan = plans.find((plan) => plan.date === today)
  const submitting = submitStage !== 'idle'
  const uploadSlotsLeft = MAX_EVIDENCE_FILES - evidenceFiles.length

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
    if (evidenceFilesRef.current.length === 0) {
      setError('请先添加至少 1 张训练照片，再提交打卡。')
      return
    }
    setError('')
    setFileMessage('')
    let savedCheckInId = pendingEvidenceCheckInId
    try {
      if (!savedCheckInId) {
        setSubmitStage('saving')
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
        if (mountedRef.current) setPendingEvidenceCheckInId(checkIn.id)
      }
      setSubmitStage('uploading')
      const files = evidenceFilesRef.current.map((entry) => entry.file)
      if (files.length === 0) throw new Error('请先添加至少 1 张训练照片。')
      await uploadEvidence(savedCheckInId, profile.id, files)
      if (mountedRef.current) setPendingEvidenceCheckInId(null)
      navigate('/')
    } catch (err) {
      if (mountedRef.current) {
        const fallback = savedCheckInId
          ? '打卡已保存，但图片证据上传失败。你可以重新选择图片再提交一次。'
          : '打卡记录保存失败，请稍后重试。'
        setError(rawErrorMessage(err, fallback))
      }
    } finally {
      if (mountedRef.current) setSubmitStage('idle')
    }
  }

  const chooseFiles = async (nextFiles: FileList | null) => {
    const incoming = Array.from(nextFiles ?? [])
    if (processingFiles) {
      setFileMessage('上一张照片还在处理，请稍等。')
      return
    }
    if (incoming.length === 0) {
      setError('')
      setFileMessage('没有选到照片，请换一张或用系统浏览器重试。')
      return
    }
    setError('')
    setFileMessage('正在处理照片，请稍等。')
    const slotsLeft = MAX_EVIDENCE_FILES - evidenceFilesRef.current.length
    if (slotsLeft <= 0) {
      setFileMessage(`最多只能上传 ${MAX_EVIDENCE_FILES} 张照片。`)
      return
    }

    setProcessingFiles(true)
    const accepted: EvidenceFile[] = []
    const messages: string[] = []
    const filesToPrepare = incoming.slice(0, slotsLeft)
    const skippedCount = Math.max(0, incoming.length - slotsLeft)

    for (const file of filesToPrepare) {
      try {
        const prepared = await prepareEvidenceFile(file)
        accepted.push({
          id: makeEvidenceId(),
          file: prepared.file,
          originalName: prepared.originalName,
          url: URL.createObjectURL(prepared.file),
          warning: prepared.warning,
        })
        if (prepared.warning) messages.push(prepared.warning)
      } catch (err) {
        messages.push(rawErrorMessage(err, `${file.name} 处理失败。`))
      }
    }

    if (skippedCount > 0) messages.push(`最多保留 ${MAX_EVIDENCE_FILES} 张，已略过 ${skippedCount} 张。`)
    const next = [...evidenceFilesRef.current, ...accepted]
    evidenceFilesRef.current = next
    if (mountedRef.current) {
      setEvidenceFiles(next)
      setFileMessage(messages.join(' ') || (accepted.length === 0 ? '照片处理失败，请换一张再试。' : ''))
      setProcessingFiles(false)
    } else {
      accepted.forEach((entry) => URL.revokeObjectURL(entry.url))
    }
  }

  const removeFile = (id: string) => {
    const removed = evidenceFiles.find((entry) => entry.id === id)
    if (removed) URL.revokeObjectURL(removed.url)
    const next = evidenceFiles.filter((entry) => entry.id !== id)
    evidenceFilesRef.current = next
    setEvidenceFiles(next)
    setFileMessage('')
    setError('')
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
    <section className="screen with-nav checkin-screen">
      <div className="checkin-title-block">
        <h2>训练打卡</h2>
        <p>
          {pendingEvidenceCheckInId
            ? '打卡记录已保存，重新添加照片后继续提交。'
            : '记录状态，添加 1-3 张训练照片后提交给教练审核。'}
        </p>
      </div>
      {!todayPlan && (
        <div className="status-card">
          <strong>今天还没有计划</strong>
          <p>先回到今日页，让教练制定计划，或自己制定今日计划后再打卡。</p>
        </div>
      )}
      {todayPlan && (
        <div className="day-card checkin-plan-card">
          <div className="day-head">
            <strong>{todayPlan.title}</strong>
            <span className={`plan-source-tag ${todayPlan.source}`}>{formatPlanSourceLabel(todayPlan.source)}</span>
          </div>
          <p className="muted">{formatPlanFocusText(todayPlan.focus, todayPlan.source)} · 截止 {todayPlan.deadline}</p>
          <div className="exercise-list compact-list">
            {planToExercises(todayPlan).map((exercise) => (
              <span className="mini-chip" key={exercise.id}>{exercise.name}</span>
            ))}
          </div>
        </div>
      )}
      <div className="form-card checkin-panel">
        <div className="checkin-section-head">
          <span>01</span>
          <div>
            <strong>身体状态</strong>
            <small>先记录今天训练后的感觉</small>
          </div>
        </div>
        <FatigueCards value={fatigue} onChange={changeFatigue} />
        <div className="check-grid checkin-issue-grid">
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
        <label className="checkin-note-field">
          备注
          <textarea
            disabled={submitting}
            placeholder="可以写今天哪里不舒服、哪个动作比较吃力。"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
          />
        </label>

        <div className="checkin-section-head">
          <span>02</span>
          <div>
            <strong>图片证据</strong>
            <small>{evidenceFiles.length}/{MAX_EVIDENCE_FILES} 张，单张不超过 5 MB</small>
          </div>
        </div>
        <div className="evidence-uploader">
          <input
            accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
            className="visually-hidden"
            disabled={submitting || processingFiles || uploadSlotsLeft <= 0}
            id={fileInputId}
            multiple
            type="file"
            onChange={(event) => {
              void chooseFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />
          <label
            className={`upload-dropzone${uploadSlotsLeft <= 0 ? ' complete' : ''}${processingFiles ? ' busy' : ''}`}
            htmlFor={uploadSlotsLeft <= 0 ? undefined : fileInputId}
          >
            <span className="upload-dropzone-icon" aria-hidden="true">
              {processingFiles ? <Loader2 className="is-spinning" /> : uploadSlotsLeft <= 0 ? <CheckCircle2 /> : <ImagePlus />}
            </span>
            <strong>{processingFiles ? '正在处理照片' : uploadSlotsLeft <= 0 ? '照片已满' : '添加训练照片'}</strong>
            <small>{uploadSlotsLeft <= 0 ? '最多 3 张，先删除后再添加。' : `还可以添加 ${uploadSlotsLeft} 张。`}</small>
          </label>
          <div className="upload-meter" aria-hidden="true">
            {Array.from({ length: MAX_EVIDENCE_FILES }).map((_, index) => (
              <span className={index < evidenceFiles.length ? 'filled' : ''} key={index} />
            ))}
          </div>
        </div>
        {evidenceFiles.length > 0 && (
          <div className="evidence-preview-grid">
            {evidenceFiles.map((preview) => (
              <figure className="evidence-tile" key={preview.id}>
                <img alt={preview.originalName} src={preview.url} />
                <figcaption>
                  <strong>{preview.originalName}</strong>
                  <span>{formatFileSize(preview.file.size)}{preview.warning ? ' · 已压缩' : ''}</span>
                </figcaption>
                <button
                  aria-label={`移除 ${preview.originalName}`}
                  disabled={submitting}
                  type="button"
                  onClick={() => removeFile(preview.id)}
                >
                  <Trash2 size={16} />
                </button>
              </figure>
            ))}
          </div>
        )}
        {fileMessage && <p className="form-success upload-feedback">{fileMessage}</p>}
        {error && <strong className="form-error submit-error">{error}</strong>}
        <button className="primary-action checkin-submit" disabled={!todayPlan || submitting || processingFiles} type="button" onClick={submit}>
          {submitStage === 'saving' && <Loader2 className="is-spinning" size={20} />}
          {submitStage === 'uploading' && <UploadCloud size={20} />}
          {submitStage === 'saving'
            ? '保存打卡中'
            : submitStage === 'uploading'
              ? '上传照片中'
              : pendingEvidenceCheckInId
                ? '重新上传照片，等待审核'
                : '提交打卡，等待审核'}
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
