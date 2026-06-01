import assert from 'node:assert/strict'
import test from 'node:test'
import { computeConsecutiveMisses } from '../src/lib/penalty.ts'
import { buildMissedSync } from '../src/lib/sync.ts'
import { buildLeaveRequestReason, validateLeaveRequest } from '../src/lib/leaveRequest.ts'
import { normalizePenaltySettings } from '../src/lib/penaltySettings.ts'
import { latestCoachTrainingPlanBefore, normalizePlanDraftForSave, planDraftFromPlan, studentDraftFromRecentCoachPlan } from '../src/lib/plan.ts'
import { getMonthCalendarDays, getPlansInWeek, getStudentPlanCardAction, getWeekDates } from '../src/lib/planCalendar.ts'
import { getRestConflict } from '../src/lib/restRules.ts'
import { getContributionPromptState, getRestChoiceActionState } from '../src/lib/todayPrompts.ts'
import type { CheckIn, Penalty, Plan } from '../src/lib/types.ts'

const userId = 'student-1'

function missedCheckIn(date: string): CheckIn {
  return {
    id: `check-${date}`,
    user_id: userId,
    plan_id: null,
    date,
    status: 'missed',
    fatigue: null,
    issues: [],
    note: '最近 7 天无计划且未打卡',
    leave_reason: null,
  }
}

function penalty(date: string, consecutiveCount: number, amount: number, status: Penalty['status'] = 'pending'): Penalty {
  return {
    id: `penalty-${date}`,
    user_id: userId,
    date,
    amount,
    consecutive_count: consecutiveCount,
    status,
    reason: '训练日未打卡',
    source_type: 'missed_checkin',
    source_id: `check-${date}`,
  }
}

function plan(date: string, isTraining: boolean): Pick<Plan, 'date' | 'is_training'> {
  return { date, is_training: isTraining }
}

function fullPlan(overrides: Partial<Plan> & Pick<Plan, 'date' | 'id'>): Plan {
  return {
    id: overrides.id,
    user_id: overrides.user_id ?? userId,
    date: overrides.date,
    title: overrides.title ?? '教练训练',
    focus: overrides.focus ?? '力量',
    deadline: overrides.deadline ?? '23:00',
    is_training: overrides.is_training ?? true,
    source: overrides.source ?? 'coach',
    items: overrides.items ?? [
      {
        id: `${overrides.id}-item-2`,
        plan_id: overrides.id,
        name: '后做动作',
        sets: '2 组',
        reps: '8 次',
        note: '排第二',
        sort_order: 1,
      },
      {
        id: `${overrides.id}-item-1`,
        plan_id: overrides.id,
        name: '先做动作',
        sets: '1 组',
        reps: '10 次',
        note: '排第一',
        sort_order: 0,
      },
    ],
  }
}

test('buildMissedSync recalculates old same-day missed penalties into a continuous sequence', () => {
  const dates = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22']
  const synced = buildMissedSync(
    userId,
    [],
    dates.map(missedCheckIn),
    [
      penalty('2026-05-18', 1, 10),
      penalty('2026-05-19', 1, 10),
      penalty('2026-05-20', 2, 20, 'waived'),
      penalty('2026-05-21', 4, 40, 'paid'),
      penalty('2026-05-22', 5, 50),
    ],
    new Date('2026-05-23T12:00:00'),
    '2026-05-18',
  )

  const byDate = new Map(synced.penalties.map((item) => [item.date, item]))
  assert.deepEqual(
    dates.map((date) => byDate.get(date)?.consecutive_count),
    [1, 2, 3, 4, 5],
  )
  assert.deepEqual(
    dates.map((date) => byDate.get(date)?.amount),
    [10, 20, 30, 40, 50],
  )
  assert.equal(byDate.get('2026-05-20')?.status, 'waived')
  assert.equal(byDate.get('2026-05-21')?.status, 'paid')
})

test('a rest day breaks the missed-check-in streak', () => {
  const count = computeConsecutiveMisses(
    '2026-05-20',
    [plan('2026-05-19', false)],
    [missedCheckIn('2026-05-18'), missedCheckIn('2026-05-20')],
    [penalty('2026-05-18', 1, 10)],
  )

  assert.equal(count, 1)
})

test('penalty settings normalize check-in deadline with a safe fallback', () => {
  assert.equal(normalizePenaltySettings({ check_in_deadline: '22:30' }).check_in_deadline, '22:30')
  assert.equal(normalizePenaltySettings({ check_in_deadline: '25:99' }).check_in_deadline, '23:00')
})

test('missed sync uses the global check-in deadline before plan deadline', () => {
  const synced = buildMissedSync(
    userId,
    [fullPlan({ id: 'late-plan', date: '2026-05-30', deadline: '23:00' })],
    [],
    [],
    new Date('2026-05-30T22:05:00'),
    '2026-05-01',
    normalizePenaltySettings({ check_in_deadline: '22:00' }),
  )

  assert.equal(synced.checkIns.find((checkIn) => checkIn.date === '2026-05-30')?.status, 'missed')
})

test('rest is blocked after an adjacent rest day or effective missed day', () => {
  assert.equal(
    getRestConflict('2026-05-27', [plan('2026-05-26', false)], [], [])?.kind,
    'rest',
  )
  assert.equal(
    getRestConflict('2026-05-27', [], [missedCheckIn('2026-05-26')], [])?.kind,
    'missed',
  )
  assert.equal(
    getRestConflict('2026-05-27', [], [], [penalty('2026-05-26', 1, 10, 'waived')]),
    null,
  )
})

test('leave request requires off-work time and fatigue, then formats them for review', () => {
  assert.match(
    validateLeaveRequest({ offWorkTime: '', fatigue: 4, reason: '加班太晚' }) ?? '',
    /到家时间/,
  )
  assert.match(
    validateLeaveRequest({ offWorkTime: '21:30', fatigue: null, reason: '加班太晚' }) ?? '',
    /疲劳度/,
  )
  assert.equal(validateLeaveRequest({ offWorkTime: '21:30', fatigue: 4, reason: '加班太晚' }), null)
  assert.equal(
    buildLeaveRequestReason({ offWorkTime: '21:30', fatigue: 4, reason: '加班太晚' }),
    '到家时间 21:30；疲劳度 4/5；理由：加班太晚',
  )
})

test('contribution prompt appears once per login run when pending penalties exist', () => {
  const prompt = getContributionPromptState(
    userId,
    'login-1',
    [penalty('2026-05-26', 1, 100)],
    null,
    null,
  )

  assert.equal(prompt?.key, `${userId}:login-1`)
  assert.equal(prompt?.pendingTotal, 100)
  assert.equal(prompt?.latestDate, '2026-05-26')
  assert.equal(
    getContributionPromptState(userId, 'login-1', [penalty('2026-05-26', 1, 100)], null, prompt?.key ?? null),
    null,
  )
})

test('contribution prompt stays hidden without pending penalties and includes rest warning on conflict', () => {
  assert.equal(
    getContributionPromptState(userId, 'login-1', [penalty('2026-05-26', 1, 100, 'paid')], null, null),
    null,
  )

  const conflict = getRestConflict('2026-05-27', [], [missedCheckIn('2026-05-26')], [])
  const prompt = getContributionPromptState(userId, 'login-2', [penalty('2026-05-26', 1, 100)], conflict, null)
  assert.match(prompt?.restWarning ?? '', /今天不能休息，只能训练或申请请假/)
})

test('blocked rest action uses business feedback and does not allow rest save', () => {
  const blocked = getRestChoiceActionState('昨天已缺卡，今天只能训练或申请请假，不能再记休息。')
  assert.equal(blocked.canSubmit, false)
  assert.equal(blocked.label, '今天不能休息')
  assert.match(blocked.notice ?? '', /昨天已缺卡/)

  const allowed = getRestChoiceActionState(null)
  assert.equal(allowed.canSubmit, true)
  assert.equal(allowed.label, '今日休息')
})

test('plan calendar helpers build monday-first weeks and month grids', () => {
  assert.deepEqual(
    getWeekDates('2026-05-27'),
    ['2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'],
  )

  const month = getMonthCalendarDays('2026-05-27', '2026-05-27')
  assert.deepEqual(
    month.slice(0, 7).map((day) => day.date),
    ['2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02', '2026-05-03'],
  )
  assert.equal(month[0].inCurrentMonth, false)
  assert.equal(month.find((day) => day.date === '2026-05-27')?.isToday, true)
})

test('weekly arranged plans only include the selected week sorted monday to sunday', () => {
  const plans = [
    plan('2026-05-20', true),
    plan('2026-05-31', false),
    plan('2026-05-25', true),
    plan('2026-06-01', true),
    plan('2026-05-27', true),
  ]

  assert.deepEqual(
    getPlansInWeek(plans, '2026-05-27').map((item) => item.date),
    ['2026-05-25', '2026-05-27', '2026-05-31'],
  )
})

test('student plan card actions hide rest details and keep training actions', () => {
  assert.deepEqual(getStudentPlanCardAction(), {
    canConvertRestToTraining: false,
    canEdit: true,
    canView: false,
    editLabel: '制定计划',
  })
  assert.deepEqual(getStudentPlanCardAction({ is_training: true, source: 'coach' }), {
    canConvertRestToTraining: false,
    canEdit: false,
    canView: true,
    editLabel: null,
  })
  assert.deepEqual(getStudentPlanCardAction({ is_training: true, source: 'student' }), {
    canConvertRestToTraining: false,
    canEdit: true,
    canView: true,
    editLabel: '编辑计划',
  })
  assert.deepEqual(getStudentPlanCardAction({ is_training: false, source: 'student' }), {
    canConvertRestToTraining: true,
    canEdit: false,
    canView: false,
    editLabel: '改成训练',
  })
  assert.deepEqual(getStudentPlanCardAction({ is_training: false, source: 'coach' }), {
    canConvertRestToTraining: false,
    canEdit: false,
    canView: false,
    editLabel: null,
  })
})

test('coach training plan can be copied into a new student draft for today', () => {
  const sourcePlan = fullPlan({ id: 'coach-plan-1', date: '2026-05-28' })
  const draft = planDraftFromPlan(userId, sourcePlan, '2026-05-30', 'student')

  assert.equal('id' in draft, false)
  assert.equal(draft.user_id, userId)
  assert.equal(draft.date, '2026-05-30')
  assert.equal(draft.source, 'student')
  assert.equal(draft.title, sourcePlan.title)
  assert.deepEqual(
    draft.items.map((item) => [item.name, item.sort_order, 'id' in item]),
    [
      ['先做动作', 0, false],
      ['后做动作', 1, false],
    ],
  )
})

test('latest coach training plan ignores rest days, student plans, and future dates', () => {
  const plans = [
    fullPlan({ id: 'old-coach-training', date: '2026-05-20' }),
    fullPlan({ id: 'student-training', date: '2026-05-29', source: 'student' }),
    fullPlan({ id: 'coach-rest', date: '2026-05-29', is_training: false }),
    fullPlan({ id: 'latest-coach-training', date: '2026-05-28' }),
    fullPlan({ id: 'future-coach-training', date: '2026-05-31' }),
  ]

  assert.equal(latestCoachTrainingPlanBefore(plans, '2026-05-30')?.id, 'latest-coach-training')
  assert.equal(latestCoachTrainingPlanBefore(plans, '2026-05-20'), undefined)
})

test('student self-plan draft falls back to the template without coach history', () => {
  const draft = studentDraftFromRecentCoachPlan(
    userId,
    [fullPlan({ id: 'student-plan', date: '2026-05-28', source: 'student' })],
    '2026-05-30',
    {
      date: '2026-05-30',
      dayOfWeek: 6,
      title: '模板训练',
      focus: '平衡',
      deadline: '22:30',
      isTraining: true,
      exercises: [
        {
          id: 'template-item',
          name: '模板动作',
          sets: '3 组',
          reps: '20 秒',
          note: '稳一点',
        },
      ],
    },
  )

  assert.equal(draft.source, 'student')
  assert.equal(draft.title, '模板训练')
  assert.equal(draft.deadline, '22:30')
  assert.deepEqual(draft.items.map((item) => item.name), ['模板动作'])
})

test('plan draft save normalization applies check-in deadline and rest defaults', () => {
  const trainingDraft = normalizePlanDraftForSave(
    {
      user_id: userId,
      date: '2026-05-30',
      title: '',
      focus: '',
      deadline: '21:00',
      is_training: true,
      source: 'student',
      items: [{ name: '深蹲', sets: '3 组', reps: '8 次', note: '', sort_order: 4 }],
    },
    '22:30',
  )
  const restDraft = normalizePlanDraftForSave({ ...trainingDraft, is_training: false, title: '', focus: '' }, '23:30')

  assert.equal(trainingDraft.deadline, '22:30')
  assert.equal(trainingDraft.items[0].sort_order, 0)
  assert.equal(restDraft.title, '今日休息')
  assert.equal(restDraft.focus, '恢复调整')
  assert.equal(restDraft.deadline, '23:30')
  assert.deepEqual(restDraft.items, [])
})
