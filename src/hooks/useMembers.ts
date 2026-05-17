import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { MemberProfile, Profile } from '../lib/types'

type CoachMemberRow = {
  student_id: string
  display_name: string | null
  created_at?: string | null
}

const demoStudent: MemberProfile = {
  id: '00000000-0000-0000-0000-000000000101',
  name: '爸爸',
  account_name: '爸爸',
  display_name: '爸爸',
  role: 'student',
  email: 'dad@example.com',
  member_code: 'DAD001',
  member_since: 'demo',
}

function selectedKey(coachId?: string) {
  return `family-fitness-contract:selected-member:${coachId ?? 'demo'}`
}

function toMemberProfile(profile: Profile, binding?: Pick<CoachMemberRow, 'display_name' | 'created_at'>): MemberProfile {
  const accountName = profile.name || profile.email || profile.member_code || '成员'
  const displayName = binding?.display_name?.trim() || accountName
  return {
    ...profile,
    name: displayName,
    account_name: accountName,
    display_name: displayName,
    member_since: binding?.created_at ?? profile.created_at,
  }
}

export function useMembers(coachId?: string) {
  const [members, setMembers] = useState<MemberProfile[]>([demoStudent])
  const [selectedMemberId, setSelectedMemberIdState] = useState<string>(() => localStorage.getItem(selectedKey(coachId)) ?? '')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !coachId) {
      setMembers([demoStudent])
      setSelectedMemberIdState((current) => current || demoStudent.id)
      return
    }

    setLoading(true)
    const { data: bindingRows, error: bindingError } = await supabase
      .from('coach_members')
      .select('student_id, display_name, created_at')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: true })

    if (bindingError) {
      setLoading(false)
      setMessage('成员列表加载失败，请确认 Supabase RLS 和成员绑定表已更新。')
      return
    }

    const bindings = (bindingRows ?? []) as CoachMemberRow[]
    if (bindings.length === 0) {
      setLoading(false)
      setMessage('')
      setMembers([])
      setSelectedMemberIdState('')
      return
    }

    const { data: profileRows, error } = await supabase.from('profiles').select('*').in('id', bindings.map((row) => row.student_id))
    setLoading(false)

    if (error) {
      setMessage('成员列表加载失败，请确认 Supabase RLS 和成员绑定表已更新。')
      return
    }

    const profileMap = new Map(((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]))
    const nextMembers = bindings
      .map((binding) => {
        const profile = profileMap.get(binding.student_id)
        return profile ? toMemberProfile(profile, binding) : null
      })
      .filter((member): member is MemberProfile => Boolean(member))

    setMessage('')
    setMembers(nextMembers)
    setSelectedMemberIdState((current) => {
      if (current && nextMembers.some((member) => member.id === current)) return current
      const saved = localStorage.getItem(selectedKey(coachId))
      if (saved && nextMembers.some((member) => member.id === saved)) return saved
      return nextMembers[0]?.id ?? ''
    })
  }, [coachId])

  useEffect(() => {
    void load()
  }, [load])

  const setSelectedMemberId = useCallback(
    (memberId: string) => {
      localStorage.setItem(selectedKey(coachId), memberId)
      setSelectedMemberIdState(memberId)
    },
    [coachId],
  )

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? members[0] ?? null,
    [members, selectedMemberId],
  )

  const addMember = async (identifier: string, displayName: string) => {
    const trimmed = identifier.trim()
    const nickname = displayName.trim()
    if (!nickname) return '请先填写你怎么称呼这个成员。'
    if (!trimmed) return '请输入成员邮箱或成员码。'
    if (!supabase) {
      setSelectedMemberId(demoStudent.id)
      return null
    }

    const { error } = await supabase.rpc('coach_add_member', { identifier: trimmed, display_name: nickname })
    if (error) return error.message || '绑定成员失败，请确认成员账号已创建。'
    await load()
    return null
  }

  const profileById = useCallback(
    (id: string): Profile | undefined => members.find((member) => member.id === id),
    [members],
  )

  return {
    addMember,
    loading,
    members,
    message,
    profileById,
    reload: load,
    selectedMember,
    selectedMemberId: selectedMember?.id ?? selectedMemberId,
    setSelectedMemberId,
  }
}
