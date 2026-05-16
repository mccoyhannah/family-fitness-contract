import { useCallback, useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { CheckInEvidence } from '../lib/types'

const bucket = 'checkin-evidence'

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'image.jpg'
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
    const { data, error } = await supabase.from('check_in_evidence').select('*').order('created_at', { ascending: false })
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
        storage_path: URL.createObjectURL(file),
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        signed_url: URL.createObjectURL(file),
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
