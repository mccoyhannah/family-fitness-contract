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
    <label className="member-select">
      当前成员
      <select value={selectedMemberId} onChange={(event) => onChange(event.target.value)}>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
    </label>
  )
}
