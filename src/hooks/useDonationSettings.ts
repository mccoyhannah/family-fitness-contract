import { useCallback, useEffect, useState } from 'react'
import { isLocalPreviewActive } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { notifySyncError } from '../lib/syncError'
import type { DonationSettings } from '../lib/types'

const LOCAL_DONATION_SETTINGS_KEY = 'family-fitness-contract:donation-settings'

const DEFAULT_DONATION_SETTINGS: DonationSettings = {
  qr_image_url: '',
  payment_hint: '扫码或按约定转账后，在这里确认捐赠时间。管理端核对后，这笔贡献会计入家庭基金。',
}

function shouldUseLocalDonationSettings() {
  return !isSupabaseConfigured || !supabase || isLocalPreviewActive()
}

function normalizeDonationSettings(settings?: Partial<DonationSettings> | null): DonationSettings {
  return {
    id: true,
    qr_image_url: settings?.qr_image_url?.trim() ?? DEFAULT_DONATION_SETTINGS.qr_image_url,
    payment_hint: settings?.payment_hint?.trim() || DEFAULT_DONATION_SETTINGS.payment_hint,
    updated_at: settings?.updated_at,
    updated_by: settings?.updated_by ?? null,
  }
}

function readLocalDonationSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_DONATION_SETTINGS_KEY)
    return normalizeDonationSettings(raw ? JSON.parse(raw) as Partial<DonationSettings> : DEFAULT_DONATION_SETTINGS)
  } catch {
    return normalizeDonationSettings(DEFAULT_DONATION_SETTINGS)
  }
}

function writeLocalDonationSettings(settings: DonationSettings) {
  try {
    localStorage.setItem(LOCAL_DONATION_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Keep the app usable if local storage is full or blocked.
  }
}

export function useDonationSettings() {
  const [settings, setSettings] = useState<DonationSettings>(() =>
    shouldUseLocalDonationSettings() ? readLocalDonationSettings() : normalizeDonationSettings(DEFAULT_DONATION_SETTINGS),
  )
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(() => shouldUseLocalDonationSettings())

  const load = useCallback(async () => {
    if (shouldUseLocalDonationSettings()) {
      setSettings(readLocalDonationSettings())
      setReady(true)
      return
    }
    const client = supabase
    if (!client) return
    try {
      setLoading(true)
      const { data, error } = await client
        .from('donation_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle()
      if (error) throw error
      setSettings(normalizeDonationSettings(data ?? DEFAULT_DONATION_SETTINGS))
      setReady(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load().catch(() => {
      setSettings(normalizeDonationSettings(DEFAULT_DONATION_SETTINGS))
      setReady(true)
      notifySyncError('donation-settings', '收款码配置同步失败，已按默认提示显示。')
    })
  }, [load])

  const saveSettings = async (nextSettings: Partial<DonationSettings>) => {
    const next = normalizeDonationSettings(nextSettings)
    if (shouldUseLocalDonationSettings()) {
      writeLocalDonationSettings(next)
      setSettings(next)
      setReady(true)
      return next
    }
    const client = supabase
    if (!client) throw new Error('Supabase 未配置，无法保存收款码配置。')
    const { data, error } = await client
      .from('donation_settings')
      .upsert({
        id: true,
        payment_hint: next.payment_hint,
        qr_image_url: next.qr_image_url,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('*')
      .single()
    if (error) throw error
    const saved = normalizeDonationSettings(data)
    setSettings(saved)
    setReady(true)
    return saved
  }

  return { loading, ready, reload: load, saveSettings, settings }
}
