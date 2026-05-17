type MemberLabelLike = {
  account_name?: string | null
  display_name?: string | null
  email?: string | null
  member_code?: string | null
}

export function cleanMemberLabel(value?: string | null) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function displayMemberLabel(member: MemberLabelLike) {
  return cleanMemberLabel(member.display_name) || cleanMemberLabel(member.account_name) || '成员'
}

export function accountMemberLabel(member: MemberLabelLike) {
  return cleanMemberLabel(member.account_name)
}

export function contactMemberLabel(member: MemberLabelLike) {
  return cleanMemberLabel(member.email) || cleanMemberLabel(member.member_code)
}

export function shouldShowAccountLabel(member: MemberLabelLike) {
  const accountName = cleanMemberLabel(member.account_name)
  const displayName = displayMemberLabel(member)
  return Boolean(accountName && accountName !== displayName)
}
