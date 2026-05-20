export const MAX_EVIDENCE_FILES = 3
export const MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
const browserCompressedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type PreparedEvidenceFile = {
  file: File
  originalName: string
  warning?: string
}

function mimeTypeFromName(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.gif')) return 'image/gif'
  if (lowerName.endsWith('.heic')) return 'image/heic'
  if (lowerName.endsWith('.heif')) return 'image/heif'
  return ''
}

function normalizeMimeType(type: string) {
  const lowerType = type.toLowerCase()
  if (lowerType === 'image/jpg' || lowerType === 'image/pjpeg') return 'image/jpeg'
  if (lowerType === 'image/x-png') return 'image/png'
  return lowerType
}

function isHeicMimeType(type: string) {
  return type === 'image/heic' || type === 'image/heif'
}

function inferMimeType(file: File) {
  const nameType = mimeTypeFromName(file.name)
  const rawType = normalizeMimeType(file.type || '')
  if (isHeicMimeType(rawType)) return rawType
  if (allowedMimeTypes.has(rawType)) return rawType
  if (rawType.startsWith('image/') && nameType) return nameType
  if (nameType) return nameType
  if (rawType) return rawType
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.gif')) return 'image/gif'
  if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif')) return 'image/heic'
  return ''
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function renameAsJpeg(name: string) {
  const base = name.replace(/\.[^.]+$/, '') || 'training-photo'
  return `${base}.jpg`
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败，请换一张照片。'))
    }
    image.src = url
  })
}

async function loadImageSource(file: File): Promise<CanvasImageSource & { width: number; height: number; close?: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file)
    } catch {
      return await loadImageElement(file)
    }
  }
  return await loadImageElement(file)
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片压缩失败，请换一张照片。'))
    }, type, quality)
  })
}

async function compressImage(file: File) {
  const image = await loadImageSource(file)
  try {
    const maxSide = 1800
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('图片处理失败，请换一张照片。')
    context.drawImage(image, 0, 0, width, height)

    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      if (blob.size <= MAX_EVIDENCE_FILE_BYTES) {
        return new File([blob], renameAsJpeg(file.name), {
          lastModified: Date.now(),
          type: 'image/jpeg',
        })
      }
    }
  } finally {
    image.close?.()
  }

  throw new Error('这张照片压缩后仍超过 5 MB，请换一张更小的照片。')
}

export async function prepareEvidenceFile(file: File): Promise<PreparedEvidenceFile> {
  const mimeType = inferMimeType(file)
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error(`${file.name} 不是支持的图片格式。请上传 JPG、PNG、WebP 或 GIF。`)
  }

  const typedFile = file.type === mimeType ? file : new File([file], file.name, { lastModified: file.lastModified, type: mimeType })
  if (typedFile.size <= MAX_EVIDENCE_FILE_BYTES) return { file: typedFile, originalName: file.name }

  if (mimeType === 'image/gif') {
    throw new Error(`${file.name} 超过 5 MB。GIF 不能稳定压缩，请换一张更小的图片。`)
  }
  if (isHeicMimeType(mimeType)) {
    throw new Error(`${file.name} 是超过 5 MB 的 iPhone 原图。请回到相册重新选择，或先转成 JPG 后再上传。`)
  }
  if (!browserCompressedMimeTypes.has(mimeType)) {
    throw new Error(`${file.name} 超过 5 MB。请在相册里压缩或转成 JPG 后再上传。`)
  }

  let compressed: File
  try {
    compressed = await compressImage(typedFile)
  } catch (err) {
    if (err instanceof Error && err.message) throw err
    throw new Error(`${file.name} 太大，当前手机浏览器处理失败。请换一张小一点的照片再试。`)
  }
  return {
    file: compressed,
    originalName: file.name,
    warning: `${file.name} 已压缩到 ${formatFileSize(compressed.size)}。`,
  }
}
