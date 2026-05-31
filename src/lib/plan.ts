import { addDays, getWeekStart, toISODate } from './date'
import { normalizeCheckInDeadline } from './penaltySettings'
import { defaultPlanFocusForSource } from './planDisplay'
import type { Exercise, Plan, PlanDay, PlanDraft, PlanSource } from './types'

const ex = (id: string, name: string, sets: string, reps: string, note: string): Exercise => ({
  id,
  name,
  sets,
  reps,
  note,
})

export function buildPlan(today = new Date()): PlanDay[] {
  const monday = getWeekStart(today)
  const dates = Array.from({ length: 7 }, (_, index) => toISODate(addDays(monday, index)))

  return [
    day(dates[0], 1, '下肢力量', '腿部和髋部', '23:00', true, [
      ex('chair-squat', '椅子深蹲', '3 组', '8 次', '扶稳椅背，膝盖不内扣'),
      ex('calf-raise', '扶墙提踵', '3 组', '12 次', '慢起慢落，脚踝稳定'),
    ]),
    day(dates[1], 2, '轻有氧', '心肺和活动量', '23:00', true, [
      ex('walk', '快走', '1 次', '20 分钟', '能说话但微微喘'),
    ]),
    day(dates[2], 3, '上肢力量', '肩背和手臂', '23:00', true, [
      ex('wall-push', '墙壁俯卧撑', '3 组', '8 次', '身体成直线，手腕舒服'),
      ex('towel-row', '毛巾划船', '3 组', '10 次', '夹背发力，别耸肩'),
    ]),
    day(dates[3], 4, '主动恢复', '散步和拉伸', '23:00', false, [
      ex('easy-walk', '轻松散步', '1 次', '10-15 分钟', '舒服就好，不追求强度'),
    ]),
    day(dates[4], 5, '全身循环', '力量和协调', '23:00', true, [
      ex('sit-stand', '坐站转换', '3 组', '8 次', '坐稳再起，别抢速度'),
      ex('march', '原地抬腿', '3 组', '30 秒', '扶稳，保持呼吸'),
    ]),
    day(dates[5], 6, '平衡训练', '防跌倒和稳定', '23:00', true, [
      ex('single-leg', '扶椅单脚站', '3 组', '每侧 20 秒', '旁边有人或扶稳再做'),
      ex('heel-toe', '脚跟脚尖走', '3 组', '8 步', '速度慢，重心稳'),
    ]),
    day(dates[6], 0, '家庭复盘', '恢复和下周安排', '23:00', false, [
      ex('review', '身体反馈', '1 次', '3 分钟', '说一下哪里轻松、哪里不舒服'),
    ]),
  ]
}

function day(
  date: string,
  dayOfWeek: number,
  title: string,
  focus: string,
  deadline: string,
  isTraining: boolean,
  exercises: Exercise[],
): PlanDay {
  return { date, dayOfWeek, title, focus, deadline, isTraining, exercises }
}

export function findTemplateDay(date: string, today = new Date()) {
  return buildPlan(today).find((dayItem) => dayItem.date === date)
}

export function planFromTemplate(userId: string, planDay: PlanDay, source: PlanSource): PlanDraft {
  return {
    user_id: userId,
    date: planDay.date,
    title: planDay.title,
    focus: planDay.focus,
    deadline: planDay.deadline,
    is_training: planDay.isTraining,
    source,
    items: planDay.exercises.map((exercise, index) => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      note: exercise.note,
      sort_order: index,
    })),
  }
}

export function planDraftFromPlan(userId: string, plan: Plan, date: string, source: PlanSource): PlanDraft {
  return {
    user_id: userId,
    date,
    title: plan.title,
    focus: plan.focus,
    deadline: plan.deadline,
    is_training: plan.is_training,
    source,
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

export function latestCoachTrainingPlanBefore(plans: Plan[], date: string) {
  return plans
    .filter((plan) => plan.source === 'coach' && plan.is_training && plan.date < date)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
}

export function studentDraftFromRecentCoachPlan(
  userId: string,
  plans: Plan[],
  date: string,
  fallbackDay: PlanDay,
): PlanDraft {
  const latestCoachPlan = latestCoachTrainingPlanBefore(plans, date)
  if (latestCoachPlan) return planDraftFromPlan(userId, latestCoachPlan, date, 'student')
  return planFromTemplate(userId, fallbackDay, 'student')
}

export function normalizePlanDraftForSave(draft: PlanDraft, checkInDeadline: string): PlanDraft {
  const fallbackFocus = draft.is_training ? defaultPlanFocusForSource(draft.source) : '恢复调整'
  const items = draft.items
    .map((item, index) => ({ ...item, sort_order: index }))
    .filter((item) => item.name.trim())

  return {
    ...draft,
    title: draft.title.trim() || (draft.is_training ? '今日训练' : '今日休息'),
    focus: draft.focus.trim() || fallbackFocus,
    deadline: normalizeCheckInDeadline(checkInDeadline, draft.deadline || undefined),
    items: draft.is_training
      ? items.length > 0
        ? items
        : [{ name: defaultPlanFocusForSource(draft.source), sets: '1 次', reps: '完成即可', note: '按身体状态量力而行', sort_order: 0 }]
      : [],
  }
}

export function planToExercises(plan: Pick<Plan, 'items'>): Exercise[] {
  return plan.items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({
      id: item.id,
      name: item.name,
      sets: item.sets,
      reps: item.reps,
      note: item.note,
    }))
}
