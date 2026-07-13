export const WORKSPACE_MANIFEST_FILE_NAME = 'ai-canvas-workspace.json'
export const WORKSPACE_CONFIG_DIRECTORY_NAME = '.config'
export const WORKSPACE_CONFIG_FILE_NAME = 'config.json'
export const WORKSPACE_TEMPLATE_FILE_NAME = 'workflow-templates.json'
export const WORKSPACE_IMAGE_DIRECTORY_NAME = 'images'

const DEFAULT_IMAGE_EXTENSION = 'png'

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function sanitizePathSegment(segment: string) {
  const normalized = segment.replace(/[\\/]+/g, '-').replace(/\.+/g, '.').trim()

  if (!normalized || normalized === '.' || normalized === '..') {
    throw new Error('资源路径不合法')
  }

  return normalized.replace(/[<>:"|?*]/g, '-').trim()
}

export function splitFileName(fileName: string) {
  const normalized = sanitizePathSegment(fileName)
  const lastDotIndex = normalized.lastIndexOf('.')

  if (lastDotIndex <= 0 || lastDotIndex === normalized.length - 1) {
    return {
      name: normalized,
      extension: '',
    }
  }

  return {
    name: normalized.slice(0, lastDotIndex),
    extension: normalized.slice(lastDotIndex + 1).toLowerCase(),
  }
}

export function getImageExtension(fileName: string, mimeType: string) {
  const { extension } = splitFileName(fileName)

  if (extension) {
    return extension
  }

  return IMAGE_MIME_EXTENSIONS[mimeType] || DEFAULT_IMAGE_EXTENSION
}

export function normalizeRelativePath(relativePath: string) {
  const normalized = relativePath.replace(/\\+/g, '/').trim()
  const segments = normalized.split('/').map((segment) => sanitizePathSegment(segment))

  if (segments.length === 0) {
    throw new Error('资源路径不合法')
  }

  return segments.join('/')
}

export async function readJsonFile<T>(handle: FileSystemDirectoryHandle, fileName: string) {
  try {
    const fileHandle = await handle.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    const content = await file.text()

    if (!content.trim()) {
      return null
    }

    return JSON.parse(content) as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return null
    }

    throw error
  }
}

export async function writeJsonFile(handle: FileSystemDirectoryHandle, fileName: string, data: unknown) {
  const fileHandle = await handle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

export async function writeJsonFileIfChanged(handle: FileSystemDirectoryHandle, fileName: string, data: unknown) {
  const nextContent = JSON.stringify(data, null, 2)

  try {
    const fileHandle = await handle.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    const previousContent = await file.text()

    if (previousContent === nextContent) {
      return false
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
      throw error
    }
  }

  const fileHandle = await handle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(nextContent)
  await writable.close()
  return true
}

export async function writeBlobFile(fileHandle: FileSystemFileHandle, blob: Blob) {
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export async function readBlobFileAtPath(
  root: FileSystemDirectoryHandle,
  relativePath: string,
) {
  const segments = normalizeRelativePath(relativePath).split('/')
  const fileName = segments.pop()

  if (!fileName) {
    throw new Error('资源路径不合法')
  }

  const directory = await getNestedDirectoryHandle(root, segments)
  return (await directory.getFileHandle(fileName)).getFile()
}

export async function writeBlobFileAtPath(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  blob: Blob,
) {
  const segments = normalizeRelativePath(relativePath).split('/')
  const fileName = segments.pop()

  if (!fileName) {
    throw new Error('资源路径不合法')
  }

  const directory = await getNestedDirectoryHandle(root, segments, { create: true })
  const fileHandle = await directory.getFileHandle(fileName, { create: true })
  await writeBlobFile(fileHandle, blob)
}

export async function getNestedDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  pathSegments: string[],
  options?: { create?: boolean },
) {
  let currentHandle = handle

  for (const segment of pathSegments) {
    currentHandle = await currentHandle.getDirectoryHandle(sanitizePathSegment(segment), {
      create: options?.create ?? false,
    })
  }

  return currentHandle
}

export async function removeFileIfExists(handle: FileSystemDirectoryHandle, fileName: string) {
  try {
    await handle.removeEntry(fileName)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return
    }

    throw error
  }
}
