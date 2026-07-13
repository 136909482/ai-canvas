import type { LLMInputFileData } from '@/types'

const MAX_INPUT_FILES = 5
const MAX_INPUT_FILE_BYTES = 2 * 1024 * 1024

const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'java',
  'go',
  'rs',
  'css',
  'scss',
  'html',
  'htm',
  'xml',
  'yml',
  'yaml',
  'sql',
  'sh',
  'log',
])

export const LLM_INPUT_FILE_ACCEPT = [
  'text/*',
  ...Array.from(TEXT_FILE_EXTENSIONS, (extension) => `.${extension}`),
].join(',')

const UI_TEXT = {
  tooManyFiles: `最多只能添加 ${MAX_INPUT_FILES} 个附件`,
  fileTooLarge: `单个附件不能超过 ${Math.round(MAX_INPUT_FILE_BYTES / 1024 / 1024)}MB`,
  unsupportedFile: '当前仅支持上传文本类附件（txt、md、json、csv、代码文件等）',
  emptyFile: '附件内容为空，无法用于分析',
} as const

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex + 1).toLowerCase() : ''
}

function isSupportedTextFile(file: File) {
  if (file.type.startsWith('text/')) {
    return true
  }

  return TEXT_FILE_EXTENSIONS.has(getFileExtension(file.name))
}

function createInputFileId() {
  return `llmfile-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getMaxInputFiles() {
  return MAX_INPUT_FILES
}

export async function readLLMInputFiles(files: FileList | File[], existingCount: number): Promise<LLMInputFileData[]> {
  const selectedFiles = Array.from(files)

  if (existingCount + selectedFiles.length > MAX_INPUT_FILES) {
    throw new Error(UI_TEXT.tooManyFiles)
  }

  const results = await Promise.all(selectedFiles.map(async (file) => {
    if (!isSupportedTextFile(file)) {
      throw new Error(UI_TEXT.unsupportedFile)
    }

    if (file.size > MAX_INPUT_FILE_BYTES) {
      throw new Error(UI_TEXT.fileTooLarge)
    }

    const content = await file.text()
    if (!content.trim()) {
      throw new Error(UI_TEXT.emptyFile)
    }

    return {
      id: createInputFileId(),
      name: file.name,
      mimeType: file.type || 'text/plain',
      size: file.size,
      content,
      uploadedAt: Date.now(),
    } satisfies LLMInputFileData
  }))

  return results
}
