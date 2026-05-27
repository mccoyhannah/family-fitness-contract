import assert from 'node:assert/strict'
import test from 'node:test'
import { computeConsecutiveMisses } from '../src/lib/penalty.ts'
import { buildMissedSync } from '../src/lib/sync.ts'
import { buildLeaveRequestReason, validateLeaveRequest } from '../src/lib/leaveRequest.ts'
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
    /下班时间/,
  )
  assert.match(
    validateLeaveRequest({ offWorkTime: '21:30', fatigue: null, reason: '加班太晚' }) ?? '',
    /疲劳度/,
  )
  assert.equal(validateLeaveRequest({ offWorkTime: '21:30', fatigue: 4, reason: '加班太晚' }), null)
  assert.equal(
    buildLeaveRequestReason({ offWorkTime: '21:30', fatigue: 4, reason: '加班太晚' }),
    '下班时间 21:30；疲劳度 4/5；理由：加班太晚',
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
