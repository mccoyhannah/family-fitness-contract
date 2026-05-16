import { CalendarDays, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import ExerciseCard from '../../components/ExerciseCard'
import Metric from '../../components/Metric'
import PlanEditor from '../../components/PlanEditor'
import { useAuth } from '../../hooks/useAuth'
import { useMembers } from '../../hooks/useMembers'
import { usePlans } from '../../hooks/usePlans'
import { formatDay, toISODate } from '../../lib/date'
import { buildPlan, planFromTemplate, planToExercises } from '../../lib/plan'
import type { PlanDraft } from '../../lib/types'

function todayDraft(userId: string, date: string): PlanDraft {
  const template = buildPlan(new Date(`${date}T12:00:00`)).find((day) => day.date === date) ?? buildPlan(new Date())[0]
  return planFromTemplate(userId, template, 'coach')
}

export default function CoachMembers() {
  const { profile } = useAuth()
  const { addMember, members, message, selectedMember, selectedMemberId, setSelectedMemberId } = useMembers(profile?.id)
  const { plans, savePlan } = usePlans(selectedMember?.id)
  const [identifier, setIdentifier] = useState('')
  const [addMessage, setAddMessage] = useState('')
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()))
  const week = useMemo(() => buildPlan(new Date(`${selectedDate}T12:00:00`)), [selectedDate])
  const selectedPlan = plans.find((plan) => plan.date === selectedDate)

  const draft = useMemo<PlanDraft | null>(() => {
    if (!selectedMember) return null
    if (selectedPlan) return { ...selectedPlan, source: 'coach', items: selectedPlan.items }
    return todayDraft(selectedMember.id, selectedDate)
  }, [selectedDate, selectedMember, selectedPlan])

  const submitAdd = async () => {
    const result = await addMember(identifier)
    setAddMessage(result ?? '成员已绑定。')
    if (!result) setIdentifier('')
  }

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>成员管理</h2>
        <p>先让成员拥有 Supabase 账号，再用邮箱或成员码绑定到你的管理端。</p>
      </div>

      <div className="metric-row">
        <Metric icon={<Users />} label="已绑定成员" value={`${members.length} 人`} />
        <Metric icon={<CalendarDays />} label="当前成员" value={selectedMember?.name ?? '未选择'} />
      </div>

      <div className="form-card">
        <label>
          添加成员
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="成员邮箱或成员码"
          />
        </label>
        <button className="admin-button" type="button" onClick={() => void submitAdd()}>
          <UserPlus size={18} />
          绑定成员
        </button>
        {(addMessage || message) && <p className="muted">{addMessage || message}</p>}
      </div>

      <div className="member-list">
        {members.length === 0 && <p className="muted">还没有绑定成员。</p>}
        {members.map((member) => (
          <button
            className={member.id === selectedMemberId ? 'member-card active' : 'member-card'}
            key={member.id}
            type="button"
            onClick={() => setSelectedMemberId(member.id)}
          >
            <strong>{member.name}</strong>
            <span>{member.email || member.member_code || '成员账号'}</span>
          </button>
        ))}
      </div>

      {selectedMember && draft && (
        <>
          <div className="section-heading">
            <h3>给 {selectedMember.name} 制定计划</h3>
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
          <div className="week-list">
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
        </>
      )}
    </section>
  )
}
