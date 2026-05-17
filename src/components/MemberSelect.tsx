import type { MemberProfile } from '../lib/types'

type MemberSelectProps = {
  members: MemberProfile[]
  selectedMemberId: string
  onChange: (memberId: string) => void
}

export default function MemberSelect({ members, onChange, selectedMemberId }: MemberSelectProps) {
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
            <strong>{member.display_name}</strong>
            <span>{member.account_name}</span>
            <small>{member.email || member.member_code || '成员账号'}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
