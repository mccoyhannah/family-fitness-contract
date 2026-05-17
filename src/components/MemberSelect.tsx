import type { MemberProfile } from '../lib/types'
import { displayMemberLabel } from '../lib/memberLabels'

type MemberSelectProps = {
  loading?: boolean
  members: MemberProfile[]
  ready?: boolean
  selectedMemberId: string
  onChange: (memberId: string) => void
}

export default function MemberSelect({ loading = false, members, onChange, ready = true, selectedMemberId }: MemberSelectProps) {
  if (!ready) {
    return (
      <div className="member-select member-select-loading" aria-busy={loading} aria-label="当前成员">
        <div className="field-label">当前成员</div>
        <span className="skeleton-line medium" />
      </div>
    )
  }

  if (members.length === 0) {
    return <p className="muted">还没有绑定成员，请先到“成员”页添加。</p>
  }

  return (
    <div className="member-select" aria-label="当前成员">
      <div className="field-label">当前成员</div>
      <div className="member-choice-list">
        {members.map((member) => (
          <button
            aria-pressed={member.id === selectedMemberId}
            className={member.id === selectedMemberId ? 'member-choice active' : 'member-choice'}
            key={member.id}
            type="button"
            onClick={() => onChange(member.id)}
          >
            <strong>{displayMemberLabel(member)}</strong>
          </button>
        ))}
      </div>
    </div>
  )
}
