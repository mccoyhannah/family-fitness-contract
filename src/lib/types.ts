export type Role = 'student' | 'coach'
export type CheckInStatus = 'completed' | 'excused' | 'missed' | 'pending_review'
export type PenaltyStatus = 'pending' | 'paid' | 'waived'

export type Profile = {
  id: string
  name: string
  role: Role
  created_at?: string
}

export type CheckIn = {
  id: string
  user_id: string
  date: string
  status: CheckInStatus
  fatigue: number | null
  issues: string[]
  note: string
  leave_reason: string | null
  created_at?: string
}

export type Penalty = {
  id: string
  user_id: string
  date: string
  amount: number
  consecutive_count: number
  status: PenaltyStatus
  reason: string
  created_at?: string
}

export type Exercise = {
  id: string
  name: string
  sets: string
  reps: string
  note: string
}

export type PlanDay = {
  date: string
  dayOfWeek: number
  title: string
  focus: string
  deadline: string
  isTraining: boolean
  exercises: Exercise[]
}
