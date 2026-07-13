import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clipboard, History, Info, RefreshCw, Search, Trash2, X, XCircle } from 'lucide-react'
import { formatDiagnosticReport, type DiagnosticArea } from '@/features/diagnostics/runtime'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { platformBridge } from '@/platform'
import type { WorkspaceAuditEvent, WorkspaceAuditQuery, WorkspaceAuditQueryResult, WorkspaceAuditScope } from '@/platform/types'
import { useDiagnosticsStore } from '@/store/useDiagnosticsStore'
import { useFeedbackStore, type FeedbackToast, type FeedbackToastTone } from '@/store/useFeedbackStore'
import { themeClasses } from '@/styles/themeClasses'

const toastToneClassName: Record<FeedbackToastTone, string> = {
  info: 'border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]',
  success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-600 dark:text-emerald-200',
  warning: 'border-amber-400/25 bg-amber-400/10 text-amber-600 dark:text-amber-200',
  error: 'border-red-400/25 bg-red-500/10 text-red-500 dark:text-red-200',
}

function ToastIcon({ tone }: { tone: FeedbackToastTone }) {
  const className = 'h-4 w-4'

  if (tone === 'success') {
    return <CheckCircle2 className={className} />
  }

  if (tone === 'warning') {
    return <AlertTriangle className={className} />
  }

  if (tone === 'error') {
    return <XCircle className={className} />
  }

  return <Info className={className} />
}

function FeedbackToastItem({ toast }: { toast: FeedbackToast }) {
  const dismissToast = useFeedbackStore((state) => state.dismissToast)
  const openDiagnostics = useDiagnosticsStore((state) => state.open)

  useEffect(() => {
    if (toast.durationMs <= 0) {
      return
    }

    const timer = window.setTimeout(() => dismissToast(toast.id), toast.durationMs)
    return () => window.clearTimeout(timer)
  }, [dismissToast, toast.durationMs, toast.id])

  return (
    <div className={`flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border p-3 shadow-[var(--shadow-panel)] backdrop-blur-2xl ${themeClasses.strongPanel}`}>
      <div className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${toastToneClassName[toast.tone]}`}>
        <ToastIcon tone={toast.tone} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold leading-5 ${themeClasses.textPrimary}`}>{toast.title}</div>
        {toast.message ? <div className={`mt-1 text-xs leading-5 ${themeClasses.textMuted}`}>{toast.message}</div> : null}
        {toast.diagnosticId ? (
          <button
            type="button"
            className="mt-1.5 text-xs font-medium text-[var(--accent-violet-strong)] hover:underline"
            onClick={() => openDiagnostics(toast.diagnosticId)}
          >
            查看诊断
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="关闭提示"
        onClick={() => dismissToast(toast.id)}
        className={`${themeClasses.iconButton} h-7 w-7 shrink-0`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

const diagnosticAreaLabel: Record<DiagnosticArea, string> = {
  persistence: '保存',
  model: '模型',
  network: '网络',
  resource: '资源',
}

const auditScopeOptions: Array<{ value: WorkspaceAuditScope; label: string }> = [
  { value: 'all', label: '全部操作' },
  { value: 'project', label: '项目' },
  { value: 'settings', label: '设置' },
  { value: 'template', label: '模板' },
  { value: 'workspace', label: '工作区' },
]

const auditEventLabels: Record<string, string> = {
  'project.save': '保存项目',
  'project.delete': '删除项目',
  'settings.save': '保存设置',
  'templates.save': '保存模板库',
  'workspace.replace': '替换工作区',
  'workspace.import-json': '迁移旧工作区',
  'workspace.import-bundle': '导入工作区目录包',
}

const EMPTY_AUDIT_RESULT: WorkspaceAuditQueryResult = {
  supported: true,
  entries: [],
  totalCount: 0,
  hasMore: false,
}
const AUDIT_PAGE_SIZE = 30

function buildAuditQuery(scope: WorkspaceAuditScope, search: string, range: string, page: number): WorkspaceAuditQuery {
  const rangeDays = Number(range)
  return {
    scope,
    search: search.trim(),
    from: Number.isFinite(rangeDays) && rangeDays > 0 ? Date.now() - rangeDays * 86_400_000 : undefined,
    limit: AUDIT_PAGE_SIZE,
    offset: page * AUDIT_PAGE_SIZE,
  }
}

function formatAuditReport(entries: WorkspaceAuditEvent[]) {
  return entries.map((entry) => {
    const details = Object.entries(entry.details).map(([key, value]) => `${key}=${String(value)}`).join(' ')
    return `[${new Date(entry.createdAt).toISOString()}] ${entry.eventType} ${entry.entityId ?? ''}${details ? ` ${details}` : ''}`.trim()
  }).join('\n')
}

function DiagnosticsPanel() {
  const diagnostics = useDiagnosticsStore((state) => state.diagnostics)
  const isOpen = useDiagnosticsStore((state) => state.isOpen)
  const close = useDiagnosticsStore((state) => state.close)
  const clear = useDiagnosticsStore((state) => state.clear)
  const dialogRef = useDialogFocus<HTMLElement>(isOpen, close)
  const [activeView, setActiveView] = useState<'diagnostics' | 'audit'>('diagnostics')
  const [auditResult, setAuditResult] = useState<WorkspaceAuditQueryResult>(EMPTY_AUDIT_RESULT)
  const [auditScope, setAuditScope] = useState<WorkspaceAuditScope>('all')
  const [auditRange, setAuditRange] = useState('7')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditSearchDraft, setAuditSearchDraft] = useState('')
  const [auditPage, setAuditPage] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')

  if (!isOpen) return null

  const copyReport = async () => {
    await navigator.clipboard.writeText(formatDiagnosticReport(diagnostics))
  }

  const loadAudit = async (scope: WorkspaceAuditScope, search: string, range: string, page: number) => {
    setAuditLoading(true)
    setAuditError('')
    try {
      setAuditResult(await platformBridge.queryWorkspaceAudit(buildAuditQuery(scope, search, range, page)))
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : '审计记录读取失败')
    } finally {
      setAuditLoading(false)
    }
  }

  const showAudit = () => {
    setActiveView('audit')
    void loadAudit(auditScope, auditSearch, auditRange, auditPage)
  }

  const applyAuditFilter = (nextScope: WorkspaceAuditScope, nextRange: string, nextSearch: string) => {
    setAuditScope(nextScope)
    setAuditRange(nextRange)
    setAuditSearch(nextSearch)
    setAuditPage(0)
    void loadAudit(nextScope, nextSearch, nextRange, 0)
  }

  const goToAuditPage = (page: number) => {
    setAuditPage(page)
    void loadAudit(auditScope, auditSearch, auditRange, page)
  }

  const copyAudit = async () => {
    await navigator.clipboard.writeText(formatAuditReport(auditResult.entries))
  }

  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-black/32 backdrop-blur-sm" onMouseDown={close}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostics-title"
        tabIndex={-1}
        className={`flex h-full w-full max-w-lg flex-col border-l border-[var(--border-subtle)] ${themeClasses.strongPanel}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-4">
          <div className="min-w-0 flex-1">
            <h2 id="diagnostics-title" className={`text-sm font-semibold ${themeClasses.textPrimary}`}>诊断与审计</h2>
            <p className={`text-xs ${themeClasses.textMuted}`}>{activeView === 'diagnostics' ? `${diagnostics.length} 条当前会话记录` : `${auditResult.totalCount} 条本地操作记录`}</p>
          </div>
          {activeView === 'diagnostics' ? (
            <>
              <button type="button" className={`${themeClasses.iconButton} h-8 w-8`} title="复制诊断" aria-label="复制诊断" disabled={diagnostics.length === 0} onClick={() => void copyReport()}>
                <Clipboard className="h-4 w-4" />
              </button>
              <button type="button" className={`${themeClasses.iconButton} h-8 w-8`} title="清空诊断" aria-label="清空诊断" disabled={diagnostics.length === 0} onClick={clear}>
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`${themeClasses.iconButton} h-8 w-8`} title="复制当前审计记录" aria-label="复制当前审计记录" disabled={auditResult.entries.length === 0} onClick={() => void copyAudit()}>
                <Clipboard className="h-4 w-4" />
              </button>
              <button type="button" className={`${themeClasses.iconButton} h-8 w-8`} title="刷新审计记录" aria-label="刷新审计记录" disabled={auditLoading} onClick={() => void loadAudit(auditScope, auditSearch, auditRange, auditPage)}>
                <RefreshCw className={`h-4 w-4 ${auditLoading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
          <button type="button" className={`${themeClasses.iconButton} h-8 w-8`} title="关闭诊断" aria-label="关闭诊断" onClick={close}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div role="tablist" aria-label="诊断记录类型" className="grid shrink-0 grid-cols-2 border-b border-[var(--border-subtle)] bg-[var(--control-bg)] p-1.5">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'diagnostics'}
            onClick={() => setActiveView('diagnostics')}
            className={`h-8 rounded-lg text-xs font-medium transition ${activeView === 'diagnostics' ? 'bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]' : themeClasses.textMuted}`}
          >
            会话诊断
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'audit'}
            onClick={showAudit}
            className={`h-8 rounded-lg text-xs font-medium transition ${activeView === 'audit' ? 'bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]' : themeClasses.textMuted}`}
          >
            本地审计
          </button>
        </div>

        {activeView === 'diagnostics' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {diagnostics.length === 0 ? (
            <div className={`px-5 py-10 text-center text-sm ${themeClasses.textMuted}`}>当前会话没有错误记录</div>
            ) : diagnostics.map((diagnostic) => (
              <article key={diagnostic.id} className="border-b border-[var(--border-subtle)] px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded border border-red-400/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500 dark:text-red-200">
                    {diagnosticAreaLabel[diagnostic.area]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${themeClasses.textPrimary}`}>{diagnostic.title}</div>
                    <div className={`mt-1 break-words text-xs leading-5 ${themeClasses.textSecondary}`}>{diagnostic.message}</div>
                    <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] ${themeClasses.textMuted}`}>
                      <span>{diagnostic.code}</span>
                      <span>{new Date(diagnostic.occurredAt).toLocaleString('zh-CN')}</span>
                      <span>{diagnostic.retryable ? '可重试' : '需检查配置或数据'}</span>
                    </div>
                    {Object.keys(diagnostic.context).length > 0 ? (
                      <dl className={`mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px] ${themeClasses.textMuted}`}>
                        {Object.entries(diagnostic.context).map(([key, value]) => (
                          <div key={key} className="contents">
                            <dt>{key}</dt>
                            <dd className="min-w-0 break-all">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <form
              className="grid shrink-0 grid-cols-2 gap-2 border-b border-[var(--border-subtle)] p-3"
              onSubmit={(event) => {
                event.preventDefault()
                applyAuditFilter(auditScope, auditRange, auditSearchDraft)
              }}
            >
              <select
                aria-label="审计操作分类"
                value={auditScope}
                onChange={(event) => applyAuditFilter(event.target.value as WorkspaceAuditScope, auditRange, auditSearch)}
                className={`h-8 px-2 text-xs ${themeClasses.input}`}
              >
                {auditScopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select
                aria-label="审计时间范围"
                value={auditRange}
                onChange={(event) => applyAuditFilter(auditScope, event.target.value, auditSearch)}
                className={`h-8 px-2 text-xs ${themeClasses.input}`}
              >
                <option value="1">最近 24 小时</option>
                <option value="7">最近 7 天</option>
                <option value="30">最近 30 天</option>
                <option value="0">全部时间</option>
              </select>
              <label className={`col-span-2 flex h-8 items-center gap-2 px-2 ${themeClasses.input}`}>
                <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                <input
                  value={auditSearchDraft}
                  onChange={(event) => setAuditSearchDraft(event.target.value)}
                  aria-label="搜索审计记录"
                  placeholder="操作类型或对象 ID"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
                <button type="submit" className="text-[10px] font-medium text-[var(--accent-violet-strong)]">查询</button>
              </label>
            </form>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {!auditResult.supported ? (
                <div className={`px-5 py-10 text-center text-sm ${themeClasses.textMuted}`}>本地审计仅在桌面版 SQLite 工作区中可用</div>
              ) : auditError ? (
                <div className="px-5 py-10 text-center text-sm text-red-500 dark:text-red-200">{auditError}</div>
              ) : auditLoading && auditResult.entries.length === 0 ? (
                <div className={`px-5 py-10 text-center text-sm ${themeClasses.textMuted}`}>正在读取审计记录...</div>
              ) : auditResult.entries.length === 0 ? (
                <div className={`px-5 py-10 text-center text-sm ${themeClasses.textMuted}`}>没有符合条件的本地操作记录</div>
              ) : auditResult.entries.map((entry) => (
                <article key={entry.id} className="border-b border-[var(--border-subtle)] px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]">
                      <History className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${themeClasses.textPrimary}`}>{auditEventLabels[entry.eventType] ?? entry.eventType}</div>
                      <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] ${themeClasses.textMuted}`}>
                        <span>{new Date(entry.createdAt).toLocaleString('zh-CN')}</span>
                        {entry.entityId ? <span className="break-all">{entry.entityId}</span> : null}
                        <span>{entry.eventType}</span>
                      </div>
                      {Object.keys(entry.details).length > 0 ? (
                        <dl className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] ${themeClasses.textSecondary}`}>
                          {Object.entries(entry.details).map(([key, value]) => (
                            <div key={key} className="flex gap-1"><dt>{key}</dt><dd>{String(value)}</dd></div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {auditResult.supported && auditResult.totalCount > AUDIT_PAGE_SIZE ? (
              <div className="flex h-11 shrink-0 items-center justify-between border-t border-[var(--border-subtle)] px-3">
                <button type="button" aria-label="上一页审计记录" disabled={auditPage === 0 || auditLoading} onClick={() => goToAuditPage(auditPage - 1)} className={`${themeClasses.iconButton} h-7 w-7 disabled:opacity-35`}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className={`text-[10px] ${themeClasses.textMuted}`}>第 {auditPage + 1} 页 · 共 {auditResult.totalCount} 条</span>
                <button type="button" aria-label="下一页审计记录" disabled={!auditResult.hasMore || auditLoading} onClick={() => goToAuditPage(auditPage + 1)} className={`${themeClasses.iconButton} h-7 w-7 disabled:opacity-35`}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}

export function AppFeedbackHost() {
  const toasts = useFeedbackStore((state) => state.toasts)
  const confirmRequest = useFeedbackStore((state) => state.confirmRequest)
  const resolveConfirm = useFeedbackStore((state) => state.resolveConfirm)
  const confirmDialogRef = useDialogFocus<HTMLDivElement>(Boolean(confirmRequest), () => resolveConfirm(false))

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex flex-col items-end gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <FeedbackToastItem toast={toast} />
          </div>
        ))}
      </div>

      {confirmRequest ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/32 px-4 py-6 backdrop-blur-sm">
          <div
            ref={confirmDialogRef}
            className={`w-full max-w-sm rounded-xl p-5 ${themeClasses.strongPanel}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${confirmRequest.id}-title`}
            tabIndex={-1}
            data-testid="feedback-confirm-dialog"
          >
            <div className={`text-base font-semibold ${themeClasses.textPrimary}`} id={`${confirmRequest.id}-title`}>
              {confirmRequest.title}
            </div>
            <div className={`mt-2 text-sm leading-6 ${themeClasses.textMuted}`}>{confirmRequest.message}</div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                data-testid="feedback-confirm-cancel"
                className={`${themeClasses.secondaryButton} h-9 px-3.5 text-xs font-semibold`}
              >
                {confirmRequest.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                data-testid="feedback-confirm-submit"
                className={`inline-flex h-9 items-center justify-center rounded-xl px-3.5 text-xs font-semibold text-white transition ${
                  confirmRequest.tone === 'danger'
                    ? 'bg-red-500 hover:bg-red-400'
                    : 'bg-[var(--accent-violet)] hover:bg-[var(--accent-violet-strong)]'
                }`}
              >
                {confirmRequest.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <DiagnosticsPanel />
    </>
  )
}
