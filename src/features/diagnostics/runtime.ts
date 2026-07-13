export type DiagnosticArea = 'persistence' | 'model' | 'network' | 'resource'
export type DiagnosticKind = 'validation' | 'network' | 'permission' | 'not-found' | 'remote' | 'storage' | 'unknown'
export type DiagnosticContextValue = string | number | boolean | null

export interface AppDiagnostic {
  id: string
  area: DiagnosticArea
  kind: DiagnosticKind
  code: string
  title: string
  message: string
  detail: string
  retryable: boolean
  occurredAt: number
  context: Record<string, DiagnosticContextValue>
}

export interface CreateDiagnosticInput {
  area: DiagnosticArea
  title: string
  error: unknown
  code?: string
  kind?: DiagnosticKind
  retryable?: boolean
  context?: Record<string, DiagnosticContextValue | undefined>
}

const NETWORK_ERROR_PATTERN = /(?:\bHTTP\s*[45]\d\d\b|\b(?:429|5\d\d)\b|fetch|network|timeout|timed out|unable to reach|connection|quota|rate limit|网络|调用失败|请求失败|连接失败|超时)/i
const PERMISSION_ERROR_PATTERN = /(?:permission|denied|not allowed|unauthorized|forbidden|权限|拒绝访问|未授权)/i
const NOT_FOUND_ERROR_PATTERN = /(?:\bENOENT\b|not found|missing|不存在|找不到|缺少)/i
const VALIDATION_ERROR_PATTERN = /(?:invalid|unsupported|requires?|must |格式不正确|不支持|请先|必须|无效)/i

export function getDiagnosticErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return '发生未知错误'
}

export function classifyDiagnosticKind(error: unknown, area: DiagnosticArea): DiagnosticKind {
  const message = getDiagnosticErrorMessage(error)

  if (error instanceof TypeError || NETWORK_ERROR_PATTERN.test(message)) return 'network'
  if (PERMISSION_ERROR_PATTERN.test(message)) return 'permission'
  if (NOT_FOUND_ERROR_PATTERN.test(message)) return 'not-found'
  if (VALIDATION_ERROR_PATTERN.test(message)) return 'validation'
  if (area === 'persistence') return 'storage'
  if (area === 'model') return 'remote'
  return 'unknown'
}

function isRetryableKind(kind: DiagnosticKind) {
  return kind === 'network' || kind === 'remote' || kind === 'storage' || kind === 'unknown'
}

function normalizeContext(context: CreateDiagnosticInput['context']) {
  return Object.fromEntries(
    Object.entries(context ?? {}).filter((entry): entry is [string, DiagnosticContextValue] => entry[1] !== undefined),
  )
}

export function createAppDiagnostic(input: CreateDiagnosticInput, now = Date.now()): AppDiagnostic {
  const kind = input.kind ?? classifyDiagnosticKind(input.error, input.area)
  const message = getDiagnosticErrorMessage(input.error)
  const detail = input.error instanceof Error && input.error.stack
    ? input.error.stack
    : message

  return {
    id: `diagnostic-${now}-${Math.random().toString(36).slice(2, 8)}`,
    area: input.area,
    kind,
    code: input.code ?? `${input.area}_${kind}`.toUpperCase(),
    title: input.title,
    message,
    detail,
    retryable: input.retryable ?? isRetryableKind(kind),
    occurredAt: now,
    context: normalizeContext(input.context),
  }
}

export function formatDiagnosticReport(diagnostics: AppDiagnostic[]) {
  return diagnostics.map((diagnostic) => {
    const context = Object.entries(diagnostic.context)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ')

    return [
      `[${new Date(diagnostic.occurredAt).toISOString()}] ${diagnostic.code} ${diagnostic.title}`,
      diagnostic.message,
      context,
    ].filter(Boolean).join('\n')
  }).join('\n\n')
}
