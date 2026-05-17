type MemberLabelLike = {
  display_name?: string | null
}

export function cleanMemberLabel(value?: string | null) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\p{Cf}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function displayMemberLabel(member: MemberLabelLike) {
  return cleanMemberLabel(member.display_name) || '成员'
}
