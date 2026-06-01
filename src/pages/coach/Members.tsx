import { Check, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Copy, Pencil, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import Metric from '../../components/Metric'
import PlanEditor from '../../components/PlanEditor'
import { useAuth } from '../../hooks/useAuth'
import { useCoachData } from '../../hooks/useCoachData'
import { useMembers } from '../../hooks/useMembers'
import { usePenaltySettings } from '../../hooks/usePenaltySettings'
import { usePlans } from '../../hooks/usePlans'
import { formatDay, fromISODate, toISODate } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'
import { getMonthCalendarDays, getMonthStartDate, getPlansInWeek, shiftMonth, type MonthCalendarDay } from '../../lib/planCalendar'
import { buildPlan, planDraftFromPlan, planDraftFromRecentTrainingPlan, planToExercises } from '../../lib/plan'
import { getRestConflict } from '../../lib/restRules'
import type { Plan, PlanDraft } from '../../lib/types'

function formatMonthTitle(date: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(fromISODate(date))
}

function calendarPlanStatus(plan?: Plan) {
  if (!plan) return '未定'
  if (!plan.is_training) return '休息'
  return `${plan.items.length}个`
}

function calendarPlanSource(plan?: Plan) {
  if (!plan) return null
  return plan.source === 'coach' ? '教练' : '成员'
}

const weekDayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function compactMonthDay(date: string) {
  const value = fromISODate(date)
  return `${value.getMonth() + 1}/${value.getDate()}`
}

export default function CoachMembers() {
  const { profile } = useAuth()
  const {
    addMember,
    loading: membersLoading,
    members,
    message,
    ready: membersReady,
    selectedMember,
    selectedMemberId,
    setSelectedMemberId,
    updateMemberDisplayName,
  } = useMembers(profile?.id)
  const { checkIns, penalties } = useCoachData()
  const { settings: penaltySettings } = usePenaltySettings()
  const { plans, savePlan } = usePlans(selectedMember?.id)
  const [displayName, setDisplayName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [addMessage, setAddMessage] = useState('')
  const [editMessage, setEditMessage] = useState('')
  const [editingDisplayName, setEditingDisplayName] = useState('')
  const [editingMemberId, setEditingMemberId] = useState('')
  const [savingMemberId, setSavingMemberId] = useState('')
  const savingMemberIdRef = useRef('')
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()))
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => getMonthStartDate(toISODate(new Date())))
  const [copiedDraft, setCopiedDraft] = useState<PlanDraft | null>(null)
  const [copyDraftToken, setCopyDraftToken] = useState(0)
  const [copyMessage, setCopyMessage] = useState('')
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(() => new Set())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const planWorkspaceRef = useRef<HTMLElement | null>(null)
  const today = toISODate(new Date())
  const week = useMemo(() => buildPlan(new Date(`${selectedDate}T12:00:00`)), [selectedDate])
  const calendarDays = useMemo(() => getMonthCalendarDays(calendarMonthDate, today), [calendarMonthDate, today])
  const calendarMonthLabel = useMemo(() => formatMonthTitle(calendarMonthDate), [calendarMonthDate])
  const selectedPlan = plans.find((plan) => plan.date === selectedDate)
  const plansByDate = useMemo(() => new Map(plans.map((plan) => [plan.date, plan])), [plans])
  const weekPlans = useMemo(() => getPlansInWeek(plans, selectedDate), [plans, selectedDate])
  const selectableMembers = useMemo(
    () => selectedMemberId ? members.filter((member) => member.id !== selectedMemberId) : members,
    [members, selectedMemberId],
  )
  const draft = useMemo<PlanDraft | null>(() => {
    if (!selectedMember) return null
    if (copiedDraft?.user_id === selectedMember.id && copiedDraft.date === selectedDate) return copiedDraft
    if (selectedPlan) return { ...selectedPlan, source: 'coach', items: selectedPlan.items.map((item) => ({ ...item })) }
    return planDraftFromRecentTrainingPlan(selectedMember.id, plans, selectedDate, 'coach', penaltySettings.check_in_deadline)
  }, [copiedDraft, penaltySettings.check_in_deadline, plans, selectedDate, selectedMember, selectedPlan])

  const hasCopiedDraftForSelection = Boolean(
    copiedDraft &&
    selectedMember &&
    copiedDraft.user_id === selectedMember.id &&
    copiedDraft.date === selectedDate,
  )
  const draftKey = hasCopiedDraftForSelection
    ? `copied-${copyDraftToken}`
    : `${draft?.id ?? 'new'}:${draft?.user_id ?? 'none'}:${draft?.date ?? 'none'}:${draft?.source ?? 'none'}:${draft?.title ?? ''}:${draft?.items.map((item) => item.name).join('|') ?? ''}`
  const isEditingCurrentMember = Boolean(selectedMember && editingMemberId === selectedMember.id)
  const savingCurrentMember = Boolean(selectedMember && savingMemberId === selectedMember.id)
  const selectedCheckIns = selectedMember ? checkIns.filter((item) => item.user_id === selectedMember.id) : []
  const selectedPenalties = selectedMember ? penalties.filter((item) => item.user_id === selectedMember.id) : []
  const planSubmitLabel = selectedPlan ? '修改计划' : '保存计划'

  const submitAdd = async () => {
    const result = await addMember(identifier, displayName)
    setAddMessage(result ?? '成员已绑定。')
    if (!result) {
      setDisplayName('')
      setIdentifier('')
    }
  }

  const startEditing = (memberId: string) => {
    const member = members.find((item) => item.id === memberId)
    setEditingMemberId(memberId)
    setEditingDisplayName(member ? displayMemberLabel(member) : '')
    setEditMessage('')
  }

  const cancelEditing = () => {
    setEditingMemberId('')
    setEditingDisplayName('')
    setEditMessage('')
  }

  const selectPlanDate = (date: string) => {
    setSelectedDate(date)
    const nextCalendarMonth = getMonthStartDate(date)
    if (nextCalendarMonth !== calendarMonthDate) setCalendarMonthDate(nextCalendarMonth)
    setCopiedDraft(null)
    setCopyMessage('')
  }

  const changeCalendarMonth = (amount: number) => {
    setCalendarMonthDate((current) => shiftMonth(current, amount))
  }

  const scrollToPlanWorkspace = () => {
    const target = planWorkspaceRef.current
    if (!target) return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })
  }

  const editPlanDate = (date: string) => {
    selectPlanDate(date)
    window.requestAnimationFrame(scrollToPlanWorkspace)
  }

  const selectMember = (memberId: string) => {
    setSelectedMemberId(memberId)
    setEditingMemberId('')
    setEditingDisplayName('')
    setEditMessage('')
    setCopiedDraft(null)
    setCopyMessage('')
    setExpandedPlanIds(new Set())
    setCalendarOpen(false)
    setCalendarMonthDate(getMonthStartDate(today))
  }

  const copyPlanToToday = (plan: Plan) => {
    if (!selectedMember) return
    const hasTodayPlan = plans.some((item) => item.date === today)
    const message = hasTodayPlan ? '已填入今天编辑框，保存后才会替换今天已有计划。' : '已填入今天编辑框，调整后再保存。'
    setSelectedDate(today)
    setCopiedDraft({
      ...planDraftFromPlan(selectedMember.id, plan, today, 'coach'),
      deadline: penaltySettings.check_in_deadline,
    })
    setCopyDraftToken((current) => current + 1)
    setCopyMessage(message)
    notifyApp({ tone: 'success', message: `已把 ${formatDay(plan.date)} 的计划填入今天编辑框。` })
  }

  const togglePlanExpanded = (planId: string) => {
    setExpandedPlanIds((current) => {
      const next = new Set(current)
      if (next.has(planId)) {
        next.delete(planId)
      } else {
        next.add(planId)
      }
      return next
    })
  }

  const submitDisplayName = async () => {
    if (savingMemberIdRef.current) return
    savingMemberIdRef.current = editingMemberId
    setSavingMemberId(editingMemberId)
    try {
      const result = await updateMemberDisplayName(editingMemberId, editingDisplayName)
      setEditMessage(result ?? '昵称已更新。')
      if (!result) {
        setEditingMemberId('')
        setEditingDisplayName('')
      }
    } finally {
      savingMemberIdRef.current = ''
      setSavingMemberId('')
    }
  }

  const submitPlan = async (nextDraft: PlanDraft) => {
    const isUpdatingPlan = plans.some((plan) => plan.user_id === nextDraft.user_id && plan.date === nextDraft.date)
    if (!nextDraft.is_training) {
      const conflict = getRestConflict(nextDraft.date, plans, selectedCheckIns, selectedPenalties)
      if (conflict) {
        notifyApp({ tone: 'warning', message: conflict.message })
        throw new Error(conflict.message)
      }
    }
    await savePlan(nextDraft)
    notifyApp({ tone: 'success', message: isUpdatingPlan ? '计划已修改。' : '计划已保存。' })
    if (copiedDraft?.user_id === nextDraft.user_id && copiedDraft.date === nextDraft.date) {
      setCopiedDraft(null)
      setCopyMessage('')
    }
  }

  return (
    <section className="screen with-nav members-screen">
      <div className="page-title">
        <h2>成员计划</h2>
      </div>

      <div className="metric-row">
        <Metric icon={<Users />} label="已绑定成员" value={membersReady ? `${members.length} 人` : '同步中'} />
        <article className={`metric current-member-card${isEditingCurrentMember ? ' editing' : ''}`}>
          <div className="current-member-head">
            <span className="metric-icon"><CalendarDays /></span>
            {selectedMember && !isEditingCurrentMember && (
              <button
                aria-label={`修改 ${displayMemberLabel(selectedMember)} 的昵称`}
                className="member-edit-button current-member-edit-button"
                type="button"
                disabled={Boolean(savingMemberId)}
                onClick={() => startEditing(selectedMember.id)}
              >
                <Pencil size={16} />
                <span>改昵称</span>
              </button>
            )}
          </div>
          {isEditingCurrentMember ? (
            <form
              className="member-edit-form current-member-edit-form"
              onSubmit={(event) => {
                event.preventDefault()
                void submitDisplayName()
              }}
            >
              <label>
                成员昵称
                <input
                  autoFocus
                  maxLength={24}
                  value={editingDisplayName}
                  onChange={(event) => {
                    setEditingDisplayName(event.target.value)
                    setEditMessage('')
                  }}
                />
              </label>
              <div className="member-edit-actions">
                <button type="submit" disabled={savingCurrentMember}>
                  <Check size={16} />
                  {savingCurrentMember ? '保存中' : '保存'}
                </button>
                <button type="button" disabled={savingCurrentMember} onClick={cancelEditing}>
                  <X size={16} />
                  取消
                </button>
              </div>
            </form>
          ) : (
            <div className="metric-copy">
              <small>当前成员</small>
              <strong>{membersReady ? selectedMember ? displayMemberLabel(selectedMember) : '未选择' : '同步中'}</strong>
            </div>
          )}
          <span className="metric-bar" aria-hidden="true" />
        </article>
      </div>

      {(!membersReady || members.length === 0 || selectableMembers.length > 0) && <div className="member-list">
        {!membersReady && (
          <article className="member-card member-card-loading" aria-busy={membersLoading}>
            <span className="skeleton-line medium" />
          </article>
        )}
        {membersReady && members.length === 0 && <p className="muted">还没有绑定成员。</p>}
        {membersReady && selectableMembers.map((member) => {
          return (
            <article className="member-card" key={member.id}>
              <button
                aria-pressed={member.id === selectedMemberId}
                className="member-card-main"
                type="button"
                onClick={() => selectMember(member.id)}
              >
                <strong>{displayMemberLabel(member)}</strong>
                <span>切换到此成员</span>
              </button>
            </article>
          )
        })}
      </div>}
      {editMessage && <p className={editMessage === '昵称已更新。' ? 'form-success' : 'form-error'}>{editMessage}</p>}

      {selectedMember && draft && (
        <>
          <PlanCalendarIndex
            days={calendarDays}
            isOpen={calendarOpen}
            monthLabel={calendarMonthLabel}
            plansByDate={plansByDate}
            selectedDate={selectedDate}
            onEditSelected={scrollToPlanWorkspace}
            onSelectDate={selectPlanDate}
            onShiftMonth={changeCalendarMonth}
            onToggle={() => setCalendarOpen((current) => !current)}
          />

          <section className="planned-list-section coach-plan-module coach-plan-module-week" aria-label={`${displayMemberLabel(selectedMember)} 已安排的计划`}>
            <div className="coach-plan-module-head">
              <div className="coach-plan-module-title">
                <span className="coach-plan-module-index">02</span>
                <h3>本周安排</h3>
              </div>
              <span>{formatDay(week[0].date)} - {formatDay(week[6].date)}</span>
            </div>
            {weekPlans.length === 0 ? (
              <div className="status-card action-card planned-empty-card">
                <strong>本周还没有安排计划</strong>
              </div>
            ) : (
              <div className="week-list planned-week-list">
                {weekPlans.map((plan) => {
                  const isExpanded = expandedPlanIds.has(plan.id)
                  const hasTrainingDetails = plan.is_training && plan.items.length > 0
                  const detailId = `planned-plan-exercises-${plan.id}`
                  return (
                    <article
                      className={plan.date === selectedDate ? 'day-card planned-plan-card active' : 'day-card planned-plan-card'}
                      key={plan.id}
                    >
                      <div className="planned-plan-topline">
                        <div className="planned-plan-main">
                          <strong>{formatDay(plan.date)} · {plan.title}</strong>
                          <div className="planned-plan-meta" aria-label="计划摘要">
                            <span className={`planned-source-chip ${plan.source}`}>{plan.source === 'coach' ? '教练制定' : '成员自定'}</span>
                            <span className="planned-count-chip">{hasTrainingDetails ? `${plan.items.length} 个动作` : '休息日'}</span>
                          </div>
                        </div>
                        <div className="planned-plan-actions">
                          {hasTrainingDetails && plan.date !== today && (
                            <button className="planned-copy-button" type="button" onClick={() => copyPlanToToday(plan)}>
                              <Copy size={16} />
                              复制到今天
                            </button>
                          )}
                          <button
                            aria-pressed={plan.date === selectedDate}
                            className="planned-edit-button"
                            type="button"
                            onClick={() => editPlanDate(plan.date)}
                          >
                            <Pencil size={16} />
                            {hasTrainingDetails ? '编辑' : '调整'}
                          </button>
                          {hasTrainingDetails && (
                            <button
                              aria-controls={detailId}
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? '收起' : '展开'} ${formatDay(plan.date)} 的动作详情`}
                              className="planned-expand-button"
                              type="button"
                              onClick={() => togglePlanExpanded(plan.id)}
                            >
                              <ChevronDown size={17} aria-hidden="true" />
                              <span>{isExpanded ? '收起' : '展开'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {hasTrainingDetails && isExpanded && (
                        <div className="planned-plan-exercises" id={detailId}>
                          {planToExercises(plan).map((exercise) => (
                            <ExerciseCard exercise={exercise} key={exercise.id} />
                          ))}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section
            className={copyMessage ? 'plan-workspace coach-plan-module coach-plan-module-editor plan-workspace-copied' : 'plan-workspace coach-plan-module coach-plan-module-editor'}
            ref={planWorkspaceRef}
            aria-label={`给 ${displayMemberLabel(selectedMember)} 制定计划`}
          >
            <div className="coach-plan-module-head">
              <div className="coach-plan-module-title">
                <span className="coach-plan-module-index">03</span>
                <h3>给 {displayMemberLabel(selectedMember)} 制定计划</h3>
              </div>
              <span>{formatDay(selectedDate)}</span>
            </div>
            <div className="week-tabs">
              {week.map((day) => (
                <button
                  aria-label={formatDay(day.date)}
                  aria-pressed={day.date === selectedDate}
                  className={day.date === selectedDate ? 'active' : ''}
                  key={day.date}
                  type="button"
                  onClick={() => selectPlanDate(day.date)}
                >
                  <span className="week-tab-day">{weekDayLabels[day.dayOfWeek]}</span>
                  <span className="week-tab-date">{compactMonthDay(day.date)}</span>
                </button>
              ))}
            </div>
            {copyMessage && <p className="form-success plan-copy-note" role="status" aria-live="polite">{copyMessage}</p>}
            <PlanEditor
              checkInDeadline={penaltySettings.check_in_deadline}
              key={draftKey}
              initial={draft}
              submitLabel={planSubmitLabel}
              onSubmit={submitPlan}
            />
          </section>
        </>
      )}

      <section className="low-frequency-section" aria-label="低频成员管理">
        <div className="section-heading compact-heading">
          <h3>添加成员</h3>
          <span>低频管理</span>
        </div>
        <div className="form-card add-member-card">
          <div className="form-card-head">
            <strong>绑定新成员</strong>
            <span>成员先登录或创建账号，你再用邮箱或成员码把他加入管理端。</span>
          </div>
          <label>
            成员昵称
            <input
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
                setAddMessage('')
              }}
              placeholder="例如：1号、妈妈、叔叔"
            />
          </label>
          <label>
            成员邮箱或成员码
            <input
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value)
                setAddMessage('')
              }}
              placeholder="member@example.com 或 MEMBER01"
            />
          </label>
          <button className="admin-button" type="button" onClick={() => void submitAdd()}>
            <UserPlus size={18} />
            绑定成员
          </button>
          {addMessage && <p className={addMessage === '成员已绑定。' ? 'form-success' : 'form-error'}>{addMessage}</p>}
          {!addMessage && message && <p className="form-error">{message}</p>}
        </div>
      </section>
    </section>
  )
}

function PlanCalendarIndex({
  days,
  isOpen,
  monthLabel,
  onEditSelected,
  onToggle,
  onSelectDate,
  onShiftMonth,
  plansByDate,
  selectedDate,
}: {
  days: MonthCalendarDay[]
  isOpen: boolean
  monthLabel: string
  onEditSelected: () => void
  onToggle: () => void
  onSelectDate: (date: string) => void
  onShiftMonth: (amount: number) => void
  plansByDate: Map<string, Plan>
  selectedDate: string
}) {
  const selectedPlan = plansByDate.get(selectedDate)
  const selectedSource = calendarPlanSource(selectedPlan)
  const selectedStatus = selectedPlan
    ? selectedPlan.is_training
      ? `${selectedPlan.items.length} 个动作`
      : '休息日'
    : '未安排'

  return (
    <section className={`plan-calendar-section coach-plan-module coach-plan-module-calendar${isOpen ? ' expanded' : ' collapsed'}`} aria-label="计划日历索引">
      <div className="coach-plan-module-head">
        <div className="coach-plan-module-title">
          <span className="coach-plan-module-index">01</span>
          <h3>计划日历</h3>
        </div>
        <button
          aria-expanded={isOpen}
          className="calendar-toggle-button ghost-button"
          type="button"
          onClick={onToggle}
        >
          <ChevronDown size={17} aria-hidden="true" />
          {isOpen ? '收起日历' : '展开日历'}
        </button>
      </div>
      <div className="plan-calendar-card">
        <div className="plan-calendar-compact">
          <div>
            <small>当前选择</small>
            <strong>{formatDay(selectedDate)}</strong>
          </div>
          <div className="plan-calendar-compact-meta" aria-label="选中日期计划摘要">
            {selectedPlan ? (
              <span>{selectedStatus}</span>
            ) : (
              <button
                aria-label={`${formatDay(selectedDate)}，去制定计划`}
                className="plan-calendar-unplanned-button"
                type="button"
                onClick={onEditSelected}
              >
                去安排
              </button>
            )}
            {selectedSource && <span>{selectedSource}</span>}
          </div>
        </div>
        {isOpen && (
          <>
            <div className="plan-calendar-toolbar">
              <button className="month-nav-button" type="button" onClick={() => onShiftMonth(-1)} aria-label="上个月">
                <ChevronLeft size={18} />
              </button>
              <strong>{monthLabel}</strong>
              <button className="month-nav-button" type="button" onClick={() => onShiftMonth(1)} aria-label="下个月">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="plan-calendar-grid">
              {days.map((day) => {
                const plan = plansByDate.get(day.date)
                const source = calendarPlanSource(plan)
                const className = [
                  'plan-calendar-day',
                  day.inCurrentMonth ? '' : 'outside',
                  day.isToday ? 'today' : '',
                  day.date === selectedDate ? 'selected' : '',
                  plan ? 'has-plan' : '',
                ].filter(Boolean).join(' ')

                return (
                  <button
                    aria-label={`${formatDay(day.date)}，${calendarPlanStatus(plan)}${source ? `，${source}` : ''}`}
                    aria-pressed={day.date === selectedDate}
                    className={className}
                    key={day.date}
                    type="button"
                    onClick={() => onSelectDate(day.date)}
                  >
                    <span className="calendar-day-number">{day.dayOfMonth}</span>
                    <span className="calendar-day-status">{calendarPlanStatus(plan)}</span>
                    {source && <span className="calendar-day-source">{source}</span>}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
