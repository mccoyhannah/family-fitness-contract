import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { cleanMemberLabel } from '../lib/memberLabels'
import { DEMO_COACH_ID, DEMO_STUDENT_ID, isLocalhostPreview } from '../lib/preview'
import type { MemberProfile, Profile } from '../lib/types'

type MembersState = {
  loading: boolean
  members: MemberProfile[]
  message: string
  ready: boolean
  selectedMemberId: string
}

type CoachMemberRow = {
  student_id: string
  display_name: string | null
  created_at?: string | null
}

const demoStudent: MemberProfile = {
  id: DEMO_STUDENT_ID,
  name: '1号',
  account_name: '1号',
  display_name: '1号',
  role: 'student',
  email: 'member@example.com',
  member_code: 'MEMBER01',
  member_since: 'demo',
}

const membersStateCache = new Map<string, Omit<MembersState, 'loading'>>()

function selectedKey(coachId?: string) {
  return `family-fitness-contract:selected-member:${coachId ?? 'demo'}`
}

function demoDisplayNameKey(coachId?: string) {
  return `family-fitness-contract:demo-member-display-name:${coachId ?? 'demo'}`
}

function isLegacyDemoLabel(value: string) {
  return ['爸爸', '老爸', 'dad@example.com'].includes(value.toLowerCase())
}

function demoMember(coachId?: string) {
  const savedDisplayName = cleanMemberLabel(localStorage.getItem(demoDisplayNameKey(coachId)))
  const displayName = savedDisplayName && !isLegacyDemoLabel(savedDisplayName) ? savedDisplayName : demoStudent.display_name
  return { ...demoStudent, name: displayName, display_name: displayName }
}

function shouldUseDemoMembers(coachId?: string) {
  return !isSupabaseConfigured || !supabase || (coachId === DEMO_COACH_ID && isLocalhostPreview())
}

function cacheKey(coachId?: string) {
  return coachId ?? 'pending'
}

function demoMembersState(coachId?: string): MembersState {
  const member = demoMember(coachId)
  return {
    loading: false,
    members: [member],
    message: '',
    ready: true,
    selectedMemberId: member.id,
  }
}

function initialMembersState(coachId?: string): MembersState {
  const cached = membersStateCache.get(cacheKey(coachId))
  if (cached) return { ...cached, loading: false }
  if (shouldUseDemoMembers(coachId)) return demoMembersState(coachId)
  return {
    loading: Boolean(coachId && isSupabaseConfigured && supabase),
    members: [],
    message: '',
    ready: false,
    selectedMemberId: localStorage.getItem(selectedKey(coachId)) ?? '',
  }
}

function rememberMembersState(coachId: string | undefined, state: Omit<MembersState, 'loading'>) {
  membersStateCache.set(cacheKey(coachId), state)
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
  const [state, setState] = useState<MembersState>(() => initialMembersState(coachId))

  const load = useCallback(async () => {
    if (shouldUseDemoMembers(coachId)) {
      const next = demoMembersState(coachId)
      rememberMembersState(coachId, { members: next.members, message: next.message, ready: next.ready, selectedMemberId: next.selectedMemberId })
      setState(next)
      return
    }

    if (!coachId) {
      const next = { loading: false, members: [], message: '', ready: false, selectedMemberId: '' }
      setState(next)
      return
    }

    const client = supabase
    if (!client) return
    setState((current) => ({ ...current, loading: true }))
    const { data: bindingRows, error: bindingError } = await client
      .from('coach_members')
      .select('student_id, display_name, created_at')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: true })

    if (bindingError) {
      setState((current) => ({
        ...current,
        loading: false,
        message: '成员列表加载失败，请确认 Supabase RLS 和成员绑定表已更新。',
        ready: current.ready || current.members.length > 0,
      }))
      return
    }

    const bindings = (bindingRows ?? []) as CoachMemberRow[]
    if (bindings.length === 0) {
      const next = { loading: false, members: [], message: '', ready: true, selectedMemberId: '' }
      rememberMembersState(coachId, { members: next.members, message: next.message, ready: next.ready, selectedMemberId: next.selectedMemberId })
      setState(next)
      return
    }

    const { data: profileRows, error } = await client.from('profiles').select('*').in('id', bindings.map((row) => row.student_id))

    if (error) {
      setState((current) => ({
        ...current,
        loading: false,
        message: '成员列表加载失败，请确认 Supabase RLS 和成员绑定表已更新。',
        ready: current.ready || current.members.length > 0,
      }))
      return
    }

    const profileMap = new Map(((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]))
    const nextMembers = bindings
      .map((binding) => {
        const profile = profileMap.get(binding.student_id)
        return profile ? toMemberProfile(profile, binding) : null
      })
      .filter((member): member is MemberProfile => Boolean(member))

    setState((current) => {
      const selectedMemberId = (() => {
        if (current.selectedMemberId && nextMembers.some((member) => member.id === current.selectedMemberId)) return current.selectedMemberId
      const saved = localStorage.getItem(selectedKey(coachId))
      if (saved && nextMembers.some((member) => member.id === saved)) return saved
      return nextMembers[0]?.id ?? ''
      })()
      const next = {
        loading: false,
        members: nextMembers,
        message: '',
        ready: true,
        selectedMemberId,
      }
      rememberMembersState(coachId, { members: next.members, message: next.message, ready: next.ready, selectedMemberId: next.selectedMemberId })
      return next
    })
  }, [coachId])

  useEffect(() => {
    void load()
  }, [load])

  const setSelectedMemberId = useCallback(
    (memberId: string) => {
      localStorage.setItem(selectedKey(coachId), memberId)
      setState((current) => {
        const next = { ...current, selectedMemberId: memberId }
        rememberMembersState(coachId, { members: next.members, message: next.message, ready: next.ready, selectedMemberId: next.selectedMemberId })
        return next
      })
    },
    [coachId],
  )

  const selectedMember = useMemo(
    () => state.members.find((member) => member.id === state.selectedMemberId) ?? state.members[0] ?? null,
    [state.members, state.selectedMemberId],
  )

  const addMember = async (identifier: string, displayName: string) => {
    const trimmed = identifier.trim()
    const nickname = cleanMemberLabel(displayName)
    if (!nickname) return '请先填写成员昵称。'
    if (!trimmed) return '请输入成员邮箱或成员码。'
    if (shouldUseDemoMembers(coachId)) {
      localStorage.setItem(demoDisplayNameKey(coachId), nickname)
      const next = demoMembersState(coachId)
      rememberMembersState(coachId, { members: next.members, message: next.message, ready: next.ready, selectedMemberId: next.selectedMemberId })
      setState(next)
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
      setState((current) => {
        const next = {
          ...current,
          members: current.members.map((member) =>
          member.id === studentId ? { ...member, name: nickname, display_name: nickname } : member,
          ),
          ready: true,
          selectedMemberId: studentId,
        }
        rememberMembersState(coachId, { members: next.members, message: next.message, ready: next.ready, selectedMemberId: next.selectedMemberId })
        return next
      })
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
    setState((current) => {
      const next = {
        ...current,
        members: current.members.map((member) =>
        member.id === studentId ? { ...member, name: nickname, display_name: nickname } : member,
        ),
      }
      rememberMembersState(coachId, { members: next.members, message: next.message, ready: next.ready, selectedMemberId: next.selectedMemberId })
      return next
    })
    await load()
    return null
  }

  const profileById = useCallback(
    (id: string): Profile | undefined => state.members.find((member) => member.id === id),
    [state.members],
  )

  return {
    addMember,
    loading: state.loading,
    members: state.members,
    message: state.message,
    profileById,
    ready: state.ready,
    reload: load,
    selectedMember,
    selectedMemberId: selectedMember?.id ?? state.selectedMemberId,
    setSelectedMemberId,
    updateMemberDisplayName,
  }
}
