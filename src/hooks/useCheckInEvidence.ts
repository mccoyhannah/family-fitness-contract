import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { CheckInEvidence } from '../lib/types'

const bucket = 'checkin-evidence'

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'image.jpg'
}

function localEvidencePreview(fileName: string) {
  const safeName = safeFileName(fileName)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="18" fill="#f7faf8"/><path d="M34 108c18-33 43-49 76-49 13 0 24 3 32 10" fill="none" stroke="#ff6f4d" stroke-width="12" stroke-linecap="round"/><circle cx="58" cy="59" r="15" fill="#f3c94e"/><path d="M42 122h76" stroke="#13221d" stroke-width="10" stroke-linecap="round"/><text x="80" y="145" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#5f6d67">${safeName}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function useCheckInEvidence(scope = 'demo') {
  const [evidence, setEvidence] = useState<CheckInEvidence[]>(() => readCache(scope).evidence)
  const [loading, setLoading] = useState(false)

  const signRows = useCallback(async (rows: CheckInEvidence[]) => {
    if (!supabase) return rows
    const client = supabase
    return Promise.all(
      rows.map(async (row) => {
        const { data } = await client.storage.from(bucket).createSignedUrl(row.storage_path, 60 * 20)
        return { ...row, signed_url: data?.signedUrl }
      }),
    )
  }, [])

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setEvidence(readCache(scope).evidence)
      return
    }
    setLoading(true)
    let query = supabase.from('check_in_evidence').select('*').order('created_at', { ascending: false })
    if (scope !== 'demo' && scope !== 'coach') {
      query = query.eq('user_id', scope)
    }
    const { data, error } = await query
    setLoading(false)
    if (error) throw error
    const signed = await signRows((data ?? []) as CheckInEvidence[])
    setEvidence(signed)
    writeCache({ ...readCache(scope), evidence: signed }, scope)
  }, [scope, signRows])

  useEffect(() => {
    void load()
  }, [load])

  const uploadEvidence = async (checkInId: string, userId: string, files: File[]) => {
    if (files.length === 0) return []
    if (files.length > 3) throw new Error('最多只能上传 3 张图片。')

    if (!supabase) {
      const rows = files.map((file, index) => ({
        id: `local-evidence-${checkInId}-${index}`,
        check_in_id: checkInId,
        user_id: userId,
        storage_path: `local://${checkInId}/${safeFileName(file.name)}`,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        signed_url: localEvidencePreview(file.name),
      }))
      const cache = readCache(scope)
      const nextEvidence = [...cache.evidence, ...rows]
      writeCache({ ...cache, evidence: nextEvidence }, scope)
      setEvidence(nextEvidence)
      return rows
    }

    const inserted: CheckInEvidence[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) throw new Error('只能上传图片文件。')
      const path = `${userId}/${checkInId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from('check_in_evidence')
        .insert({
          check_in_id: checkInId,
          user_id: userId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select('*')
        .single()
      if (error) throw error
      inserted.push(data as CheckInEvidence)
    }

    await load()
    return inserted
  }

  const evidenceFor = useCallback(
    (checkInId: string) => evidence.filter((row) => row.check_in_id === checkInId),
    [evidence],
  )

  return { evidence, evidenceFor, loading, reload: load, uploadEvidence }
}
