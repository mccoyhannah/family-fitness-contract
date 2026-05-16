import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { MemberProfile, Profile } from '../lib/types'

const demoStudent: MemberProfile = {
  id: '00000000-0000-0000-0000-000000000101',
  name: '爸爸',
  role: 'student',
  email: 'dad@example.com',
  member_code: 'DAD001',
}

function selectedKey(coachId?: string) {
  return `family-fitness-contract:selected-member:${coachId ?? 'demo'}`
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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: true })
    setLoading(false)

    if (error) {
      setMessage('成员列表加载失败，请确认 Supabase RLS 和成员绑定表已更新。')
      return
    }

    const nextMembers = (data ?? []) as MemberProfile[]
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

  const addMember = async (identifier: string) => {
    const trimmed = identifier.trim()
    if (!trimmed) return '请输入成员邮箱或成员码。'
    if (!supabase) {
      setSelectedMemberId(demoStudent.id)
      return null
    }

    const { error } = await supabase.rpc('coach_add_member', { identifier: trimmed })
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
