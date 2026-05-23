export type Role = 'student' | 'coach'
export type CheckInStatus = 'completed' | 'excused' | 'missed' | 'pending_review'
export type PenaltyStatus = 'pending' | 'payment_reported' | 'paid' | 'waived'
export type PenaltySourceType = 'missed_checkin'
export type FundExpensePurpose = 'fitness' | 'ai' | 'general'
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
  review_comment?: string | null
  reviewed_at?: string | null
  reviewer_id?: string | null
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
  donation_note?: string | null
  donation_reported_at?: string | null
  source_type?: PenaltySourceType | null
  source_id?: string | null
  created_at?: string
}

export type DonationSettings = {
  id?: boolean
  qr_image_url: string
  payment_hint: string
  updated_at?: string
  updated_by?: string | null
}

export type PenaltySettings = {
  id?: boolean
  base_amount: number
  daily_increment: number
  max_amount: number
  updated_at?: string
  updated_by?: string | null
}

export type FundExpense = {
  id: string
  coach_id: string
  spent_on: string
  amount: number
  purpose: FundExpensePurpose
  title: string
  note: string
  created_at?: string
  updated_at?: string
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
