import { Check, CalendarDays, Pencil, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import Metric from '../../components/Metric'
import PlanEditor from '../../components/PlanEditor'
import { useAuth } from '../../hooks/useAuth'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay, toISODate } from '../../lib/date'
import { displayMemberLabel } from '../../lib/memberLabels'
import { buildPlan, planFromTemplate, planToExercises } from '../../lib/plan'
import type { PlanDraft } from '../../lib/types'

function todayDraft(userId: string, date: string): PlanDraft {
  const template = buildPlan(new Date(`${date}T12:00:00`)).find((day) => day.date === date) ?? buildPlan(new Date())[0]
  return planFromTemplate(userId, template, 'coach')
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
  const week = useMemo(() => buildPlan(new Date(`${selectedDate}T12:00:00`)), [selectedDate])
  const selectedPlan = plans.find((plan) => plan.date === selectedDate)

  const draft = useMemo<PlanDraft | null>(() => {
    if (!selectedMember) return null
    if (selectedPlan) return { ...selectedPlan, source: 'coach', items: selectedPlan.items.map((item) => ({ ...item })) }
    return todayDraft(selectedMember.id, selectedDate)
  }, [selectedDate, selectedMember, selectedPlan])

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

  return (
    <section className="screen with-nav members-screen">
      <div className="page-title">
        <h2>成员计划</h2>
        <p>先选成员，再给他安排今天或本周的训练。添加新成员是低频管理项，放在页面后面。</p>
      </div>

      <div className="metric-row">
        <Metric icon={<Users />} label="已绑定成员" value={membersReady ? `${members.length} 人` : '同步中'} />
        <Metric icon={<CalendarDays />} label="当前成员" value={membersReady ? selectedMember ? displayMemberLabel(selectedMember) : '未选择' : '同步中'} />
      </div>

      <div className="member-list">
        {!membersReady && (
          <article className="member-card member-card-loading" aria-busy={membersLoading}>
            <span className="skeleton-line medium" />
          </article>
        )}
        {membersReady && members.length === 0 && <p className="muted">还没有绑定成员。</p>}
        {membersReady && members.map((member) => {
          const isEditing = editingMemberId === member.id
          const savingThisMember = savingMemberId === member.id
          return (
            <article className={member.id === selectedMemberId ? 'member-card active' : 'member-card'} key={member.id}>
              <button
                aria-pressed={member.id === selectedMemberId}
                className="member-card-main"
                type="button"
                onClick={() => setSelectedMemberId(member.id)}
              >
                <strong>{displayMemberLabel(member)}</strong>
              </button>
              {isEditing ? (
                <form
                  className="member-edit-form"
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
                    <button type="submit" disabled={savingThisMember}>
                      <Check size={16} />
                      {savingThisMember ? '保存中' : '保存'}
                    </button>
                    <button type="button" disabled={savingThisMember} onClick={cancelEditing}>
                      <X size={16} />
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  className="member-edit-button"
                  type="button"
                  disabled={Boolean(savingMemberId)}
                  onClick={() => startEditing(member.id)}
                >
                  <Pencil size={16} />
                  改昵称
                </button>
              )}
            </article>
          )
        })}
      </div>
      {editMessage && <p className={editMessage === '昵称已更新。' ? 'form-success' : 'form-error'}>{editMessage}</p>}

      {selectedMember && draft && (
        <>
          <section className="plan-workspace" aria-label={`给 ${displayMemberLabel(selectedMember)} 制定计划`}>
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
                  onClick={() => setSelectedDate(day.date)}
                >
                  {formatDay(day.date)}
                </button>
              ))}
            </div>
            <PlanEditor initial={draft} submitLabel="保存教练计划" onSubmit={async (nextDraft) => void (await savePlan(nextDraft))} />
          </section>

          <section className="planned-list-section" aria-label={`${displayMemberLabel(selectedMember)} 已安排的计划`}>
            <div className="section-heading compact-heading">
              <h3>已安排计划</h3>
              <span>{plans.length} 天</span>
            </div>
            {plans.length === 0 ? (
              <div className="status-card action-card">
                <strong>还没有保存过计划</strong>
                <p>上方保存后，这里会按日期列出已安排内容。</p>
              </div>
            ) : (
              <div className="week-list planned-week-list">
                {plans.map((plan) => (
                  <article className="day-card" key={plan.id}>
                    <div className="day-head">
                      <strong>{formatDay(plan.date)} · {plan.title}</strong>
                      <span>{plan.source === 'coach' ? '教练制定' : '成员自定'}</span>
                    </div>
                    {planToExercises(plan).map((exercise) => (
                      <ExerciseCard exercise={exercise} key={exercise.id} />
                    ))}
                  </article>
                ))}
              </div>
            )}
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
