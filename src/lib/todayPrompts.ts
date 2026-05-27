import type { RestConflict } from './restRules'
import type { Penalty } from './types'

type ContributionPenalty = Pick<Penalty, 'amount' | 'date' | 'status'>

export type ContributionPromptState = {
  key: string
  latestDate: string
  pendingCount: number
  pendingTotal: number
  restWarning: string | null
}

export function getContributionPromptState(
  profileId: string | undefined,
  loginRunId: string | null,
  penalties: ContributionPenalty[],
  restConflict: RestConflict | null,
  shownKey: string | null,
): ContributionPromptState | null {
  if (!profileId || !loginRunId) return null

  const key = `${profileId}:${loginRunId}`
  if (shownKey === key) return null

  const pendingPenalties = penalties
    .filter((penalty) => penalty.status === 'pending')
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
  if (pendingPenalties.length === 0) return null

  return {
    key,
    latestDate: pendingPenalties[0].date,
    pendingCount: pendingPenalties.length,
    pendingTotal: pendingPenalties.reduce((sum, penalty) => sum + penalty.amount, 0),
    restWarning: getContributionRestWarning(restConflict),
  }
}

export function getContributionRestWarning(restConflict: RestConflict | null) {
  if (!restConflict) return null
  return '今天不能休息，只能训练或申请请假。'
}

export function getRestChoiceActionState(restBlockedMessage: string | null | undefined, restSaving = false) {
  return {
    ariaDisabled: Boolean(restBlockedMessage),
    canSubmit: !restBlockedMessage && !restSaving,
    label: restSaving ? '保存中' : restBlockedMessage ? '今天不能休息' : '今日休息',
    notice: restBlockedMessage ?? null,
  }
}
