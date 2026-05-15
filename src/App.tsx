import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  CircleDollarSign,
  ClipboardCheck,
  Copy,
  Dumbbell,
  Flame,
  History,
  Home,
  MessageCircle,
  QrCode,
  ReceiptText,
  Settings,
  ShieldCheck,
  TimerReset,
  Users,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type MainView = 'home' | 'plan' | 'history' | 'penalty' | 'settings' | 'admin'
type AdminView = 'overview' | 'plans' | 'review' | 'payments' | 'users' | 'stats'
type AppMode = 'student' | 'admin'
type UserRole = 'coach' | 'student'
type CheckInStatus = 'pending' | 'approved' | 'rejected' | 'missed'
type PenaltyStatus = 'pending' | 'paid_claimed' | 'confirmed' | 'waived'
type NotificationType = 'morning_plan' | 'deadline_warning' | 'penalty_created' | 'review_result' | 'payment_claimed'

type User = {
  id: string
  name: string
  role: UserRole
  isTrainee: boolean
  avatar: string
  serverchanKey: string
  wechatQrUrl: string
  createdAt: string
}

type Plan = {
  id: string
  ownerId: string
  name: string
  active: boolean
  createdAt: string
}

type PlanItem = {
  id: string
  planId: string
  dayOfWeek: number
  exercise: string
  sets: number
  reps: string
  weight: string
  note: string
  videoUrl: string
}

type CheckIn = {
  id: string
  userId: string
  date: string
  status: CheckInStatus
  photoUrl: string
  note: string
  reviewedBy?: string
  reviewedAt?: string
  rejectReason?: string
  doneItemIds: string[]
  createdAt: string
}

type PenaltyRule = {
  id: string
  userId: string
  baseAmount: number
  maxAmount: number
  escalationStep: number
  weeklyGrace: number
  active: boolean
}

type Penalty = {
  id: string
  userId: string
  date: string
  amount: number
  reason: string
  relatedCheckInId?: string
  status: PenaltyStatus
  claimedAt?: string
  confirmedAt?: string
  confirmedBy?: string
  waiverReason?: string
}

type NotificationSetting = {
  userId: string
  enabledTypes: NotificationType[]
  serverchanKey: string
}

type AppState = {
  users: User[]
  plans: Plan[]
  planItems: PlanItem[]
  checkIns: CheckIn[]
  penaltyRules: PenaltyRule[]
  penalties: Penalty[]
  notificationSettings: NotificationSetting[]
}

const STORAGE_KEY = 'family-fitness-contract:m1'
const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const notificationLabels: Record<NotificationType, string> = {
  morning_plan: '早晨训练提醒',
  deadline_warning: '21:00 截止提醒',
  penalty_created: '缺卡罚款提醒',
  review_result: '审核结果提醒',
  payment_claimed: '付款自报提醒',
}

const pad = (value: number) => String(value).padStart(2, '0')
const toISODate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const fromISODate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
const formatDate = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' }).format(
    fromISODate(date),
  )
const todayISO = () => toISODate(new Date())
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

const buildInitialState = (): AppState => {
  const today = new Date()
  const todayDate = todayISO()
  const users: User[] = [
    {
      id: 'u-coach',
      name: '我',
      role: 'coach',
      isTrainee: true,
      avatar: '教',
      serverchanKey: '',
      wechatQrUrl: '',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'u-dad',
      name: '爸爸',
      role: 'student',
      isTrainee: true,
      avatar: '爸',
      serverchanKey: '',
      wechatQrUrl: '',
      createdAt: new Date().toISOString(),
    },
  ]

  const plans: Plan[] = [
    { id: 'p-dad', ownerId: 'u-dad', name: '爸爸 M1 示例周计划', active: true, createdAt: new Date().toISOString() },
    { id: 'p-coach', ownerId: 'u-coach', name: '我的 M1 示例周计划', active: true, createdAt: new Date().toISOString() },
  ]

  const planItems: PlanItem[] = [
    item('p-dad', 1, '椅子深蹲', 4, '8 次', '自重', '扶稳椅背，膝盖对准脚尖'),
    item('p-dad', 1, '扶墙提踵', 3, '12 次', '自重', '慢起慢落，脚踝稳定'),
    item('p-dad', 3, '墙壁俯卧撑', 4, '8 次', '自重', '身体成直线，肩膀不疼再做'),
    item('p-dad', 3, '毛巾划船', 3, '10 次', '轻阻力', '夹背发力，不耸肩'),
    item('p-dad', 5, '坐站转换', 4, '8 次', '自重', '坐稳再起，别抢速度'),
    item('p-dad', 6, '扶椅单脚站', 3, '每侧 20 秒', '自重', '旁边有人或扶稳再做'),
    item('p-coach', 1, '深蹲', 4, '10 次', '中等', 'RPE 7，不冲极限'),
    item('p-coach', 2, '卧推', 4, '8 次', '中等', '肩胛稳定'),
    item('p-coach', 4, '硬拉', 3, '5 次', '中等', '腰背保持紧张'),
    item('p-coach', 6, '引体向上', 4, '力竭前 2 次', '自重', '动作干净'),
  ]

  const yesterday = toISODate(addDays(today, -1))
  const twoDaysAgo = toISODate(addDays(today, -2))
  const threeDaysAgo = toISODate(addDays(today, -3))
  const checkIns: CheckIn[] = [
    {
      id: 'c-approved',
      userId: 'u-dad',
      date: twoDaysAgo,
      status: 'approved',
      photoUrl: '模拟照片：客厅训练照.jpg',
      note: '腿有点酸，但整体舒服。',
      reviewedBy: 'u-coach',
      reviewedAt: new Date().toISOString(),
      doneItemIds: ['demo-approved'],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'c-pending',
      userId: 'u-dad',
      date: todayDate,
      status: 'pending',
      photoUrl: '模拟照片：今日打卡.jpg',
      note: 'M1 演示：等待你审核。',
      doneItemIds: ['demo-pending'],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'c-coach',
      userId: 'u-coach',
      date: yesterday,
      status: 'approved',
      photoUrl: '模拟照片：自己训练.jpg',
      note: '今天完成力量训练。',
      reviewedBy: 'u-coach',
      reviewedAt: new Date().toISOString(),
      doneItemIds: ['demo-coach'],
      createdAt: new Date().toISOString(),
    },
  ]

  return {
    users,
    plans,
    planItems,
    checkIns,
    penaltyRules: [
      { id: 'r-dad', userId: 'u-dad', baseAmount: 10, maxAmount: 50, escalationStep: 10, weeklyGrace: 1, active: true },
      { id: 'r-coach', userId: 'u-coach', baseAmount: 10, maxAmount: 50, escalationStep: 10, weeklyGrace: 1, active: true },
    ],
    penalties: [
      {
        id: 'pen-dad-1',
        userId: 'u-dad',
        date: threeDaysAgo,
        amount: 10,
        reason: '训练日未提交打卡',
        status: 'pending',
      },
      {
        id: 'pen-dad-2',
        userId: 'u-dad',
        date: yesterday,
        amount: 20,
        reason: '连续缺卡递增',
        status: 'paid_claimed',
        claimedAt: new Date().toISOString(),
      },
    ],
    notificationSettings: [
      {
        userId: 'u-dad',
        serverchanKey: '',
        enabledTypes: ['morning_plan', 'deadline_warning', 'penalty_created', 'review_result'],
      },
      {
        userId: 'u-coach',
        serverchanKey: '',
        enabledTypes: ['payment_claimed', 'review_result'],
      },
    ],
  }
}

const item = (
  planId: string,
  dayOfWeek: number,
  exercise: string,
  sets: number,
  reps: string,
  weight: string,
  note: string,
): PlanItem => ({
  id: `${planId}-${dayOfWeek}-${exercise}`,
  planId,
  dayOfWeek,
  exercise,
  sets,
  reps,
  weight,
  note,
  videoUrl: '',
})

const loadState = (): AppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildInitialState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    const fallback = buildInitialState()
    return {
      users: parsed.users ?? fallback.users,
      plans: parsed.plans ?? fallback.plans,
      planItems: parsed.planItems ?? fallback.planItems,
      checkIns: parsed.checkIns ?? fallback.checkIns,
      penaltyRules: parsed.penaltyRules ?? fallback.penaltyRules,
      penalties: parsed.penalties ?? fallback.penalties,
      notificationSettings: parsed.notificationSettings ?? fallback.notificationSettings,
    }
  } catch {
    return buildInitialState()
  }
}

function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [mode, setMode] = useState<AppMode>('student')
  const [view, setView] = useState<MainView>('home')
  const [adminView, setAdminView] = useState<AdminView>('overview')
  const [activeUserId, setActiveUserId] = useState('u-dad')
  const [selectedPenaltyId, setSelectedPenaltyId] = useState<string | null>(null)
  const [checkInNote, setCheckInNote] = useState('')
  const [photoName, setPhotoName] = useState('')
  const [copied, setCopied] = useState(false)

  const activeUser = state.users.find((user) => user.id === activeUserId) ?? state.users[0]
  const traineeUsers = state.users.filter((user) => user.isTrainee)
  const activePlan = state.plans.find((plan) => plan.ownerId === activeUser.id && plan.active)
  const todayItems = activePlan
    ? state.planItems.filter((planItem) => planItem.planId === activePlan.id && planItem.dayOfWeek === new Date().getDay())
    : []
  const userCheckIns = state.checkIns.filter((checkIn) => checkIn.userId === activeUser.id)
  const todayCheckIn = userCheckIns.find((checkIn) => checkIn.date === todayISO())
  const userPenalties = state.penalties.filter((penalty) => penalty.userId === activeUser.id)
  const duePenalties = userPenalties.filter((penalty) => penalty.status === 'pending')
  const claimedPenalties = state.penalties.filter((penalty) => penalty.status === 'paid_claimed')
  const pendingReviews = state.checkIns.filter((checkIn) => checkIn.status === 'pending')
  const selectedPenalty = selectedPenaltyId
    ? state.penalties.find((penalty) => penalty.id === selectedPenaltyId)
    : null
  const selectedPenaltyUser = selectedPenalty
    ? state.users.find((user) => user.id === selectedPenalty.userId)
    : undefined
  const stats = useMemo(() => buildStats(state, activeUser.id), [state, activeUser.id])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const setPage = (nextView: MainView) => {
    setSelectedPenaltyId(null)
    setView(nextView)
    if (nextView === 'admin') setMode('admin')
  }

  const submitCheckIn = () => {
    const planItemIds = todayItems.map((planItem) => planItem.id)
    setState((current) => ({
      ...current,
      checkIns: [
        ...current.checkIns.filter(
          (checkIn) => !(checkIn.userId === activeUser.id && checkIn.date === todayISO()),
        ),
        {
          id: uid('checkin'),
          userId: activeUser.id,
          date: todayISO(),
          status: 'pending',
          photoUrl: photoName || '模拟照片：今日训练打卡.jpg',
          note: checkInNote || '已完成今日训练，等待审核。',
          doneItemIds: planItemIds,
          createdAt: new Date().toISOString(),
        },
      ],
    }))
    setCheckInNote('')
    setPhotoName('')
    window.navigator.vibrate?.(40)
  }

  const reviewCheckIn = (checkInId: string, status: 'approved' | 'rejected') => {
    setState((current) => ({
      ...current,
      checkIns: current.checkIns.map((checkIn) =>
        checkIn.id === checkInId
          ? {
              ...checkIn,
              status,
              reviewedBy: 'u-coach',
              reviewedAt: new Date().toISOString(),
              rejectReason: status === 'rejected' ? 'M1 演示：照片或动作记录需要补充' : undefined,
            }
          : checkIn,
      ),
    }))
  }

  const scanMissed = () => {
    const date = todayISO()
    setState((current) => {
      const nextCheckIns = [...current.checkIns]
      const nextPenalties = [...current.penalties]

      current.users
        .filter((user) => user.isTrainee)
        .forEach((user) => {
          const active = current.plans.find((plan) => plan.ownerId === user.id && plan.active)
          const hasTraining = active
            ? current.planItems.some(
                (planItem) => planItem.planId === active.id && planItem.dayOfWeek === new Date().getDay(),
              )
            : false
          const hasCheckIn = current.checkIns.some(
            (checkIn) => checkIn.userId === user.id && checkIn.date === date,
          )
          const hasPenalty = current.penalties.some(
            (penalty) => penalty.userId === user.id && penalty.date === date,
          )
          if (!hasTraining || hasCheckIn || hasPenalty) return

          const checkInId = uid('missed')
          const rule = current.penaltyRules.find((penaltyRule) => penaltyRule.userId === user.id)
          const amount = calculatePenaltyAmount(user.id, date, current.penalties, rule)
          nextCheckIns.push({
            id: checkInId,
            userId: user.id,
            date,
            status: 'missed',
            photoUrl: '',
            note: '23:00 后自动判定缺卡的 M1 模拟记录',
            doneItemIds: [],
            createdAt: new Date().toISOString(),
          })
          nextPenalties.push({
            id: uid('penalty'),
            userId: user.id,
            date,
            amount,
            reason: amount > (rule?.baseAmount ?? 10) ? '连续缺卡递增' : '训练日未提交打卡',
            relatedCheckInId: checkInId,
            status: 'pending',
          })
        })

      return { ...current, checkIns: nextCheckIns, penalties: nextPenalties }
    })
  }

  const claimPayment = (penaltyId: string) => {
    setState((current) => ({
      ...current,
      penalties: current.penalties.map((penalty) =>
        penalty.id === penaltyId
          ? { ...penalty, status: 'paid_claimed', claimedAt: new Date().toISOString() }
          : penalty,
      ),
    }))
  }

  const confirmPayment = (penaltyId: string) => {
    setState((current) => ({
      ...current,
      penalties: current.penalties.map((penalty) =>
        penalty.id === penaltyId
          ? {
              ...penalty,
              status: 'confirmed',
              confirmedAt: new Date().toISOString(),
              confirmedBy: 'u-coach',
            }
          : penalty,
      ),
    }))
  }

  const waivePenalty = (penaltyId: string, reason = 'M1 演示：管理员确认免罚') => {
    setState((current) => ({
      ...current,
      penalties: current.penalties.map((penalty) =>
        penalty.id === penaltyId ? { ...penalty, status: 'waived', waiverReason: reason } : penalty,
      ),
    }))
  }

  const copyPayText = async () => {
    if (!selectedPenalty || !selectedPenaltyUser) return
    const text = `${selectedPenaltyUser.name} 本次健身保证金应付 ¥${selectedPenalty.amount}，请扫码后手动输入金额。`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const resetDemo = () => {
    const next = buildInitialState()
    setState(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setActiveUserId('u-dad')
    setView('home')
    setMode('student')
  }

  return (
    <main className="app-shell">
      <section className="app-frame" aria-label="家庭健身监督打卡 App">
        <AppHeader
          activeUser={activeUser}
          mode={mode}
          setMode={setMode}
          setPage={setPage}
          trainees={traineeUsers}
          activeUserId={activeUserId}
          setActiveUserId={setActiveUserId}
        />

        {selectedPenalty && selectedPenaltyUser ? (
          <PayPage
            copied={copied}
            copyPayText={copyPayText}
            claimPayment={claimPayment}
            penalty={selectedPenalty}
            setSelectedPenaltyId={setSelectedPenaltyId}
            user={selectedPenaltyUser}
            waivePenalty={waivePenalty}
          />
        ) : mode === 'admin' || view === 'admin' ? (
          <AdminPage
            activeView={adminView}
            claimedPenalties={claimedPenalties}
            confirmPayment={confirmPayment}
            pendingReviews={pendingReviews}
            reviewCheckIn={reviewCheckIn}
            scanMissed={scanMissed}
            setActiveView={setAdminView}
            setActiveUserId={setActiveUserId}
            setMode={setMode}
            setPage={setPage}
            state={state}
            resetDemo={resetDemo}
          />
        ) : (
          <>
            {view === 'home' && (
              <HomePage
                activeUser={activeUser}
                checkInNote={checkInNote}
                duePenalties={duePenalties}
                photoName={photoName}
                setCheckInNote={setCheckInNote}
                setPhotoName={setPhotoName}
                setSelectedPenaltyId={setSelectedPenaltyId}
                stats={stats}
                submitCheckIn={submitCheckIn}
                todayCheckIn={todayCheckIn}
                todayItems={todayItems}
              />
            )}
            {view === 'plan' && <PlanPage activeUser={activeUser} state={state} />}
            {view === 'history' && <HistoryPage activeUser={activeUser} state={state} stats={stats} />}
            {view === 'penalty' && (
              <PenaltyPage
                penalties={userPenalties}
                setSelectedPenaltyId={setSelectedPenaltyId}
                waivePenalty={waivePenalty}
              />
            )}
            {view === 'settings' && <SettingsPage activeUser={activeUser} state={state} />}

            <BottomNav activeView={view} setPage={setPage} />
          </>
        )}
      </section>
    </main>
  )
}

function AppHeader({
  activeUser,
  activeUserId,
  mode,
  setActiveUserId,
  setMode,
  setPage,
  trainees,
}: {
  activeUser: User
  activeUserId: string
  mode: AppMode
  setActiveUserId: (userId: string) => void
  setMode: (mode: AppMode) => void
  setPage: (view: MainView) => void
  trainees: User[]
}) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <span className="brand-mark">
          <Dumbbell size={18} />
        </span>
        <div>
          <p>家庭健身监督</p>
          <h1>{mode === 'admin' ? '管理员后台' : `${activeUser.name}的今日训练`}</h1>
        </div>
      </div>
      <button
        className="mode-button"
        type="button"
        onClick={() => {
          const nextMode = mode === 'admin' ? 'student' : 'admin'
          setMode(nextMode)
          setPage(nextMode === 'admin' ? 'admin' : 'home')
        }}
      >
        {mode === 'admin' ? <Home size={19} /> : <ShieldCheck size={19} />}
        <span>{mode === 'admin' ? '学员端' : '管理端'}</span>
      </button>
      <div className="trainee-strip" aria-label="学员切换">
        {trainees.map((user) => (
          <button
            className={activeUserId === user.id ? 'active' : ''}
            key={user.id}
            type="button"
            onClick={() => setActiveUserId(user.id)}
          >
            <span>{user.avatar}</span>
            {user.name}
          </button>
        ))}
      </div>
    </header>
  )
}

function HomePage({
  activeUser,
  checkInNote,
  duePenalties,
  photoName,
  setCheckInNote,
  setPhotoName,
  setSelectedPenaltyId,
  stats,
  submitCheckIn,
  todayCheckIn,
  todayItems,
}: {
  activeUser: User
  checkInNote: string
  duePenalties: Penalty[]
  photoName: string
  setCheckInNote: (note: string) => void
  setPhotoName: (name: string) => void
  setSelectedPenaltyId: (penaltyId: string) => void
  stats: StudentStats
  submitCheckIn: () => void
  todayCheckIn?: CheckIn
  todayItems: PlanItem[]
}) {
  const statusText = getCheckInStatusText(todayCheckIn?.status)
  const payable = duePenalties.reduce((sum, penalty) => sum + penalty.amount, 0)

  return (
    <section className="screen with-nav">
      <div className="hero-panel">
        <div className="hero-kicker">
          <Flame size={18} />
          <span>连续 {stats.streak} 天</span>
        </div>
        <h2>{todayItems.length > 0 ? '今日训练别断档' : '今天是恢复日'}</h2>
        <p>
          {todayItems.length > 0
            ? '完成清单、上传照片、提交后等待管理员审核。'
            : '没有训练任务也可以记录散步、拉伸和身体反馈。'}
        </p>
        <div className="hero-numbers">
          <div>
            <strong>{stats.monthCompletion}%</strong>
            <span>本月完成率</span>
          </div>
          <div>
            <strong>¥{payable}</strong>
            <span>待付保证金</span>
          </div>
        </div>
      </div>

      <div className="status-ribbon">
        <span className={`status-dot ${todayCheckIn?.status ?? 'none'}`} />
        <strong>{statusText}</strong>
        <small>{todayCheckIn?.note || `${activeUser.name} 今天还没提交打卡`}</small>
      </div>

      <div className="section-heading">
        <h3>动作清单</h3>
        <span>{todayItems.length || 0} 项</span>
      </div>
      <div className="exercise-list">
        {(todayItems.length > 0 ? todayItems : restDayItems()).map((planItem) => (
          <article className="exercise-card" key={planItem.id}>
            <div>
              <h4>{planItem.exercise}</h4>
              <p>{planItem.note}</p>
            </div>
            <strong>
              {planItem.sets} 组
              <span>{planItem.reps}</span>
            </strong>
          </article>
        ))}
      </div>

      <div className="checkin-card">
        <div className="section-heading compact">
          <h3>拍照打卡</h3>
          <span>5:00-23:00</span>
        </div>
        <label className="upload-box">
          <Camera size={22} />
          <span>{photoName || '选择或模拟一张训练照片'}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? '')}
          />
        </label>
        <textarea
          aria-label="打卡备注"
          value={checkInNote}
          onChange={(event) => setCheckInNote(event.target.value)}
          placeholder="写一句话：今天哪里轻松、哪里不舒服。"
          rows={3}
        />
        <button className="primary-action" type="button" onClick={submitCheckIn}>
          <ClipboardCheck size={23} />
          提交打卡，等待审核
        </button>
      </div>

      {duePenalties[0] && (
        <button
          className="pay-alert"
          type="button"
          onClick={() => setSelectedPenaltyId(duePenalties[0].id)}
        >
          <WalletCards size={22} />
          <span>有 ¥{payable} 待付，去付款页</span>
        </button>
      )}
    </section>
  )
}

function PlanPage({ activeUser, state }: { activeUser: User; state: AppState }) {
  const activePlan = state.plans.find((plan) => plan.ownerId === activeUser.id && plan.active)
  const items = activePlan ? state.planItems.filter((planItem) => planItem.planId === activePlan.id) : []

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>{activePlan?.name ?? '暂无计划'}</h2>
        <p>M1 使用示例周计划；上线后由你在后台创建和复用模板。</p>
      </div>
      <div className="week-grid">
        {dayNames.map((day, dayOfWeek) => {
          const dayItems = items.filter((planItem) => planItem.dayOfWeek === dayOfWeek)
          return (
            <article className={dayItems.length > 0 ? 'day-card has-training' : 'day-card'} key={day}>
              <div className="day-head">
                <strong>{day}</strong>
                <span>{dayItems.length > 0 ? `${dayItems.length} 个动作` : '休息 / 恢复'}</span>
              </div>
              <div className="mini-list">
                {(dayItems.length > 0 ? dayItems : restDayItems()).map((planItem) => (
                  <span key={planItem.id}>{planItem.exercise}</span>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function HistoryPage({
  activeUser,
  state,
  stats,
}: {
  activeUser: User
  state: AppState
  stats: StudentStats
}) {
  const records = state.checkIns
    .filter((checkIn) => checkIn.userId === activeUser.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <section className="screen with-nav">
      <div className="score-grid">
        <Metric icon={<Flame />} label="连续打卡" value={`${stats.streak} 天`} />
        <Metric icon={<Activity />} label="完成训练" value={`${stats.completed} 次`} />
        <Metric icon={<BarChart3 />} label="本月完成率" value={`${stats.monthCompletion}%`} />
      </div>

      <div className="section-heading">
        <h3>90 天热力图</h3>
        <span>模拟贡献图</span>
      </div>
      <div className="heatmap" aria-label="过去 90 天打卡热力图">
        {Array.from({ length: 90 }, (_, index) => {
          const date = toISODate(addDays(new Date(), index - 89))
          const status = records.find((record) => record.date === date)?.status
          return <span className={status ? `cell ${status}` : 'cell'} key={date} title={date} />
        })}
      </div>

      <div className="history-list">
        {records.map((record) => (
          <article className="history-card" key={record.id}>
            <div>
              <strong>{formatDate(record.date)}</strong>
              <span>{record.photoUrl || '无照片'}</span>
            </div>
            <StatusBadge status={record.status} />
          </article>
        ))}
      </div>
    </section>
  )
}

function PenaltyPage({
  penalties,
  setSelectedPenaltyId,
  waivePenalty,
}: {
  penalties: Penalty[]
  setSelectedPenaltyId: (penaltyId: string) => void
  waivePenalty: (penaltyId: string, reason?: string) => void
}) {
  const groups: PenaltyStatus[] = ['pending', 'paid_claimed', 'confirmed', 'waived']

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>罚款流水</h2>
        <p>个人收款码不能预填金额，付款页会用大字提示手动输入金额。</p>
      </div>
      {groups.map((status) => (
        <div className="penalty-group" key={status}>
          <div className="section-heading compact">
            <h3>{getPenaltyStatusText(status)}</h3>
            <span>{penalties.filter((penalty) => penalty.status === status).length} 笔</span>
          </div>
          {penalties
            .filter((penalty) => penalty.status === status)
            .map((penalty) => (
              <article className="penalty-card" key={penalty.id}>
                <div>
                  <strong>¥{penalty.amount}</strong>
                  <span>
                    {formatDate(penalty.date)} · {penalty.reason}
                  </span>
                </div>
                <div className="row-actions">
                  {penalty.status === 'pending' && (
                    <button type="button" onClick={() => setSelectedPenaltyId(penalty.id)}>
                      去付款
                    </button>
                  )}
                  {penalty.status === 'pending' && (
                    <button type="button" onClick={() => waivePenalty(penalty.id, '学员申请免罚')}>
                      申请免罚
                    </button>
                  )}
                </div>
              </article>
            ))}
        </div>
      ))}
    </section>
  )
}

function PayPage({
  claimPayment,
  copied,
  copyPayText,
  penalty,
  setSelectedPenaltyId,
  user,
  waivePenalty,
}: {
  claimPayment: (penaltyId: string) => void
  copied: boolean
  copyPayText: () => void
  penalty: Penalty
  setSelectedPenaltyId: (penaltyId: string | null) => void
  user: User
  waivePenalty: (penaltyId: string, reason?: string) => void
}) {
  return (
    <section className="screen pay-screen">
      <button className="back-button" type="button" onClick={() => setSelectedPenaltyId(null)}>
        <ChevronLeft size={20} />
        返回流水
      </button>
      <div className="pay-amount">
        <span>{user.name} 本次应付</span>
        <strong>¥{penalty.amount}</strong>
        <p>扫码后请手动输入金额，付款后点“我已付款”。</p>
      </div>
      <div className="qr-card">
        <QrCode size={58} />
        <strong>微信收款码占位</strong>
        <span>后续在设置页上传你的个人收款码图片</span>
      </div>
      <div className="pay-actions">
        <button className="primary-action" type="button" onClick={() => claimPayment(penalty.id)}>
          <Check size={22} />
          我已付款 ¥{penalty.amount}
        </button>
        <button type="button" onClick={copyPayText}>
          <Copy size={20} />
          {copied ? '已复制文案' : '复制付款文案'}
        </button>
        <button type="button" onClick={() => waivePenalty(penalty.id, '身体不适或外出，申请免罚')}>
          <MessageCircle size={20} />
          申请免罚
        </button>
      </div>
    </section>
  )
}

function SettingsPage({ activeUser, state }: { activeUser: User; state: AppState }) {
  const setting = state.notificationSettings.find((item) => item.userId === activeUser.id)

  return (
    <section className="screen with-nav">
      <div className="page-title">
        <h2>设置与上线准备</h2>
        <p>M1 只展示配置入口，不保存真实密钥到仓库。</p>
      </div>
      <div className="settings-card">
        <label>
          <span>Server 酱 SendKey</span>
          <input readOnly value={setting?.serverchanKey || '未配置：上线前在环境变量或云端设置中填写'} />
        </label>
        <label>
          <span>微信收款码</span>
          <input readOnly value={activeUser.wechatQrUrl || '未上传：后续接 Supabase Storage'} />
        </label>
        <label>
          <span>Supabase 项目</span>
          <input readOnly value="等待 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY" />
        </label>
      </div>
      <div className="settings-card">
        <div className="section-heading compact">
          <h3>推送场景</h3>
          <span>{setting?.enabledTypes.length ?? 0} 项</span>
        </div>
        <div className="tag-list">
          {(setting?.enabledTypes ?? []).map((type) => (
            <span key={type}>{notificationLabels[type]}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

function AdminPage({
  activeView,
  claimedPenalties,
  confirmPayment,
  pendingReviews,
  resetDemo,
  reviewCheckIn,
  scanMissed,
  setActiveUserId,
  setActiveView,
  setMode,
  setPage,
  state,
}: {
  activeView: AdminView
  claimedPenalties: Penalty[]
  confirmPayment: (penaltyId: string) => void
  pendingReviews: CheckIn[]
  resetDemo: () => void
  reviewCheckIn: (checkInId: string, status: 'approved' | 'rejected') => void
  scanMissed: () => void
  setActiveUserId: (userId: string) => void
  setActiveView: (view: AdminView) => void
  setMode: (mode: AppMode) => void
  setPage: (view: MainView) => void
  state: AppState
}) {
  const totalPending = state.penalties
    .filter((penalty) => penalty.status === 'pending')
    .reduce((sum, penalty) => sum + penalty.amount, 0)

  return (
    <section className="screen admin-screen">
      <div className="admin-hero">
        <div>
          <span>Coach Console</span>
          <h2>审核、罚款、推送都从这里收口</h2>
        </div>
        <button type="button" onClick={scanMissed}>
          <TimerReset size={20} />
          扫描缺卡
        </button>
      </div>

      <div className="admin-tabs">
        {([
          ['overview', '总览'],
          ['plans', '计划'],
          ['review', '审核'],
          ['payments', '到账'],
          ['users', '用户'],
          ['stats', '看板'],
        ] as const).map(([tab, label]) => (
          <button
            className={activeView === tab ? 'active' : ''}
            key={tab}
            type="button"
            onClick={() => setActiveView(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (
        <>
          <div className="score-grid">
            <Metric icon={<Users />} label="学员" value={`${state.users.filter((user) => user.isTrainee).length} 人`} />
            <Metric icon={<ClipboardCheck />} label="待审核" value={`${pendingReviews.length} 条`} />
            <Metric icon={<CircleDollarSign />} label="待付款" value={`¥${totalPending}`} />
          </div>
          <div className="admin-actions">
            <button type="button" onClick={scanMissed}>生成今日缺卡模拟</button>
            <button type="button" onClick={resetDemo}>重置 M1 演示数据</button>
          </div>
        </>
      )}

      {activeView === 'plans' && <AdminPlans state={state} />}
      {activeView === 'review' && (
        <AdminReview pendingReviews={pendingReviews} reviewCheckIn={reviewCheckIn} state={state} />
      )}
      {activeView === 'payments' && (
        <AdminPayments
          claimedPenalties={claimedPenalties}
          confirmPayment={confirmPayment}
          state={state}
        />
      )}
      {activeView === 'users' && (
        <AdminUsers
          setActiveUserId={setActiveUserId}
          setMode={setMode}
          setPage={setPage}
          state={state}
        />
      )}
      {activeView === 'stats' && <AdminStats state={state} />}
    </section>
  )
}

function AdminPlans({ state }: { state: AppState }) {
  return (
    <div className="admin-list">
      {state.plans.map((plan) => {
        const owner = state.users.find((user) => user.id === plan.ownerId)
        const count = state.planItems.filter((item) => item.planId === plan.id).length
        return (
          <article className="admin-card" key={plan.id}>
            <div>
              <strong>{plan.name}</strong>
              <span>{owner?.name} · {count} 个动作 · {plan.active ? '启用中' : '停用'}</span>
            </div>
            <button type="button">复制上周</button>
          </article>
        )
      })}
    </div>
  )
}

function AdminReview({
  pendingReviews,
  reviewCheckIn,
  state,
}: {
  pendingReviews: CheckIn[]
  reviewCheckIn: (checkInId: string, status: 'approved' | 'rejected') => void
  state: AppState
}) {
  if (pendingReviews.length === 0) return <EmptyState text="当前没有待审核打卡。" />

  return (
    <div className="admin-list">
      {pendingReviews.map((checkIn) => {
        const user = state.users.find((item) => item.id === checkIn.userId)
        return (
          <article className="admin-card review-card" key={checkIn.id}>
            <div>
              <strong>{user?.name} · {formatDate(checkIn.date)}</strong>
              <span>{checkIn.photoUrl || '无照片'} · {checkIn.note}</span>
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => reviewCheckIn(checkIn.id, 'approved')}>通过</button>
              <button type="button" onClick={() => reviewCheckIn(checkIn.id, 'rejected')}>驳回</button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function AdminPayments({
  claimedPenalties,
  confirmPayment,
  state,
}: {
  claimedPenalties: Penalty[]
  confirmPayment: (penaltyId: string) => void
  state: AppState
}) {
  if (claimedPenalties.length === 0) return <EmptyState text="当前没有待确认到账。" />

  return (
    <div className="admin-list">
      {claimedPenalties.map((penalty) => {
        const user = state.users.find((item) => item.id === penalty.userId)
        return (
          <article className="admin-card" key={penalty.id}>
            <div>
              <strong>{user?.name} 自报已付 ¥{penalty.amount}</strong>
              <span>{formatDate(penalty.date)} · 需要你肉眼核对微信到账</span>
            </div>
            <button type="button" onClick={() => confirmPayment(penalty.id)}>确认到账</button>
          </article>
        )
      })}
    </div>
  )
}

function AdminUsers({
  setActiveUserId,
  setMode,
  setPage,
  state,
}: {
  setActiveUserId: (userId: string) => void
  setMode: (mode: AppMode) => void
  setPage: (view: MainView) => void
  state: AppState
}) {
  return (
    <div className="admin-list">
      {state.users.map((user) => {
        const rule = state.penaltyRules.find((item) => item.userId === user.id)
        return (
          <article className="admin-card user-card" key={user.id}>
            <div>
              <strong>{user.name}</strong>
              <span>
                {user.role === 'coach' ? '管理员 / 学员' : '学员'} · 基础 ¥{rule?.baseAmount} · 封顶 ¥{rule?.maxAmount} · 免罚 {rule?.weeklyGrace} 次/周
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveUserId(user.id)
                setMode('student')
                setPage('home')
              }}
            >
              看学员端
            </button>
          </article>
        )
      })}
    </div>
  )
}

function AdminStats({ state }: { state: AppState }) {
  const traineeStats = state.users
    .filter((user) => user.isTrainee)
    .map((user) => ({ user, stats: buildStats(state, user.id) }))

  return (
    <div className="admin-list">
      {traineeStats.map(({ user, stats }) => (
        <article className="admin-card stat-card" key={user.id}>
          <div>
            <strong>{user.name}</strong>
            <span>连续 {stats.streak} 天 · 完成 {stats.completed} 次 · 月完成率 {stats.monthCompletion}%</span>
          </div>
          <div className="mini-bar">
            <span style={{ width: `${stats.monthCompletion}%` }} />
          </div>
        </article>
      ))}
    </div>
  )
}

function BottomNav({
  activeView,
  setPage,
}: {
  activeView: MainView
  setPage: (view: MainView) => void
}) {
  const navItems: Array<[MainView, string, ReactNode]> = [
    ['home', '首页', <Home size={21} />],
    ['plan', '计划', <CalendarDays size={21} />],
    ['history', '历史', <History size={21} />],
    ['penalty', '罚款', <ReceiptText size={21} />],
    ['settings', '设置', <Settings size={21} />],
  ]
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {navItems.map(([navView, label, icon]) => (
        <button
          className={activeView === navView ? 'active' : ''}
          key={navView}
          type="button"
          onClick={() => setPage(navView)}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: CheckInStatus }) {
  return <span className={`status-badge ${status}`}>{getCheckInStatusText(status)}</span>
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <AlertTriangle size={26} />
      <span>{text}</span>
    </div>
  )
}

type StudentStats = {
  streak: number
  completed: number
  monthCompletion: number
}

function buildStats(state: AppState, userId: string): StudentStats {
  const approved = state.checkIns.filter(
    (checkIn) => checkIn.userId === userId && checkIn.status === 'approved',
  )
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const monthRecords = state.checkIns.filter(
    (checkIn) => checkIn.userId === userId && fromISODate(checkIn.date) >= startOfMonth,
  )
  const monthApproved = monthRecords.filter((checkIn) => checkIn.status === 'approved').length
  const monthCompletion = monthRecords.length === 0 ? 0 : Math.round((monthApproved / monthRecords.length) * 100)

  return {
    streak: calculateStreak(approved.map((checkIn) => checkIn.date)),
    completed: approved.length,
    monthCompletion,
  }
}

function calculateStreak(dates: string[]) {
  const set = new Set(dates)
  let streak = 0
  let cursor = new Date()

  while (set.has(toISODate(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }

  return streak
}

function calculatePenaltyAmount(
  userId: string,
  date: string,
  penalties: Penalty[],
  rule?: PenaltyRule,
) {
  const activeRule = rule ?? {
    baseAmount: 10,
    maxAmount: 50,
    escalationStep: 10,
  }
  let previousMisses = 0
  let cursor = addDays(fromISODate(date), -1)

  for (let index = 0; index < 7; index += 1) {
    const cursorDate = toISODate(cursor)
    const missed = penalties.some(
      (penalty) =>
        penalty.userId === userId &&
        penalty.date === cursorDate &&
        penalty.status !== 'waived' &&
        penalty.status !== 'confirmed',
    )
    if (!missed) break
    previousMisses += 1
    cursor = addDays(cursor, -1)
  }

  return Math.min(
    activeRule.baseAmount + previousMisses * activeRule.escalationStep,
    activeRule.maxAmount,
  )
}

function restDayItems(): PlanItem[] {
  return [
    item('rest', new Date().getDay(), '主动恢复', 1, '10-20 分钟', '轻松', '散步、拉伸或记录身体反馈'),
  ]
}

function getCheckInStatusText(status?: CheckInStatus) {
  if (status === 'pending') return '待审核'
  if (status === 'approved') return '已通过'
  if (status === 'rejected') return '已驳回'
  if (status === 'missed') return '已缺卡'
  return '未提交'
}

function getPenaltyStatusText(status: PenaltyStatus) {
  if (status === 'pending') return '待付款'
  if (status === 'paid_claimed') return '已自报'
  if (status === 'confirmed') return '已确认'
  return '已免罚'
}

export default App
