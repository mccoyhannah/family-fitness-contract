import { CheckCircle2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FatigueCards from '../../components/FatigueCards'
import { useAuth } from '../../hooks/useAuth'
import { useCheckIns } from '../../hooks/useCheckIns'
import { usePlans } from '../../hooks/usePlans'
import { toISODate } from '../../lib/date'
import { notifyApp } from '../../lib/notice'
import { planToExercises } from '../../lib/plan'
import { formatPlanFocusText, formatPlanSourceLabel } from '../../lib/planDisplay'
import { rawErrorMessage } from '../../lib/supabaseErrors'

type SubmitStage = 'idle' | 'saving' | 'failed' | 'success'

export default function CheckIn() {
  const { profile } = useAuth()
  const { checkIns, upsertCheckIn } = useCheckIns(profile?.id)
  const { loading: plansLoading, plans } = usePlans(profile?.id)
  const [fatigue, setFatigue] = useState(3)
  const [note, setNote] = useState('')
  const [issues, setIssues] = useState<string[]>([])
  const [error, setError] = useState('')
  const [submitStage, setSubmitStage] = useState<SubmitStage>('idle')
  const [submitStatus, setSubmitStatus] = useState('')
  const navigate = useNavigate()
  const today = toISODate(new Date())
  const todayPlan = plans.find((plan) => plan.date === today)
  const todayPlanExercises = todayPlan ? planToExercises(todayPlan) : []
  const todayCheckIn = checkIns.find((checkIn) => checkIn.date === today)
  const todayPendingCheckIn = checkIns.find((checkIn) => checkIn.date === today && checkIn.status === 'pending_review')
  const todayMissedCheckIn = checkIns.find((checkIn) => checkIn.date === today && checkIn.status === 'missed')
  const restDay = Boolean(todayPlan && !todayPlan.is_training)
  const submitting = !['idle', 'failed'].includes(submitStage)

  const submit = async () => {
    if (submitting || !profile || !todayPlan) return
    if (restDay) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setSubmitStage('saving')
    setSubmitStatus(todayMissedCheckIn ? '正在提交补交记录。' : todayPendingCheckIn ? '正在更新打卡记录。' : '正在保存打卡记录。')
    if (todayCheckIn && todayCheckIn.status !== 'pending_review' && todayCheckIn.status !== 'missed') {
      setError('今天的打卡已经审核，不能重新提交。')
      setSubmitStage('idle')
      setSubmitStatus('')
      return
    }
    setError('')
    let submitted = false
    try {
      const checkIn = await upsertCheckIn({
        id: todayMissedCheckIn?.id ?? todayPendingCheckIn?.id,
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
      setSubmitStage('success')
      setSubmitStatus('提交成功，正在回到今日页。')
      notifyApp({ tone: 'success', message: '已提交，等待教练审核。' })
      submitted = true
      window.setTimeout(() => navigate('/'), 420)
    } catch (err) {
      const message = rawErrorMessage(err, '打卡记录保存失败，请稍后重试。')
      setError(message)
      setSubmitStatus('提交失败，请按提示重试。')
      setSubmitStage('failed')
      notifyApp({ tone: 'warning', message })
    } finally {
      if (!submitted) setSubmitStage((stage) => (stage === 'failed' ? 'failed' : 'idle'))
    }
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
          {restDay
            ? '今天已记为休息日，不需要提交训练打卡。'
            : todayMissedCheckIn
            ? '今天已记缺卡，可以补交训练记录给教练审核。'
            : todayPendingCheckIn
              ? '今天已有待审核记录，可以更新身体状态和备注。'
            : '按今日计划练完后，记录身体状态和备注给教练审核。'}
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
          <div className="checkin-plan-head">
            <div>
              <span className="checkin-plan-kicker">今日训练清单</span>
              <strong>{todayPlan.title}</strong>
            </div>
            <span className={`plan-source-tag ${todayPlan.source}`}>{formatPlanSourceLabel(todayPlan.source)}</span>
          </div>
          <p className="muted">
            {todayPlan.is_training ? '练完后按下方表单打卡' : '今天是恢复安排'} · {formatPlanFocusText(todayPlan.focus, todayPlan.source)} · 截止 {todayPlan.deadline}
          </p>
          {todayPlanExercises.length > 0 ? (
            <div className="checkin-plan-list" aria-label="今日训练动作">
              {todayPlanExercises.map((exercise, index) => (
                <div className="checkin-plan-row" key={exercise.id}>
                  <span className="checkin-plan-index">{index + 1}</span>
                  <div className="checkin-plan-main">
                    <strong>{exercise.name}</strong>
                    {exercise.note && <small>{exercise.note}</small>}
                  </div>
                  <span className="checkin-plan-dose">{exercise.sets} · {exercise.reps}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="checkin-plan-empty">今天没有训练动作。</div>
          )}
        </div>
      )}
      {restDay && (
        <div className="status-card rest-day-card contract-clause-card">
          <strong>今天是休息日</strong>
          <p>今天不用提交训练打卡。需要改成训练时，先回到今日页或计划页调整当天计划。</p>
        </div>
      )}
      {!restDay && (
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

        {error && (
          <div className="submit-error-block">
            <div className="submit-error-title">
              <strong>{error}</strong>
            </div>
          </div>
        )}
        {(submitStatus || error) && (
          <div className={`submit-near-button ${error ? 'warning' : ''}`}>
            <strong>{error ? '没有提交成功' : '提交状态'}</strong>
            <span>{error ? submitStatus || error : submitStatus}</span>
          </div>
        )}
        <button className="primary-action checkin-submit" disabled={!profile || !todayPlan || submitting} type="button" onClick={submit}>
          {submitting && submitStage !== 'success' && <Loader2 className="is-spinning" size={20} />}
          {submitStage === 'success' && <CheckCircle2 size={20} />}
          {!profile
            ? '正在读取登录状态'
            : submitStage === 'saving'
            ? '保存打卡中'
            : submitStage === 'success'
              ? '提交成功'
              : submitStage === 'failed'
                ? '重新提交打卡'
                : todayPendingCheckIn
                  ? '更新打卡，等待审核'
                  : '提交打卡，等待审核'}
        </button>
      </div>
      )}
    </section>
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
