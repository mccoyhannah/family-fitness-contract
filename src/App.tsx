import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardCheck,
  Coins,
  Copy,
  Dumbbell,
  HeartPulse,
  Home,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type Tab = 'today' | 'plan' | 'checkin' | 'ledger'
type Role = 'trainee' | 'coach'
type DayKind = 'training' | 'rest'
type CheckInStatus = 'completed' | 'pending_review' | 'missed' | 'excused'
type PenaltyStatus = 'pending' | 'paid' | 'waived'

type Exercise = {
  id: string
  name: string
  sets: string
  reps: string
  note: string
}

type PlanDay = {
  date: string
  kind: DayKind
  title: string
  focus: string
  deadline: string
  exercises: Exercise[]
}

type CheckIn = {
  date: string
  status: CheckInStatus
  fatigue: number
  issues: string[]
  note: string
  createdAt: string
}

type Penalty = {
  id: string
  date: string
  amount: number
  status: PenaltyStatus
  reason: string
}

type AppState = {
  checkIns: Record<string, CheckIn>
  penalties: Penalty[]
}

const STORAGE_KEY = 'family-fitness-contract:v1'
const PENALTY_AMOUNT = 10
const issueOptions = ['膝盖痛', '腰不舒服', '头晕', '胸闷', '太累']

const pad = (value: number) => String(value).padStart(2, '0')

const toISODate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const fromISODate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const formatDay = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(fromISODate(date))

const getWeekStart = (date: Date) => {
  const next = new Date(date)
  const day = next.getDay() || 7
  next.setDate(next.getDate() - day + 1)
  next.setHours(0, 0, 0, 0)
  return next
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const exercise = (
  id: string,
  name: string,
  sets: string,
  reps: string,
  note: string,
): Exercise => ({ id, name, sets, reps, note })

const buildPlan = (today = new Date()): PlanDay[] => {
  const monday = getWeekStart(today)
  const dates = Array.from({ length: 7 }, (_, index) => toISODate(addDays(monday, index)))

  return [
    {
      date: dates[0],
      kind: 'training',
      title: '下肢力量',
      focus: '腿部和髋部',
      deadline: '20:30',
      exercises: [
        exercise('chair-squat', '椅子深蹲', '3 组', '8 次', '扶稳椅背，膝盖不内扣'),
        exercise('calf-raise', '扶墙提踵', '3 组', '12 次', '慢起慢落，脚踝稳定'),
        exercise('hip-hinge', '靠墙髋折叠', '2 组', '10 次', '背部放松，不憋气'),
      ],
    },
    {
      date: dates[1],
      kind: 'training',
      title: '轻有氧',
      focus: '心肺和活动量',
      deadline: '20:30',
      exercises: [
        exercise('walk', '快走', '1 次', '20 分钟', '能说话但微微喘'),
        exercise('shoulder-roll', '肩颈放松', '2 组', '10 次', '慢慢转动，不耸肩'),
      ],
    },
    {
      date: dates[2],
      kind: 'training',
      title: '上肢力量',
      focus: '肩背和手臂',
      deadline: '20:30',
      exercises: [
        exercise('wall-push', '墙壁俯卧撑', '3 组', '8 次', '身体成直线，手腕舒服'),
        exercise('towel-row', '毛巾划船', '3 组', '10 次', '夹背发力，别耸肩'),
        exercise('farmer-hold', '拎物静止', '3 组', '20 秒', '两侧重量接近，站稳'),
      ],
    },
    {
      date: dates[3],
      kind: 'rest',
      title: '主动休息',
      focus: '散步和拉伸',
      deadline: '20:30',
      exercises: [
        exercise('easy-walk', '轻松散步', '1 次', '10-15 分钟', '舒服就好，不追求强度'),
        exercise('breathing', '腹式呼吸', '2 组', '6 次', '鼻吸口呼，放慢节奏'),
      ],
    },
    {
      date: dates[4],
      kind: 'training',
      title: '全身循环',
      focus: '力量和协调',
      deadline: '20:30',
      exercises: [
        exercise('sit-stand', '坐站转换', '3 组', '8 次', '坐稳再起，别抢速度'),
        exercise('wall-push-2', '墙壁俯卧撑', '2 组', '10 次', '肩膀不疼再做'),
        exercise('march', '原地抬腿', '3 组', '30 秒', '扶稳，保持呼吸'),
      ],
    },
    {
      date: dates[5],
      kind: 'training',
      title: '平衡训练',
      focus: '防跌倒和稳定',
      deadline: '19:30',
      exercises: [
        exercise('single-leg', '扶椅单脚站', '3 组', '每侧 20 秒', '旁边有人或扶稳再做'),
        exercise('heel-toe', '脚跟脚尖走', '3 组', '8 步', '速度慢，重心稳'),
        exercise('side-step', '侧向走', '2 组', '每侧 10 步', '脚尖朝前，膝盖微弯'),
      ],
    },
    {
      date: dates[6],
      kind: 'rest',
      title: '家庭复盘',
      focus: '恢复和下周安排',
      deadline: '20:30',
      exercises: [
        exercise('review', '身体反馈', '1 次', '3 分钟', '说一下哪里轻松、哪里不舒服'),
        exercise('stretch', '小腿拉伸', '2 组', '每侧 20 秒', '有拉伸感即可'),
      ],
    },
  ]
}

const makeCheckIn = (
  date: string,
  status: CheckInStatus,
  fatigue = 3,
  issues: string[] = [],
  note = '',
): CheckIn => ({
  date,
  status,
  fatigue,
  issues,
  note,
  createdAt: new Date().toISOString(),
})

const makePenalty = (date: string): Penalty => ({
  id: `penalty-${date}`,
  date,
  amount: PENALTY_AMOUNT,
  status: 'pending',
  reason: '训练日未打卡',
})

const buildInitialState = (): AppState => {
  const plan = buildPlan()
  const today = toISODate(new Date())
  const pastTrainingDays = plan.filter((day) => day.kind === 'training' && day.date < today)
  const checkIns: Record<string, CheckIn> = {}
  const penalties: Penalty[] = []

  if (pastTrainingDays[0]) {
    checkIns[pastTrainingDays[0].date] = makeCheckIn(
      pastTrainingDays[0].date,
      'completed',
      3,
      [],
      '完成顺利，腿有一点酸。',
    )
  }

  if (pastTrainingDays[1]) {
    checkIns[pastTrainingDays[1].date] = makeCheckIn(
      pastTrainingDays[1].date,
      'missed',
      0,
      [],
      '演示缺卡记录',
    )
    penalties.push(makePenalty(pastTrainingDays[1].date))
  }

  return { checkIns, penalties }
}

const loadState = (): AppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildInitialState()
    const parsed = JSON.parse(raw) as AppState
    return {
      checkIns: parsed.checkIns ?? {},
      penalties: parsed.penalties ?? [],
    }
  } catch {
    return buildInitialState()
  }
}

const getStatusLabel = (status?: CheckInStatus) => {
  if (status === 'completed') return '已完成'
  if (status === 'pending_review') return '待确认'
  if (status === 'missed') return '已缺卡'
  if (status === 'excused') return '已豁免'
  return '未打卡'
}

const getStatusClass = (status?: CheckInStatus) => {
  if (status === 'completed') return 'success'
  if (status === 'pending_review') return 'warning'
  if (status === 'missed') return 'danger'
  if (status === 'excused') return 'calm'
  return 'neutral'
}

function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [activeTab, setActiveTab] = useState<Tab>('today')
  const [role, setRole] = useState<Role>('trainee')
  const [fatigue, setFatigue] = useState(3)
  const [selectedIssues, setSelectedIssues] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)

  const today = toISODate(new Date())
  const plan = useMemo(() => buildPlan(), [])
  const todayPlan = plan.find((day) => day.date === today) ?? plan[0]
  const todayCheckIn = state.checkIns[todayPlan.date]

  const pendingPenalties = state.penalties.filter((penalty) => penalty.status === 'pending')
  const totalDue = pendingPenalties.reduce((sum, penalty) => sum + penalty.amount, 0)
  const completedCount = plan.filter((day) => state.checkIns[day.date]?.status === 'completed').length
  const trainingCount = plan.filter((day) => day.kind === 'training').length
  const pendingReviewCount = plan.filter(
    (day) => state.checkIns[day.date]?.status === 'pending_review',
  ).length
  const streak = getCompletionStreak(plan, state.checkIns)
  const message = buildReminderMessage(pendingPenalties, totalDue)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const saveCheckIn = (checkIn: CheckIn) => {
    setState((current) => ({
      ...current,
      checkIns: {
        ...current.checkIns,
        [checkIn.date]: checkIn,
      },
    }))
  }

  const completeToday = () => {
    saveCheckIn(makeCheckIn(todayPlan.date, todayPlan.kind === 'rest' ? 'excused' : 'completed', 2))
    setSelectedIssues([])
    setNote('')
    setActiveTab('today')
  }

  const submitCheckIn = () => {
    const status = selectedIssues.length > 0 ? 'pending_review' : 'completed'
    saveCheckIn(makeCheckIn(todayPlan.date, status, fatigue, selectedIssues, note.trim()))
    setActiveTab('today')
  }

  const syncMissedPenalties = () => {
    const dueDates = getDueMissedDates(plan, state.checkIns)
    if (dueDates.length === 0) return

    setState((current) => {
      const nextCheckIns = { ...current.checkIns }
      const nextPenalties = [...current.penalties]
      const penaltyDates = new Set(nextPenalties.map((penalty) => penalty.date))

      dueDates.forEach((date) => {
        nextCheckIns[date] = nextCheckIns[date] ?? makeCheckIn(date, 'missed', 0, [], '超过截止时间')
        if (!penaltyDates.has(date)) {
          nextPenalties.push(makePenalty(date))
        }
      })

      return { checkIns: nextCheckIns, penalties: nextPenalties }
    })
  }

  const updatePenalty = (id: string, status: PenaltyStatus) => {
    setState((current) => ({
      ...current,
      penalties: current.penalties.map((penalty) =>
        penalty.id === id ? { ...penalty, status } : penalty,
      ),
    }))
  }

  const excuseCheckIn = (date: string) => {
    setState((current) => ({
      checkIns: {
        ...current.checkIns,
        [date]: {
          ...(current.checkIns[date] ?? makeCheckIn(date, 'excused')),
          status: 'excused',
          note: current.checkIns[date]?.note || '教练已确认豁免',
        },
      },
      penalties: current.penalties.map((penalty) =>
        penalty.date === date ? { ...penalty, status: 'waived' } : penalty,
      ),
    }))
  }

  const copyReminder = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const resetDemo = () => {
    const next = buildInitialState()
    setState(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="家庭健身契约">
        <header className="topbar">
          <div>
            <p className="eyebrow">家庭健身契约</p>
            <h1>{role === 'coach' ? '教练监督台' : '今天稳稳练完'}</h1>
          </div>
          <button
            className="role-switch"
            type="button"
            onClick={() => setRole((current) => (current === 'coach' ? 'trainee' : 'coach'))}
          >
            {role === 'coach' ? <UserRoundCheck size={20} /> : <ShieldCheck size={20} />}
            <span>{role === 'coach' ? '爸爸视角' : '教练视角'}</span>
          </button>
        </header>

        {role === 'coach' ? (
          <CoachView
            completedCount={completedCount}
            copyReminder={copyReminder}
            copied={copied}
            excuseCheckIn={excuseCheckIn}
            message={message}
            pendingReviewCount={pendingReviewCount}
            plan={plan}
            resetDemo={resetDemo}
            state={state}
            syncMissedPenalties={syncMissedPenalties}
            totalDue={totalDue}
            trainingCount={trainingCount}
            updatePenalty={updatePenalty}
          />
        ) : (
          <>
            {activeTab === 'today' && (
              <TodayView
                checkIn={todayCheckIn}
                completeToday={completeToday}
                day={todayPlan}
                streak={streak}
                totalDue={totalDue}
              />
            )}
            {activeTab === 'plan' && <PlanView checkIns={state.checkIns} plan={plan} today={today} />}
            {activeTab === 'checkin' && (
              <CheckInView
                fatigue={fatigue}
                note={note}
                selectedIssues={selectedIssues}
                setFatigue={setFatigue}
                setNote={setNote}
                setSelectedIssues={setSelectedIssues}
                submitCheckIn={submitCheckIn}
                todayPlan={todayPlan}
              />
            )}
            {activeTab === 'ledger' && (
              <LedgerView
                copyReminder={copyReminder}
                copied={copied}
                message={message}
                penalties={state.penalties}
                totalDue={totalDue}
                updatePenalty={updatePenalty}
              />
            )}

            <nav className="bottom-nav" aria-label="主导航">
              <NavButton icon={<Home size={21} />} label="今日" tab="today" activeTab={activeTab} onClick={setActiveTab} />
              <NavButton icon={<CalendarDays size={21} />} label="计划" tab="plan" activeTab={activeTab} onClick={setActiveTab} />
              <NavButton icon={<ClipboardCheck size={21} />} label="打卡" tab="checkin" activeTab={activeTab} onClick={setActiveTab} />
              <NavButton icon={<WalletCards size={21} />} label="账本" tab="ledger" activeTab={activeTab} onClick={setActiveTab} />
            </nav>
          </>
        )}
      </section>
    </main>
  )
}

function TodayView({
  checkIn,
  completeToday,
  day,
  streak,
  totalDue,
}: {
  checkIn?: CheckIn
  completeToday: () => void
  day: PlanDay
  streak: number
  totalDue: number
}) {
  return (
    <section className="screen with-bottom-nav">
      <div className="hero-panel">
        <div className="date-chip">{formatDay(day.date)}</div>
        <div className="hero-title">
          <Dumbbell size={32} />
          <div>
            <h2>{day.title}</h2>
            <p>{day.focus}</p>
          </div>
        </div>
        <div className="hero-meta">
          <span>截止 {day.deadline}</span>
          <span>{day.kind === 'rest' ? '休息也算守约' : `${day.exercises.length} 个动作`}</span>
        </div>
      </div>

      <div className="metric-row">
        <Metric icon={<Activity />} label="连续" value={`${streak} 天`} />
        <Metric icon={<Coins />} label="待结算" value={`¥${totalDue}`} tone={totalDue > 0 ? 'danger' : 'normal'} />
      </div>

      <div className="section-title">
        <h3>今日内容</h3>
        <span className={`status-pill ${getStatusClass(checkIn?.status)}`}>
          {getStatusLabel(checkIn?.status)}
        </span>
      </div>

      <div className="exercise-list">
        {day.exercises.map((item) => (
          <article className="exercise-card" key={item.id}>
            <div>
              <h4>{item.name}</h4>
              <p>{item.note}</p>
            </div>
            <strong>
              {item.sets}
              <span>{item.reps}</span>
            </strong>
          </article>
        ))}
      </div>

      <div className="safety-strip">
        <HeartPulse size={20} />
        <span>疼痛、头晕、胸闷时先停下，当天交给教练确认。</span>
      </div>

      <button
        className="primary-action"
        type="button"
        onClick={completeToday}
        disabled={checkIn?.status === 'completed' || checkIn?.status === 'excused'}
      >
        <Check size={24} />
        <span>{day.kind === 'rest' ? '记录休息完成' : '今天完成了'}</span>
      </button>
    </section>
  )
}

function PlanView({
  checkIns,
  plan,
  today,
}: {
  checkIns: Record<string, CheckIn>
  plan: PlanDay[]
  today: string
}) {
  return (
    <section className="screen with-bottom-nav">
      <div className="section-title">
        <h3>本周计划</h3>
        <span>肌力 4 天</span>
      </div>
      <div className="timeline">
        {plan.map((day) => (
          <article className={`day-card ${day.date === today ? 'is-today' : ''}`} key={day.date}>
            <div className="day-head">
              <div>
                <strong>{formatDay(day.date)}</strong>
                <span>{day.title}</span>
              </div>
              <span className={`status-pill ${getStatusClass(checkIns[day.date]?.status)}`}>
                {day.kind === 'rest' && !checkIns[day.date] ? '休息日' : getStatusLabel(checkIns[day.date]?.status)}
              </span>
            </div>
            <p>{day.focus}</p>
            <div className="mini-exercises">
              {day.exercises.slice(0, 3).map((item) => (
                <span key={item.id}>{item.name}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function CheckInView({
  fatigue,
  note,
  selectedIssues,
  setFatigue,
  setNote,
  setSelectedIssues,
  submitCheckIn,
  todayPlan,
}: {
  fatigue: number
  note: string
  selectedIssues: string[]
  setFatigue: (value: number) => void
  setNote: (value: string) => void
  setSelectedIssues: (value: string[]) => void
  submitCheckIn: () => void
  todayPlan: PlanDay
}) {
  const toggleIssue = (issue: string) => {
    setSelectedIssues(
      selectedIssues.includes(issue)
        ? selectedIssues.filter((item) => item !== issue)
        : [...selectedIssues, issue],
    )
  }

  return (
    <section className="screen with-bottom-nav">
      <div className="form-card">
        <div className="section-title">
          <h3>训练反馈</h3>
          <span>{todayPlan.title}</span>
        </div>

        <label className="field">
          <span>疲劳程度</span>
          <input
            type="range"
            min="1"
            max="5"
            value={fatigue}
            onChange={(event) => setFatigue(Number(event.target.value))}
          />
          <strong>{fatigue} / 5</strong>
        </label>

        <div className="field">
          <span>身体异常</span>
          <div className="issue-grid">
            {issueOptions.map((issue) => (
              <button
                className={selectedIssues.includes(issue) ? 'issue selected' : 'issue'}
                key={issue}
                type="button"
                onClick={() => toggleIssue(issue)}
              >
                {issue}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>一句话记录</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="比如：今天膝盖没痛，腿有点酸。"
            rows={4}
          />
        </label>

        {selectedIssues.length > 0 && (
          <div className="warning-box">
            <AlertTriangle size={20} />
            <span>这次不会直接记罚款，会进入教练确认。</span>
          </div>
        )}

        <button className="primary-action" type="button" onClick={submitCheckIn}>
          <ClipboardCheck size={24} />
          <span>提交打卡</span>
        </button>
      </div>
    </section>
  )
}

function LedgerView({
  copied,
  copyReminder,
  message,
  penalties,
  totalDue,
  updatePenalty,
}: {
  copied: boolean
  copyReminder: () => void
  message: string
  penalties: Penalty[]
  totalDue: number
  updatePenalty: (id: string, status: PenaltyStatus) => void
}) {
  return (
    <section className="screen with-bottom-nav">
      <div className="ledger-hero">
        <span>待结算保证金</span>
        <strong>¥{totalDue}</strong>
        <p>微信或支付宝手动转账</p>
      </div>

      <div className="qr-placeholder">
        <WalletCards size={38} />
        <span>收款码占位</span>
      </div>

      <ReminderBox copied={copied} copyReminder={copyReminder} message={message} />

      <PenaltyList penalties={penalties} updatePenalty={updatePenalty} />
    </section>
  )
}

function CoachView({
  completedCount,
  copied,
  copyReminder,
  excuseCheckIn,
  message,
  pendingReviewCount,
  plan,
  resetDemo,
  state,
  syncMissedPenalties,
  totalDue,
  trainingCount,
  updatePenalty,
}: {
  completedCount: number
  copied: boolean
  copyReminder: () => void
  excuseCheckIn: (date: string) => void
  message: string
  pendingReviewCount: number
  plan: PlanDay[]
  resetDemo: () => void
  state: AppState
  syncMissedPenalties: () => void
  totalDue: number
  trainingCount: number
  updatePenalty: (id: string, status: PenaltyStatus) => void
}) {
  const completionRate = trainingCount === 0 ? 0 : Math.round((completedCount / trainingCount) * 100)
  const reviewDays = plan.filter((day) => state.checkIns[day.date]?.status === 'pending_review')

  return (
    <section className="screen coach-screen">
      <div className="coach-grid">
        <Metric icon={<Check />} label="完成率" value={`${completionRate}%`} />
        <Metric icon={<AlertTriangle />} label="待确认" value={`${pendingReviewCount} 次`} tone="warning" />
        <Metric icon={<Coins />} label="待结算" value={`¥${totalDue}`} tone={totalDue > 0 ? 'danger' : 'normal'} />
      </div>

      <div className="coach-actions">
        <button type="button" onClick={syncMissedPenalties}>
          <ClipboardCheck size={20} />
          <span>同步缺卡账本</span>
        </button>
        <button type="button" onClick={resetDemo}>
          <RotateCcw size={20} />
          <span>重置演示</span>
        </button>
      </div>

      {reviewDays.length > 0 && (
        <div className="coach-card">
          <div className="section-title">
            <h3>健康确认</h3>
            <span>{reviewDays.length} 条</span>
          </div>
          {reviewDays.map((day) => {
            const checkIn = state.checkIns[day.date]
            return (
              <article className="review-item" key={day.date}>
                <div>
                  <strong>{formatDay(day.date)}</strong>
                  <p>{checkIn.issues.join('、') || '需要确认'}</p>
                </div>
                <button type="button" onClick={() => excuseCheckIn(day.date)}>
                  豁免
                </button>
              </article>
            )
          })}
        </div>
      )}

      <ReminderBox copied={copied} copyReminder={copyReminder} message={message} />
      <PenaltyList penalties={state.penalties} updatePenalty={updatePenalty} />

      <div className="coach-card">
        <div className="section-title">
          <h3>本周记录</h3>
          <span>{completedCount}/{trainingCount}</span>
        </div>
        <div className="timeline compact">
          {plan.map((day) => (
            <article className="day-card" key={day.date}>
              <div className="day-head">
                <div>
                  <strong>{formatDay(day.date)}</strong>
                  <span>{day.title}</span>
                </div>
                <span className={`status-pill ${getStatusClass(state.checkIns[day.date]?.status)}`}>
                  {day.kind === 'rest' && !state.checkIns[day.date]
                    ? '休息日'
                    : getStatusLabel(state.checkIns[day.date]?.status)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ReminderBox({
  copied,
  copyReminder,
  message,
}: {
  copied: boolean
  copyReminder: () => void
  message: string
}) {
  return (
    <div className="reminder-box">
      <div className="section-title">
        <h3>微信提醒</h3>
        <button className="copy-button" type="button" onClick={copyReminder}>
          <Copy size={18} />
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <p>{message}</p>
    </div>
  )
}

function PenaltyList({
  penalties,
  updatePenalty,
}: {
  penalties: Penalty[]
  updatePenalty: (id: string, status: PenaltyStatus) => void
}) {
  if (penalties.length === 0) {
    return (
      <div className="empty-state">
        <Coins size={28} />
        <span>本周还没有欠款记录。</span>
      </div>
    )
  }

  return (
    <div className="penalty-list">
      {penalties.map((penalty) => (
        <article className="penalty-card" key={penalty.id}>
          <div>
            <strong>{formatDay(penalty.date)}</strong>
            <span>
              ¥{penalty.amount} · {penalty.reason}
            </span>
          </div>
          <div className="penalty-actions">
            <button
              className={penalty.status === 'paid' ? 'active' : ''}
              type="button"
              onClick={() => updatePenalty(penalty.id, 'paid')}
            >
              已付
            </button>
            <button
              className={penalty.status === 'waived' ? 'active' : ''}
              type="button"
              onClick={() => updatePenalty(penalty.id, 'waived')}
            >
              豁免
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function Metric({
  icon,
  label,
  tone = 'normal',
  value,
}: {
  icon: React.ReactNode
  label: string
  tone?: 'normal' | 'danger' | 'warning'
  value: string
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function NavButton({
  activeTab,
  icon,
  label,
  onClick,
  tab,
}: {
  activeTab: Tab
  icon: React.ReactNode
  label: string
  onClick: (tab: Tab) => void
  tab: Tab
}) {
  return (
    <button
      className={activeTab === tab ? 'active' : ''}
      type="button"
      onClick={() => onClick(tab)}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function getCompletionStreak(plan: PlanDay[], checkIns: Record<string, CheckIn>) {
  const days = [...plan].filter((day) => day.date <= toISODate(new Date())).reverse()
  let count = 0

  for (const day of days) {
    const checkIn = checkIns[day.date]
    if (day.kind === 'rest' || checkIn?.status === 'completed' || checkIn?.status === 'excused') {
      count += 1
      continue
    }
    break
  }

  return count
}

function getDueMissedDates(plan: PlanDay[], checkIns: Record<string, CheckIn>) {
  const now = new Date()
  const today = toISODate(now)
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`

  return plan
    .filter((day) => day.kind === 'training')
    .filter((day) => !checkIns[day.date])
    .filter((day) => day.date < today || (day.date === today && nowTime > day.deadline))
    .map((day) => day.date)
}

function buildReminderMessage(pendingPenalties: Penalty[], totalDue: number) {
  if (pendingPenalties.length === 0) {
    return '爸，本周训练守约得不错，今天按身体状态稳稳来。'
  }

  const dates = pendingPenalties.map((item) => formatDay(item.date)).join('、')
  return `爸，这周有 ${pendingPenalties.length} 次训练没打卡：${dates}。保证金账本待结算 ¥${totalDue}，明天继续把肌肉补回来。`
}

export default App
