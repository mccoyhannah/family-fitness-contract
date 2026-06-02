type SupabaseLikeError = {
  code?: string
  details?: string | null
  error?: string
  hint?: string | null
  message?: string
  status?: number
  statusCode?: number | string
}

function asSupabaseError(error: unknown): SupabaseLikeError | null {
  if (!error || typeof error !== 'object') return null
  const maybe = error as SupabaseLikeError
  if (maybe.message || maybe.code || maybe.status) return maybe
  return null
}

function isPermissionError(error: SupabaseLikeError | null, raw: string) {
  const lower = raw.toLowerCase()
  const status = normalizeStatus(error?.status ?? error?.statusCode)
  return (
    error?.code === '42501' ||
    status === 401 ||
    status === 403 ||
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('unauthorized')
  )
}

export function rawErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。') {
  if (error instanceof Error && error.message) return error.message
  const supabaseError = asSupabaseError(error)
  if (supabaseError?.message) return supabaseError.message
  if (supabaseError?.error) return supabaseError.error
  if (typeof error === 'string' && error) return error
  return fallback
}

export function friendlySupabaseMessage(error: unknown, prefix: string) {
  const supabaseError = asSupabaseError(error)
  const raw = rawErrorMessage(error)
  const lower = raw.toLowerCase()
  const code = supabaseError?.code

  let hint = raw
  if (isPermissionError(supabaseError, raw)) {
    hint = '数据库权限拒绝了这次操作，权限已同步后请刷新重试。'
  } else if (code === '23505' || lower.includes('duplicate key')) {
    hint = '今天已经有一条记录，刷新后再重新提交。'
  } else if (lower.includes('failed to fetch') || lower.includes('network')) {
    hint = '网络连接不稳定，请检查网络后重试。'
  } else if (lower.includes('payload') || lower.includes('too large') || lower.includes('exceeded')) {
    hint = '图片太大，请换一张更小的照片。'
  } else if (lower.includes('jwt') || lower.includes('token') || lower.includes('session')) {
    hint = '登录状态可能过期了，请重新登录后再提交。'
  }

  const suffix = code ? `（${code}）` : ''
  return `${prefix}${hint}${suffix}`
}

export function friendlyPlanSaveMessage(
  error: unknown,
  context: { is_training?: boolean; source?: string } = {},
) {
  const supabaseError = asSupabaseError(error)
  const raw = rawErrorMessage(error)
  const lower = raw.toLowerCase()
  const code = supabaseError?.code
  const isStudentRest = context.source === 'student' && context.is_training === false
  const prefix = isStudentRest ? '今日休息保存失败：' : '计划保存失败：'

  if (code === '23514' && raw) return raw
  if (code === '23505' || lower.includes('duplicate key')) return '今天已经有计划，刷新后再看。'
  if (isPermissionError(supabaseError, raw)) {
    return `${prefix}数据库没有允许这次计划写入。请刷新后重试；如果今天已有教练计划，不能改成休息。`
  }

  return friendlySupabaseMessage(error, prefix)
}

export function friendlyPlanSaveError(error: unknown, context: { is_training?: boolean; source?: string } = {}) {
  const supabaseError = asSupabaseError(error)
  const wrapped = new Error(friendlyPlanSaveMessage(error, context)) as Error & SupabaseLikeError
  wrapped.code = supabaseError?.code
  wrapped.details = supabaseError?.details ?? supabaseError?.hint ?? supabaseError?.message ?? supabaseError?.error
  wrapped.status = normalizeStatus(supabaseError?.status ?? supabaseError?.statusCode)
  return wrapped
}

export function friendlySupabaseError(error: unknown, prefix: string) {
  const supabaseError = asSupabaseError(error)
  const wrapped = new Error(friendlySupabaseMessage(error, prefix)) as Error & SupabaseLikeError
  wrapped.code = supabaseError?.code
  wrapped.details = supabaseError?.details ?? supabaseError?.hint ?? supabaseError?.message ?? supabaseError?.error
  wrapped.status = normalizeStatus(supabaseError?.status ?? supabaseError?.statusCode)
  return wrapped
}

export function errorDiagnostic(error: unknown) {
  const supabaseError = asSupabaseError(error)
  const raw = rawErrorMessage(error)
  return {
    code: supabaseError?.code,
    details: supabaseError?.details ?? supabaseError?.hint ?? supabaseError?.error,
    message: raw,
    status: normalizeStatus(supabaseError?.status ?? supabaseError?.statusCode),
  }
}

function normalizeStatus(status?: number | string) {
  if (typeof status === 'number') return status
  if (!status) return undefined
  const parsed = Number.parseInt(status, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}
