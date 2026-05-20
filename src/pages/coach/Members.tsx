import { Check, CalendarDays, Copy, Pencil, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import Metric from '../../components/Metric'
import PlanEditor from '../../components/PlanEditor'
import { useAuth } from '../../hooks/useAuth'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay, toISODate } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { notifyApp } from '../../lib/notice'
import { buildPlan, planFromTemplate, planToExercises } from '../../lib/plan'
import type { Plan, PlanDraft } from '../../lib/types'

function todayDraft(userId: string, date: string): PlanDraft {
  const template = buildPlan(new Date(`${date}T12:00:00`)).find((day) => day.date === date) ?? buildPlan(new Date())[0]
  return planFromTemplate(userId, template, 'coach')
}

function planToTodayDraft(userId: string, plan: Plan, date: string): PlanDraft {
  return {
    user_id: userId,
    date,
    title: plan.title,
    focus: plan.focus,
    deadline: plan.deadline,
    is_training: plan.is_training,
    source: 'coach',
    items: plan.items
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item, index) => ({
        name: item.name,
        sets: item.sets,
        reps: item.reps,
        note: item.note,
        sort_order: index,
      })),
  }
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
  const [copiedDraft, setCopiedDraft] = useState<PlanDraft | null>(null)
  const [copyDraftToken, setCopyDraftToken] = useState(0)
  const [copyMessage, setCopyMessage] = useState('')
  const today = toISODate(new Date())
  const week = useMemo(() => buildPlan(new Date(`${selectedDate}T12:00:00`)), [selectedDate])
  const selectedPlan = plans.find((plan) => plan.date === selectedDate)
  const selectableMembers = useMemo(
    () => selectedMemberId ? members.filter((member) => member.id !== selectedMemberId) : members,
    [members, selectedMemberId],
  )
  const orderedPlans = useMemo(
    () =>
      plans.slice().sort((a, b) => {
        const aUpcoming = a.date >= today
        const bUpcoming = b.date >= today
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
        return aUpcoming ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
      }),
    [plans, today],
  )

  const draft = useMemo<PlanDraft | null>(() => {
    if (!selectedMember) return null
    if (copiedDraft?.user_id === selectedMember.id && copiedDraft.date === selectedDate) return copiedDraft
    if (selectedPlan) return { ...selectedPlan, source: 'coach', items: selectedPlan.items.map((item) => ({ ...item })) }
    return todayDraft(selectedMember.id, selectedDate)
  }, [copiedDraft, selectedDate, selectedMember, selectedPlan])

  const hasCopiedDraftForSelection = Boolean(
    copiedDraft &&
    selectedMember &&
    copiedDraft.user_id === selectedMember.id &&
    copiedDraft.date === selectedDate,
  )
  const draftKey = hasCopiedDraftForSelection
    ? `copied-${copyDraftToken}`
    : `${draft?.id ?? 'new'}:${draft?.user_id ?? 'none'}:${draft?.date ?? 'none'}:${draft?.source ?? 'none'}`
  const isEditingCurrentMember = Boolean(selectedMember && editingMemberId === selectedMember.id)
  const savingCurrentMember = Boolean(selectedMember && savingMemberId === selectedMember.id)

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
    setCopiedDraft(null)
    setCopyMessage('')
  }

  const selectMember = (memberId: string) => {
    setSelectedMemberId(memberId)
    setEditingMemberId('')
    setEditingDisplayName('')
    setEditMessage('')
    setCopiedDraft(null)
    setCopyMessage('')
  }

  const copyPlanToToday = (plan: Plan) => {
    if (!selectedMember) return
    const hasTodayPlan = plans.some((item) => item.date === today)
    const message = hasTodayPlan ? '已填入今天编辑框，保存后才会替换今天已有计划。' : '已填入今天编辑框，调整后再保存。'
    setSelectedDate(today)
    setCopiedDraft(planToTodayDraft(selectedMember.id, plan, today))
    setCopyDraftToken((current) => current + 1)
    setCopyMessage(message)
    notifyApp({ tone: 'success', message: `已把 ${formatDay(plan.date)} 的计划填入今天编辑框。` })
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
    await savePlan(nextDraft)
    if (copiedDraft?.user_id === nextDraft.user_id && copiedDraft.date === nextDraft.date) {
      setCopiedDraft(null)
      setCopyMessage('今天计划已保存。')
    }
  }

  return (
    <section className="screen with-nav members-screen">
      <div className="page-title">
        <h2>成员计划</h2>
        <p>先选成员，再给他安排今天或本周的训练。添加新成员是低频管理项，放在页面后面。</p>
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
          <section className="planned-list-section" aria-label={`${displayMemberLabel(selectedMember)} 已安排的计划`}>
            <div className="section-heading compact-heading">
              <h3>已安排计划</h3>
              <span>{plans.length} 天</span>
            </div>
            {plans.length === 0 ? (
              <div className="status-card action-card planned-empty-card">
                <strong>还没有安排计划</strong>
                <p>可在下方制定，保存后会出现在这里。</p>
              </div>
            ) : (
              <div className="week-list planned-week-list">
                {orderedPlans.map((plan) => (
                  <article
                    className={plan.date === selectedDate ? 'day-card planned-plan-card active' : 'day-card planned-plan-card'}
                    key={plan.id}
                  >
                    <button
                      aria-pressed={plan.date === selectedDate}
                      className="planned-plan-main"
                      type="button"
                      onClick={() => selectPlanDate(plan.date)}
                    >
                      <strong>{formatDay(plan.date)} · {plan.title}</strong>
                    </button>
                    <div className="planned-plan-exercises">
                      {planToExercises(plan).map((exercise) => (
                        <ExerciseCard exercise={exercise} key={exercise.id} />
                      ))}
                    </div>
                    <div className="planned-plan-actions">
                      <span className="planned-source-chip">{plan.source === 'coach' ? '教练制定' : '成员自定'}</span>
                      <button className="planned-copy-button" type="button" onClick={() => copyPlanToToday(plan)}>
                        <Copy size={16} />
                        复制到今天
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className={copyMessage ? 'plan-workspace plan-workspace-copied' : 'plan-workspace'}
            aria-label={`给 ${displayMemberLabel(selectedMember)} 制定计划`}
          >
            <div className="section-heading">
              <h3>给 {displayMemberLabel(selectedMember)} 制定计划</h3>
              <span>{formatDay(selectedDate)}</span>
            </div>
            <div className="week-tabs">
              {week.map((day) => (
                <button
                  className={day.date === selectedDate ? 'active' : ''}
                  key={day.date}
                  type="button"
                  onClick={() => selectPlanDate(day.date)}
                >
                  {formatDay(day.date)}
                </button>
              ))}
            </div>
            {copyMessage && <p className="form-success plan-copy-note" role="status" aria-live="polite">{copyMessage}</p>}
            <PlanEditor key={draftKey} initial={draft} submitLabel="保存教练计划" onSubmit={submitPlan} />
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
