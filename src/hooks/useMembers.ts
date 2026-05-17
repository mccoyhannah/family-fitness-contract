import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { cleanMemberLabel } from '../lib/memberLabels'
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
  display_name: '1号',
  role: 'student',
  email: 'dad@example.com',
  member_code: 'DAD001',
  member_since: 'demo',
}

const demoCoachId = '00000000-0000-0000-0000-000000000102'

function selectedKey(coachId?: string) {
  return `family-fitness-contract:selected-member:${coachId ?? 'demo'}`
}

function demoDisplayNameKey(coachId?: string) {
  return `family-fitness-contract:demo-member-display-name:${coachId ?? 'demo'}`
}

function demoMember(coachId?: string) {
  const displayName = cleanMemberLabel(localStorage.getItem(demoDisplayNameKey(coachId))) || demoStudent.display_name
  return { ...demoStudent, name: displayName, display_name: displayName }
}

function isLocalhostPreview() {
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname)
}

function shouldUseDemoMembers(coachId?: string) {
  return !isSupabaseConfigured || !supabase || (coachId === demoCoachId && isLocalhostPreview())
}

function toMemberProfile(profile: Profile, binding?: Pick<CoachMemberRow, 'display_name' | 'created_at'>): MemberProfile {
  const accountName = cleanMemberLabel(profile.name) || cleanMemberLabel(profile.email) || cleanMemberLabel(profile.member_code) || '成员'
  const displayName = cleanMemberLabel(binding?.display_name) || '成员'
  return {
    ...profile,
    name: displayName,
    account_name: accountName,
    display_name: displayName,
    member_since: binding?.created_at ?? profile.created_at,
  }
}

export function useMembers(coachId?: string) {
  const [members, setMembers] = useState<MemberProfile[]>(() => shouldUseDemoMembers(coachId) ? [demoMember(coachId)] : [])
  const [selectedMemberId, setSelectedMemberIdState] = useState<string>(() => localStorage.getItem(selectedKey(coachId)) ?? '')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (shouldUseDemoMembers(coachId)) {
      setMembers([demoMember(coachId)])
      setSelectedMemberIdState((current) => current || demoStudent.id)
      return
    }

    if (!coachId) {
      setMembers([])
      setSelectedMemberIdState('')
      return
    }

    const client = supabase
    if (!client) return
    setLoading(true)
    const { data: bindingRows, error: bindingError } = await client
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

    const { data: profileRows, error } = await client.from('profiles').select('*').in('id', bindings.map((row) => row.student_id))
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
    const nickname = cleanMemberLabel(displayName)
    if (!nickname) return '请先填写成员昵称。'
    if (!trimmed) return '请输入成员邮箱或成员码。'
    if (shouldUseDemoMembers(coachId)) {
      localStorage.setItem(demoDisplayNameKey(coachId), nickname)
      setMembers([demoMember(coachId)])
      setSelectedMemberId(demoStudent.id)
      return null
    }

    const client = supabase
    if (!client) return 'Supabase 未配置，无法绑定成员。'
    const { error } = await client.rpc('coach_add_member', { identifier: trimmed, display_name: nickname })
    if (error) return error.message || '绑定成员失败，请确认成员账号已创建。'
    await load()
    return null
  }

  const updateMemberDisplayName = async (studentId: string, displayName: string) => {
    const nickname = cleanMemberLabel(displayName)
    if (!nickname) return '请填写新的昵称。'

    if (shouldUseDemoMembers(coachId)) {
      localStorage.setItem(demoDisplayNameKey(coachId), nickname)
      setMembers((current) =>
        current.map((member) =>
          member.id === studentId ? { ...member, name: nickname, display_name: nickname } : member,
        ),
      )
      setSelectedMemberId(studentId)
      return null
    }

    const client = supabase
    if (!client || !coachId) return 'Supabase 未配置，无法更新昵称。'
    const { error } = await client
      .from('coach_members')
      .update({ display_name: nickname })
      .eq('coach_id', coachId)
      .eq('student_id', studentId)

    if (error) return error.message || '更新昵称失败，请稍后再试。'
    setMembers((current) =>
      current.map((member) =>
        member.id === studentId ? { ...member, name: nickname, display_name: nickname } : member,
      ),
    )
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
    updateMemberDisplayName,
  }
}
