export type Role = 'student' | 'coach'
export type CheckInStatus = 'completed' | 'excused' | 'missed' | 'pending_review'
export type PenaltyStatus = 'pending' | 'payment_reported' | 'paid' | 'waived'
export type PlanSource = 'coach' | 'student'

export type Profile = {
  id: string
  name: string
  role: Role
  email?: string | null
  member_code?: string | null
  created_at?: string
}

export type MemberProfile = Profile & {
  account_name: string
  display_name: string
  member_since?: string
}

export type CheckIn = {
  id: string
  user_id: string
  plan_id: string | null
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

export type PlanItem = {
  id: string
  plan_id?: string
  name: string
  sets: string
  reps: string
  note: string
  sort_order: number
}

export type Plan = {
  id: string
  user_id: string
  date: string
  title: string
  focus: string
  deadline: string
  is_training: boolean
  source: PlanSource
  created_at?: string
  items: PlanItem[]
}

export type PlanDraft = Omit<Plan, 'id' | 'created_at' | 'items'> & {
  id?: string
  items: Array<Omit<PlanItem, 'id' | 'plan_id'> & { id?: string }>
}

export type CheckInEvidence = {
  id: string
  check_in_id: string
  user_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  signed_url?: string
  created_at?: string
}
