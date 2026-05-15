import { addDays, getWeekStart, toISODate } from './date'
import type { Exercise, PlanDay } from './types'

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
