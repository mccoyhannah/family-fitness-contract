import { useCallback, useEffect, useRef, useState } from 'react'
import { readCache, writeCache } from '../lib/cache'
import { shouldUsePreviewLocalScope } from '../lib/preview'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { errorDiagnostic, friendlySupabaseMessage } from '../lib/supabaseErrors'
import { notifySyncError } from '../lib/syncError'
import type { CheckInEvidence } from '../lib/types'

const bucket = 'checkin-evidence'
const DEFAULT_UPLOAD_TIMEOUT_MS = 45_000

export type EvidenceUploadStage = 'storage_upload' | 'evidence_insert' | 'evidence_confirm'

export type EvidenceUploadProgress = {
  fileName?: string
  index?: number
  stage: EvidenceUploadStage
  total?: number
}

export type EvidenceUploadDebug = {
  code?: string
  details?: string | null
  fileName?: string
  fileSize?: number
  fileType?: string
  message: string
  stage: EvidenceUploadStage
  status?: number
}

export class EvidenceUploadError extends Error {
  debug: EvidenceUploadDebug

  constructor(message: string, debug: EvidenceUploadDebug) {
    super(message)
    this.name = 'EvidenceUploadError'
    this.debug = debug
  }
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80) || 'image.jpg'
}

function localEvidencePreview(fileName: string) {
  const safeName = safeFileName(fileName)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="18" fill="#f7faf8"/><path d="M34 108c18-33 43-49 76-49 13 0 24 3 32 10" fill="none" stroke="#ff6f4d" stroke-width="12" stroke-linecap="round"/><circle cx="58" cy="59" r="15" fill="#f3c94e"/><path d="M42 122h76" stroke="#13221d" stroke-width="10" stroke-linecap="round"/><text x="80" y="145" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#5f6d67">${safeName}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function shouldUseLocalEvidence(scope?: string) {
  return !isSupabaseConfigured || !supabase || shouldUsePreviewLocalScope(scope)
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, makeError: () => EvidenceUploadError) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(makeError()), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function uploadDebug(stage: EvidenceUploadStage, file: File | undefined, error: unknown): EvidenceUploadDebug {
  const diagnostic = errorDiagnostic(error)
  return {
    ...diagnostic,
    fileName: file?.name,
    fileSize: file?.size,
    fileType: file?.type,
    stage,
  }
}

export function useCheckInEvidence(scope = 'demo') {
  const [evidence, setEvidence] = useState<CheckInEvidence[]>(() => readCache(scope).evidence)
  const [loading, setLoading] = useState(false)
  const loadSequenceRef = useRef(0)

  const signRows = useCallback(async (rows: CheckInEvidence[]) => {
    if (shouldUseLocalEvidence(scope)) return rows
    const client = supabase
    if (!client) return rows
    return Promise.all(
      rows.map(async (row) => {
        const { data, error } = await client.storage.from(bucket).createSignedUrl(row.storage_path, 60 * 20)
        if (error) return { ...row, signed_url: undefined }
        return { ...row, signed_url: data?.signedUrl }
      }),
    )
  }, [scope])

  const load = useCallback(async () => {
    const loadSequence = loadSequenceRef.current + 1
    loadSequenceRef.current = loadSequence
    const isLatestLoad = () => loadSequence === loadSequenceRef.current
    if (shouldUseLocalEvidence(scope)) {
      setEvidence(readCache(scope).evidence)
      return
    }
    const client = supabase
    if (!client) return
    try {
      setLoading(true)
      let query = client.from('check_in_evidence').select('*').order('created_at', { ascending: false })
      if (scope !== 'demo' && scope !== 'coach') {
        query = query.eq('user_id', scope)
      }
      const { data, error } = await query
      if (!isLatestLoad()) return
      if (error) throw error
      const signed = await signRows((data ?? []) as CheckInEvidence[])
      if (!isLatestLoad()) return
      setEvidence(signed)
      writeCache({ ...readCache(scope), evidence: signed }, scope)
    } finally {
      if (isLatestLoad()) setLoading(false)
    }
  }, [scope, signRows])

  useEffect(() => {
    void load().catch(() => notifySyncError('evidence', '图片证据同步失败，请检查网络后刷新。'))
  }, [load])

  useEffect(() => {
    if (shouldUseLocalEvidence(scope) || !supabase) return
    const client = supabase
    const eventFilter = scope !== 'demo' && scope !== 'coach' ? `user_id=eq.${scope}` : undefined
    const channel = client.channel(`check-in-evidence-${scope}`)
    channel.on(
      'postgres_changes',
      eventFilter
        ? { event: '*', schema: 'public', table: 'check_in_evidence', filter: eventFilter }
        : { event: '*', schema: 'public', table: 'check_in_evidence' },
      () => void load().catch(() => notifySyncError('evidence', '图片证据同步失败，请检查网络后刷新。')),
    )
    channel.subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [load, scope])

  const uploadEvidence = async (
    checkInId: string,
    userId: string,
    files: File[],
    options: { onProgress?: (progress: EvidenceUploadProgress) => void; timeoutMs?: number } = {},
  ) => {
    if (files.length === 0) return []
    if (files.length > 3) throw new Error('最多只能上传 3 张图片。')
    const timeoutMs = options.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS

    if (shouldUseLocalEvidence(scope)) {
      options.onProgress?.({ stage: 'storage_upload', index: files.length, total: files.length })
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
      options.onProgress?.({ stage: 'evidence_confirm', total: files.length })
      return rows
    }

    const inserted: CheckInEvidence[] = []
    for (const [fileIndex, file] of files.entries()) {
      if (!file.type.startsWith('image/')) throw new Error('只能上传图片文件。')
      const path = `${userId}/${checkInId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const client = supabase
      if (!client) throw new Error('Supabase 未配置，无法上传图片。')
      options.onProgress?.({ fileName: file.name, index: fileIndex + 1, stage: 'storage_upload', total: files.length })
      const { error: uploadError } = await withTimeout(
        client.storage.from(bucket).upload(path, file, {
          contentType: file.type,
          upsert: false,
        }),
        timeoutMs,
        () =>
          new EvidenceUploadError('照片上传超时：网络太慢或浏览器阻止了上传，请换网络后重试。', {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            message: '照片上传超时。',
            stage: 'storage_upload',
          }),
      )
      if (uploadError) {
        throw new EvidenceUploadError(
          friendlySupabaseMessage(uploadError, '照片上传失败：'),
          uploadDebug('storage_upload', file, uploadError),
        )
      }

      options.onProgress?.({ fileName: file.name, index: fileIndex + 1, stage: 'evidence_insert', total: files.length })
      const { data, error } = await withTimeout(
        client
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
          .single(),
        timeoutMs,
        () =>
          new EvidenceUploadError('照片记录保存超时：照片可能已上传，请稍后重试。', {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            message: '照片记录保存超时。',
            stage: 'evidence_insert',
          }),
      )
      if (error) {
        void client.storage.from(bucket).remove([path])
        throw new EvidenceUploadError(
          friendlySupabaseMessage(error, '照片已上传，但证据记录保存失败：'),
          uploadDebug('evidence_insert', file, error),
        )
      }
      inserted.push(data as CheckInEvidence)
    }

    if (inserted.length < files.length) {
      throw new EvidenceUploadError('照片记录没有全部保存，请重新提交。', {
        details: `期望 ${files.length} 条，实际 ${inserted.length} 条。`,
        message: '本次上传的照片记录数量不足。',
        stage: 'evidence_confirm',
      })
    }

    options.onProgress?.({ stage: 'evidence_confirm', total: files.length })
    const client = supabase
    if (!client) throw new Error('Supabase 未配置，无法确认图片。')
    const insertedIds = inserted.map((row) => row.id)
    const { data: confirmedEvidence, error: confirmError } = await withTimeout(
      client
        .from('check_in_evidence')
        .select('id')
        .eq('check_in_id', checkInId)
        .eq('user_id', userId)
        .in('id', insertedIds),
      timeoutMs,
      () =>
        new EvidenceUploadError('照片确认超时：请稍后刷新查看是否已提交。', {
          message: '照片确认超时。',
          stage: 'evidence_confirm',
        }),
    )
    if (confirmError) {
      throw new EvidenceUploadError(
        friendlySupabaseMessage(confirmError, '照片确认失败：'),
        uploadDebug('evidence_confirm', undefined, confirmError),
      )
    }
    if (!confirmedEvidence || confirmedEvidence.length < files.length) {
      throw new EvidenceUploadError('照片没有全部写入记录，请重新提交。', {
        details: `期望确认 ${files.length} 条，实际确认 ${confirmedEvidence?.length ?? 0} 条。`,
        message: '回读本次 check_in_evidence 不完整。',
        stage: 'evidence_confirm',
      })
    }

    const signedInserted = await signRows(inserted).catch(() => inserted)
    const nextInsertedIds = new Set(signedInserted.map((row) => row.id))
    setEvidence((current) => {
      const nextEvidence = [...signedInserted, ...current.filter((row) => !nextInsertedIds.has(row.id))]
      writeCache({ ...readCache(scope), evidence: nextEvidence }, scope)
      return nextEvidence
    })

    await load().catch(() => {
      notifySyncError('evidence', '照片已提交，但列表刷新失败，请稍后刷新页面查看。')
    })
    return signedInserted
  }

  const deleteEvidenceForCheckIn = async (checkInId: string, userId?: string) => {
    if (shouldUseLocalEvidence(scope)) {
      const cache = readCache(scope)
      const nextEvidence = cache.evidence.filter(
        (row) => row.check_in_id !== checkInId || Boolean(userId && row.user_id !== userId),
      )
      writeCache({ ...cache, evidence: nextEvidence }, scope)
      setEvidence(nextEvidence)
      return
    }

    const client = supabase
    if (!client) throw new Error('Supabase 未配置，无法删除照片。')

    let selectQuery = client
      .from('check_in_evidence')
      .select('id, storage_path')
      .eq('check_in_id', checkInId)
    if (userId) selectQuery = selectQuery.eq('user_id', userId)

    const { data, error } = await selectQuery
    if (error) throw new Error(friendlySupabaseMessage(error, '照片记录读取失败：'))

    const paths = (data ?? []).map((row) => row.storage_path).filter(Boolean)
    if (paths.length > 0) {
      const { error: storageError } = await client.storage.from(bucket).remove(paths)
      if (storageError) throw new Error(friendlySupabaseMessage(storageError, '照片删除失败：'))
    }

    let deleteQuery = client.from('check_in_evidence').delete().eq('check_in_id', checkInId)
    if (userId) deleteQuery = deleteQuery.eq('user_id', userId)
    const { error: deleteError } = await deleteQuery
    if (deleteError) throw new Error(friendlySupabaseMessage(deleteError, '照片记录删除失败：'))

    await load()
  }

  const evidenceFor = useCallback(
    (checkInId: string) => evidence.filter((row) => row.check_in_id === checkInId),
    [evidence],
  )

  return { deleteEvidenceForCheckIn, evidence, evidenceFor, loading, reload: load, uploadEvidence }
}
