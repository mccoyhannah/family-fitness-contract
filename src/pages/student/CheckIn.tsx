import { AlertTriangle, CheckCircle2, Clipboard, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FatigueCards from '../../components/FatigueCards'
import { useAuth } from '../../hooks/useAuth'
import { EvidenceUploadError } from '../../hooks/useCheckInEvidence'
import { useCheckIns } from '../../hooks/useCheckIns'
import { useCheckInEvidence } from '../../hooks/useCheckInEvidence'
import { usePlans } from '../../hooks/usePlans'
import { toISODate } from '../../lib/date'
import { formatFileSize, MAX_EVIDENCE_FILES, prepareEvidenceFile } from '../../lib/evidenceFiles'
import { notifyApp } from '../../lib/notice'
import { planToExercises } from '../../lib/plan'
import { formatPlanFocusText, formatPlanSourceLabel } from '../../lib/planDisplay'
import { isLocalPreviewActive } from '../../lib/preview'
import { errorDiagnostic, rawErrorMessage } from '../../lib/supabaseErrors'

type EvidenceFile = {
  id: string
  file: File
  originalName: string
  url: string
  warning?: string
}

type SubmitStage = 'idle' | 'checking' | 'saving' | 'uploading' | 'recording' | 'confirming' | 'failed' | 'success'

type SubmitErrorDetail = {
  code?: string
  details?: string | null
  fileName?: string
  fileSize?: number
  fileType?: string
  message: string
  stage: string
  status?: number
}

const PHOTO_LIBRARY_ACCEPT = 'image/*'
const CAMERA_ACCEPT = 'image/*'
type FilePickerSource = 'camera' | 'library'

type PendingFilePicker = {
  beforeCount: number
  source: FilePickerSource
  startedAt: number
}

export default function CheckIn() {
  const { profile } = useAuth()
  const { checkIns, upsertCheckIn } = useCheckIns(profile?.id)
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
  const [submitStatus, setSubmitStatus] = useState('')
  const [submitErrorDetail, setSubmitErrorDetail] = useState<SubmitErrorDetail | null>(null)
  const [copiedError, setCopiedError] = useState(false)
  const [highlightUpload, setHighlightUpload] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const navigate = useNavigate()
  const evidenceUploadRef = useRef<HTMLDivElement | null>(null)
  const lastFileSelectionKeyRef = useRef<string | null>(null)
  const pendingFilePickerRef = useRef<PendingFilePicker | null>(null)
  const pickerFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uploadHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const today = toISODate(new Date())
  const todayPlan = plans.find((plan) => plan.date === today)
  const todayCheckIn = checkIns.find((checkIn) => checkIn.date === today)
  const todayPendingCheckIn = checkIns.find((checkIn) => checkIn.date === today && checkIn.status === 'pending_review')
  const todayMissedCheckIn = checkIns.find((checkIn) => checkIn.date === today && checkIn.status === 'missed')
  const hasSavedCheckIn = Boolean(pendingEvidenceCheckInId || todayPendingCheckIn)
  const submitting = !['idle', 'failed'].includes(submitStage)
  const uploadSlotsLeft = MAX_EVIDENCE_FILES - evidenceFiles.length
  const usingLocalPreview = isLocalPreviewActive()
  const isWeChatBrowser = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (uploadHighlightTimerRef.current) clearTimeout(uploadHighlightTimerRef.current)
      if (pickerFallbackTimerRef.current) clearTimeout(pickerFallbackTimerRef.current)
      evidenceFilesRef.current.forEach((entry) => URL.revokeObjectURL(entry.url))
      evidenceFilesRef.current = []
    }
  }, [])

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  const makeEvidenceId = () =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

  const flashEvidenceUpload = () => {
    evidenceUploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightUpload(true)
    if (uploadHighlightTimerRef.current) clearTimeout(uploadHighlightTimerRef.current)
    uploadHighlightTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setHighlightUpload(false)
    }, 1400)
  }

  const pickerSourceLabel = (source: FilePickerSource) => (source === 'camera' ? '相机' : '相册')

  const showEmptyFileMessage = (source: FilePickerSource) => {
    const sourceLabel = pickerSourceLabel(source)
    const message = isWeChatBrowser
      ? `没有收到${sourceLabel}照片。微信内置浏览器可能拦截了文件，请点右上角用系统浏览器打开后重试。`
      : `没有收到${sourceLabel}照片。请确认拍照后点“确定”，或换一张照片再试。`
    setError(message)
    setSubmitErrorDetail(null)
    setFileMessage('')
    setSubmitStatus(source === 'camera' ? '相机没有把照片交给网页，请重新拍照并确认保存。' : '相册没有把照片交给网页，请重新选择照片。')
    notifyApp({ tone: 'warning', message })
    flashEvidenceUpload()
  }

  const armFilePickerFallback = (source: FilePickerSource) => {
    if (submitting || processingFiles || uploadSlotsLeft <= 0) return
    pendingFilePickerRef.current = {
      beforeCount: evidenceFilesRef.current.length,
      source,
      startedAt: Date.now(),
    }
    setError('')
    setSubmitErrorDetail(null)
    setSubmitStatus(source === 'camera' ? '正在打开相机。拍照后请点确认/完成。' : '正在打开相册。选择照片后会自动处理。')
    setFileMessage('')
    if (pickerFallbackTimerRef.current) clearTimeout(pickerFallbackTimerRef.current)
    pickerFallbackTimerRef.current = setTimeout(() => {
      const pending = pendingFilePickerRef.current
      if (!pending || processingFiles) return
      if (evidenceFilesRef.current.length !== pending.beforeCount) {
        pendingFilePickerRef.current = null
        return
      }
      showEmptyFileMessage(pending.source)
      pendingFilePickerRef.current = null
    }, 15000)
  }

  const submit = async () => {
    if (submitting || !profile || !todayPlan) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (!usingLocalPreview && !isOnline) {
      const message = '当前网络不可用。请恢复网络后再提交照片，页面上的备注和照片预览会先保留。'
      setError(message)
      setSubmitStage('idle')
      setSubmitStatus('网络恢复后直接点提交即可。')
      notifyApp({ tone: 'warning', message })
      return
    }
    setSubmitStage('checking')
    setSubmitStatus('正在检查训练照片。')
    setSubmitErrorDetail(null)
    setCopiedError(false)
    if (todayCheckIn && todayCheckIn.status !== 'pending_review' && todayCheckIn.status !== 'missed') {
      setError('今天的打卡已经审核，不能重新提交。')
      setSubmitStage('idle')
      setSubmitStatus('')
      return
    }
    if (evidenceFilesRef.current.length === 0) {
      const message = '还没有添加照片。请先添加 1 张训练照片，再提交打卡。'
      setError(message)
      setSubmitStage('idle')
      setSubmitStatus('请先在图片证据区域添加照片，看到 1/3 和预览后再提交。')
      setFileMessage('')
      notifyApp({ tone: 'warning', message })
      flashEvidenceUpload()
      return
    }
    setError('')
    setFileMessage('')
    let savedCheckInId = pendingEvidenceCheckInId ?? todayPendingCheckIn?.id ?? null
    let currentStage: SubmitStage = 'checking'
    let submitted = false
    try {
      if (!savedCheckInId || todayMissedCheckIn) {
        currentStage = 'saving'
        setSubmitStage('saving')
        setSubmitStatus(todayMissedCheckIn ? '正在把缺卡改为补交审核。' : '正在保存打卡记录。')
        const checkIn = await upsertCheckIn({
          id: todayMissedCheckIn?.id,
          user_id: profile.id,
          plan_id: todayPlan.id,
          date: today,
          status: 'pending_review',
          fatigue,
          issues,
          note: note || (todayMissedCheckIn ? '补交打卡，等待教练确认。' : '已提交，等待教练确认。'),
          leave_reason: null,
        })
        if (!checkIn) throw new Error('打卡保存失败，请稍后重试。')
        savedCheckInId = checkIn.id
        if (mountedRef.current) setPendingEvidenceCheckInId(checkIn.id)
      }
      currentStage = 'uploading'
      setSubmitStage('uploading')
      const files = evidenceFilesRef.current.map((entry) => entry.file)
      if (files.length === 0) throw new Error('请先添加至少 1 张训练照片。')
      await uploadEvidence(savedCheckInId, profile.id, files, {
        onProgress: (progress) => {
          const countText = progress.index && progress.total ? `第 ${progress.index}/${progress.total} 张` : ''
          if (progress.stage === 'storage_upload') {
            currentStage = 'uploading'
            setSubmitStage('uploading')
            setSubmitStatus(`正在上传照片${countText ? `（${countText}）` : ''}。`)
          } else if (progress.stage === 'evidence_insert') {
            currentStage = 'recording'
            setSubmitStage('recording')
            setSubmitStatus(`正在保存照片记录${countText ? `（${countText}）` : ''}。`)
          } else {
            currentStage = 'confirming'
            setSubmitStage('confirming')
            setSubmitStatus('正在确认照片已经提交。')
          }
        },
      })
      if (mountedRef.current) setPendingEvidenceCheckInId(null)
      setSubmitStage('success')
      setSubmitStatus('提交成功，正在回到今日页。')
      notifyApp({ tone: 'success', message: '已提交，等待教练审核。' })
      submitted = true
      window.setTimeout(() => navigate('/'), 420)
    } catch (err) {
      if (mountedRef.current) {
        const fallback = savedCheckInId
          ? '打卡已保存，但图片证据上传失败。你可以重新选择图片再提交一次。'
          : '打卡记录保存失败，请稍后重试。'
        const message = rawErrorMessage(err, fallback)
        setError(message)
        setSubmitErrorDetail(buildSubmitErrorDetail(err, savedCheckInId ? currentStage : 'saving', message))
        setSubmitStatus(savedCheckInId ? '打卡记录已保存，照片还没有提交成功。请保留照片，直接重试上传。' : '提交失败，请按提示重试。')
        setSubmitStage('failed')
        notifyApp({ tone: 'warning', message })
      }
    } finally {
      if (mountedRef.current && !submitted && submitStage !== 'failed') {
        setSubmitStage((stage) => (stage === 'failed' ? 'failed' : 'idle'))
      }
    }
  }

  const chooseFiles = async (incoming: File[]) => {
    if (processingFiles) {
      setFileMessage('上一张照片还在处理，请稍等。')
      return
    }
    if (incoming.length === 0) return
    pendingFilePickerRef.current = null
    if (pickerFallbackTimerRef.current) clearTimeout(pickerFallbackTimerRef.current)
    setError('')
    setSubmitErrorDetail(null)
    setCopiedError(false)
    setSubmitStatus('')
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

    try {
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
        if (accepted.length === 0) {
          const message = messages.join(' ') || '照片处理失败，请换一张再试。'
          setError(message)
          setFileMessage('')
          notifyApp({ tone: 'warning', message })
          flashEvidenceUpload()
        } else {
          setFileMessage([`已添加 ${accepted.length} 张照片，点下面按钮提交审核。`, ...messages].join(' '))
          setSubmitStatus('')
        }
      } else {
        accepted.forEach((entry) => URL.revokeObjectURL(entry.url))
      }
    } catch (err) {
      accepted.forEach((entry) => URL.revokeObjectURL(entry.url))
      if (mountedRef.current) {
        const message = rawErrorMessage(err, '照片处理失败，请换一张再试。')
        setError(message)
        setFileMessage('')
        notifyApp({ tone: 'warning', message })
        flashEvidenceUpload()
      }
    } finally {
      if (mountedRef.current) setProcessingFiles(false)
    }
  }

  const fileSelectionKey = (files: File[]) =>
    files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|')

  const handleFileInput = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? [])

    if (files.length === 0) return

    const key = fileSelectionKey(files)
    if (key && key === lastFileSelectionKeyRef.current) return

    lastFileSelectionKeyRef.current = key || null
    void chooseFiles(files).finally(() => {
      input.value = ''
      lastFileSelectionKeyRef.current = null
    })
  }

  const removeFile = (id: string) => {
    const removed = evidenceFiles.find((entry) => entry.id === id)
    if (removed) URL.revokeObjectURL(removed.url)
    const next = evidenceFiles.filter((entry) => entry.id !== id)
    evidenceFilesRef.current = next
    setEvidenceFiles(next)
    setFileMessage('')
    setError('')
    setSubmitErrorDetail(null)
    setCopiedError(false)
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
            : todayMissedCheckIn
              ? '今天已记缺卡，可以补交 1-3 张训练照片给教练审核。'
            : todayPendingCheckIn
              ? '今天已有待审核记录，可以补传照片后继续提交。'
            : '记录状态，添加 1-3 张训练照片后提交给教练审核。'}
        </p>
      </div>
      {(submitStatus || error) && (
        <SubmitTopNotice
          error={error}
          stage={submitStage}
          status={submitStatus}
        />
      )}
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
            onFocus={(event) => {
              const target = event.currentTarget
              window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
            }}
            rows={4}
          />
        </label>

        <div className="checkin-section-head">
          <span>02</span>
          <div className="checkin-section-copy">
            <strong>图片证据</strong>
            <small>最多 3 张，单张不超过 5 MB</small>
          </div>
          <em className="checkin-count-badge">{evidenceFiles.length}/{MAX_EVIDENCE_FILES}</em>
        </div>
        {usingLocalPreview && (
          <p className="local-preview-warning">本地预览照片只保存在这台电脑，不会同步到线上管理端。</p>
        )}
        {!usingLocalPreview && !isOnline && (
          <p className="local-preview-warning">当前离线。可以先选照片和填写备注，恢复网络后再提交。</p>
        )}
        {!usingLocalPreview && isWeChatBrowser && (
          <p className="browser-warning">微信里相册可能不稳定；若选不到照片，点右上角用系统浏览器打开，或直接拍照。</p>
        )}
        {(submitStage !== 'idle' || submitStatus) && (
          <SubmitProgress stage={submitStage} status={submitStatus} />
        )}
        {error && (
          <div className="submit-error-block">
            <div className="submit-error-title">
              <AlertTriangle size={18} />
              <strong>{error}</strong>
            </div>
            {submitErrorDetail && (
              <details className="submit-error-detail">
                <summary>错误详情/复制给技术排查</summary>
                <pre>{formatSubmitErrorDetail(submitErrorDetail)}</pre>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(formatSubmitErrorDetail(submitErrorDetail))
                    setCopiedError(true)
                  }}
                >
                  <Clipboard size={16} />
                  {copiedError ? '已复制' : '复制详情'}
                </button>
              </details>
            )}
          </div>
        )}
        <div className={`evidence-uploader${highlightUpload ? ' needs-attention' : ''}`} ref={evidenceUploadRef}>
          <label
            className={`upload-dropzone${uploadSlotsLeft <= 0 ? ' complete' : ''}${processingFiles ? ' busy' : ''}`}
          >
            <input
              accept={PHOTO_LIBRARY_ACCEPT}
              className="upload-input-cover"
              disabled={submitting || processingFiles || uploadSlotsLeft <= 0}
              multiple
              type="file"
              onChange={(event) => handleFileInput(event.currentTarget)}
              onClick={() => armFilePickerFallback('library')}
            />
            <span className="upload-dropzone-icon" aria-hidden="true">
              {processingFiles ? <Loader2 className="is-spinning" /> : uploadSlotsLeft <= 0 ? <CheckCircle2 /> : <ImagePlus />}
            </span>
            <strong>{processingFiles ? '正在处理照片' : uploadSlotsLeft <= 0 ? '照片已满' : '添加训练照片'}</strong>
            <small>{uploadSlotsLeft <= 0 ? '最多 3 张，先删除后再添加。' : `还可以添加 ${uploadSlotsLeft} 张。`}</small>
          </label>
          <label className={`camera-capture-button${uploadSlotsLeft <= 0 ? ' disabled' : ''}`}>
            <input
              accept={CAMERA_ACCEPT}
              className="camera-input-cover"
              capture="environment"
              disabled={submitting || processingFiles || uploadSlotsLeft <= 0}
              type="file"
              onChange={(event) => handleFileInput(event.currentTarget)}
              onClick={() => armFilePickerFallback('camera')}
            />
            <ImagePlus size={18} />
            直接拍照打卡
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
              <EvidencePreviewTile
                key={preview.id}
                preview={preview}
                submitting={submitting}
                onRemove={removeFile}
              />
            ))}
          </div>
        )}
        {fileMessage && <p className="form-success upload-feedback">{fileMessage}</p>}
        {(submitStatus || error) && (
          <div className={`submit-near-button ${error ? 'warning' : ''}`}>
            <strong>{error ? '没有提交成功' : '提交状态'}</strong>
            <span>{error ? submitStatus || error : submitStatus}</span>
          </div>
        )}
        <button className="primary-action checkin-submit" disabled={!profile || !todayPlan || submitting || processingFiles} type="button" onClick={submit}>
          {submitting && submitStage !== 'success' && <Loader2 className="is-spinning" size={20} />}
          {submitStage === 'success' && <CheckCircle2 size={20} />}
          {!profile
            ? '正在读取登录状态'
            : submitStage === 'saving'
            ? '保存打卡中'
            : submitStage === 'uploading'
              ? '上传照片中'
              : submitStage === 'recording'
                ? '保存照片记录中'
                : submitStage === 'confirming'
                  ? '确认照片中'
                  : submitStage === 'success'
                    ? '提交成功'
              : submitStage === 'failed'
                ? hasSavedCheckIn
                  ? '重试上传照片'
                  : '重新提交打卡'
                : hasSavedCheckIn
                  ? '继续上传照片，等待审核'
                : '提交打卡，等待审核'}
        </button>
      </div>
    </section>
  )
}

function EvidencePreviewTile({
  onRemove,
  preview,
  submitting,
}: {
  onRemove: (id: string) => void
  preview: EvidenceFile
  submitting: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <figure className="evidence-tile">
      {!imageFailed ? (
        <img alt={preview.originalName} src={preview.url} onError={() => setImageFailed(true)} />
      ) : (
        <span className="today-evidence-file">{preview.originalName}</span>
      )}
      <figcaption>
        <strong>{preview.originalName}</strong>
        <span>{formatFileSize(preview.file.size)}{preview.warning ? ' · 已压缩' : ''}</span>
      </figcaption>
      <button
        aria-label={`移除 ${preview.originalName}`}
        disabled={submitting}
        type="button"
        onClick={() => onRemove(preview.id)}
      >
        <Trash2 size={16} />
      </button>
    </figure>
  )
}

function SubmitTopNotice({ error, stage, status }: { error: string; stage: SubmitStage; status: string }) {
  return (
    <div className={`checkin-submit-notice ${error ? 'warning' : stage === 'success' ? 'success' : ''}`} aria-live="polite">
      <strong>{error ? '提交未完成' : stage === 'success' ? '提交成功' : '正在提交'}</strong>
      <span>{error ? status || error : status || '正在准备提交。'}</span>
    </div>
  )
}

function SubmitProgress({ stage, status }: { stage: SubmitStage; status: string }) {
  const steps: Array<{ key: SubmitStage; label: string }> = [
    { key: 'checking', label: '检查' },
    { key: 'saving', label: '保存' },
    { key: 'uploading', label: '上传' },
    { key: 'recording', label: '记录' },
    { key: 'confirming', label: '确认' },
  ]
  const activeIndex =
    stage === 'success'
      ? steps.length
      : stage === 'failed'
        ? -1
        : Math.max(0, steps.findIndex((step) => step.key === stage))

  return (
    <div className={`submit-progress-card ${stage === 'success' ? 'success' : ''}${stage === 'failed' ? ' failed' : ''}`} aria-live="polite">
      <div className="submit-step-row">
        {steps.map((step, index) => (
          <span className={index <= activeIndex ? 'active' : ''} key={step.key}>
            {step.label}
          </span>
        ))}
      </div>
      <strong>{status || '准备提交。'}</strong>
    </div>
  )
}

function buildSubmitErrorDetail(error: unknown, stage: string, fallbackMessage: string): SubmitErrorDetail {
  if (error instanceof EvidenceUploadError) return error.debug
  const diagnostic = errorDiagnostic(error)
  return {
    ...diagnostic,
    message: diagnostic.message || fallbackMessage,
    stage,
  }
}

function formatSubmitErrorDetail(detail: SubmitErrorDetail) {
  return [
    `阶段：${detail.stage}`,
    `错误：${detail.message}`,
    detail.code ? `Code：${detail.code}` : null,
    detail.status ? `Status：${detail.status}` : null,
    detail.fileName ? `文件：${detail.fileName}` : null,
    detail.fileType ? `类型：${detail.fileType}` : null,
    detail.fileSize ? `大小：${formatFileSize(detail.fileSize)}` : null,
    detail.details ? `详情：${detail.details}` : null,
  ]
    .filter(Boolean)
    .join('\n')
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
