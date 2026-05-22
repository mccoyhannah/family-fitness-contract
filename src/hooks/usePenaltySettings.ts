import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_PENALTY_SETTINGS, normalizePenaltySettings } from '../lib/penaltySettings'
import { isLocalPreviewActive } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { notifySyncError } from '../lib/syncError'
import type { PenaltySettings } from '../lib/types'

const LOCAL_PENALTY_SETTINGS_KEY = 'family-fitness-contract:penalty-settings'

function shouldUseLocalPenaltySettings() {
  return !isSupabaseConfigured || !supabase || isLocalPreviewActive()
}

function readLocalPenaltySettings() {
  try {
    const raw = localStorage.getItem(LOCAL_PENALTY_SETTINGS_KEY)
    return normalizePenaltySettings(raw ? JSON.parse(raw) as Partial<PenaltySettings> : DEFAULT_PENALTY_SETTINGS)
  } catch {
    return DEFAULT_PENALTY_SETTINGS
  }
}

function writeLocalPenaltySettings(settings: PenaltySettings) {
  try {
    localStorage.setItem(LOCAL_PENALTY_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Keep the app usable if local storage is full or blocked.
  }
}

export function usePenaltySettings() {
  const [settings, setSettings] = useState<PenaltySettings>(() =>
    shouldUseLocalPenaltySettings() ? readLocalPenaltySettings() : DEFAULT_PENALTY_SETTINGS,
  )
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(() => shouldUseLocalPenaltySettings())

  const load = useCallback(async () => {
    if (shouldUseLocalPenaltySettings()) {
      setSettings(readLocalPenaltySettings())
      setReady(true)
      return
    }
    const client = supabase
    if (!client) return
    try {
      setLoading(true)
      const { data, error } = await client
        .from('penalty_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle()
      if (error) throw error
      setSettings(normalizePenaltySettings(data ?? DEFAULT_PENALTY_SETTINGS))
      setReady(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load().catch(() => {
      setSettings(DEFAULT_PENALTY_SETTINGS)
      setReady(true)
      notifySyncError('penalty-settings', '罚款规则同步失败，已按默认规则显示。')
    })
  }, [load])

  const saveSettings = async (nextSettings: Partial<PenaltySettings>) => {
    const next = normalizePenaltySettings(nextSettings)
    if (shouldUseLocalPenaltySettings()) {
      writeLocalPenaltySettings(next)
      setSettings(next)
      setReady(true)
      return next
    }
    const client = supabase
    if (!client) throw new Error('Supabase 未配置，无法保存罚款规则。')
    const { data, error } = await client
      .from('penalty_settings')
      .update({
        base_amount: next.base_amount,
        daily_increment: next.daily_increment,
        max_amount: next.max_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
      .select('*')
      .single()
    if (error) throw error
    const saved = normalizePenaltySettings(data)
    setSettings(saved)
    setReady(true)
    return saved
  }

  return { loading, ready, reload: load, saveSettings, settings }
}
