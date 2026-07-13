import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { FileText, FolderKanban, Image, Loader2, Search, X } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { platformBridge } from '@/platform'
import type { WorkspaceSearchEntry, WorkspaceSearchKind, WorkspaceSearchResult } from '@/platform/types'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { getNodeSize, useCanvasStore } from '@/store/useCanvasStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useWorkspaceSearchStore } from '@/store/useWorkspaceSearchStore'
import { themeClasses } from '@/styles/themeClasses'

const EMPTY_RESULT: WorkspaceSearchResult = { supported: true, indexedDocumentCount: 0, entries: [] }
const FILTERS: Array<{ kind: WorkspaceSearchKind | 'all'; label: string }> = [
  { kind: 'all', label: '全部' },
  { kind: 'project', label: '项目' },
  { kind: 'text', label: '文本' },
  { kind: 'asset', label: '资产' },
]
const kindLabel: Record<WorkspaceSearchKind, string> = { project: '项目', text: '文本', asset: '资产' }

function ResultIcon({ kind }: { kind: WorkspaceSearchKind }) {
  const className = 'h-4 w-4'
  if (kind === 'project') return <FolderKanban className={className} />
  if (kind === 'asset') return <Image className={className} />
  return <FileText className={className} />
}

export function WorkspaceSearchDialog() {
  const isOpen = useWorkspaceSearchStore((state) => state.isOpen)
  const close = useWorkspaceSearchStore((state) => state.close)
  const loadProject = useProjectStore((state) => state.loadProject)
  const selectNode = useCanvasStore((state) => state.selectNode)
  const { setCenter } = useReactFlow()
  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen, close, '[data-search-input]')
  const timerRef = useRef<number | null>(null)
  const requestSequenceRef = useRef(0)
  const [query, setQuery] = useState('')
  const [activeKind, setActiveKind] = useState<WorkspaceSearchKind | 'all'>('all')
  const [result, setResult] = useState<WorkspaceSearchResult>(EMPTY_RESULT)
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runSearch = useCallback(async (text: string, kind: WorkspaceSearchKind | 'all') => {
    const requestSequence = ++requestSequenceRef.current
    setLoading(true)
    setError('')
    try {
      const nextResult = await platformBridge.searchWorkspace({
        text,
        kinds: kind === 'all' ? undefined : [kind],
        limit: 60,
      })
      if (requestSequence === requestSequenceRef.current) {
        setResult(nextResult)
        setActiveIndex(0)
      }
    } catch (searchError) {
      if (requestSequence === requestSequenceRef.current) {
        setError(searchError instanceof Error ? searchError.message : '搜索失败')
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false)
    }
  }, [])

  const scheduleSearch = (text: string, kind: WorkspaceSearchKind | 'all') => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void runSearch(text, kind), 160)
  }

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        useWorkspaceSearchStore.getState().open()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const frameId = window.requestAnimationFrame(() => {
      setQuery('')
      setActiveKind('all')
      void runSearch('', 'all')
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [isOpen, runSearch])

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  if (!isOpen) return null

  const openEntry = async (entry: WorkspaceSearchEntry) => {
    const loaded = await loadProject(entry.projectId)
    if (!loaded) return
    if (entry.nodeId) {
      selectNode(entry.nodeId)
      const node = useCanvasStore.getState().nodes.find((item) => item.id === entry.nodeId)
      if (node) {
        const { width, height } = getNodeSize(node)
        await setCenter(node.position.x + width / 2, node.position.y + height / 2, { duration: 260, zoom: 0.9 })
      }
    }
    close()
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(result.entries.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter' && result.entries[activeIndex]) {
      event.preventDefault()
      void openEntry(result.entries[activeIndex])
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center bg-black/36 px-3 pt-[min(12vh,7rem)] backdrop-blur-sm" onMouseDown={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-search-title"
        tabIndex={-1}
        className={`flex h-[min(70vh,38rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl ${themeClasses.strongPanel}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--accent-violet-strong)]" />
          <input
            data-search-input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              scheduleSearch(event.target.value, activeKind)
            }}
            onKeyDown={handleInputKeyDown}
            aria-label="搜索工作区"
            placeholder="搜索项目、节点文本和资产"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" /> : null}
          <button type="button" aria-label="关闭搜索" onClick={close} className={`${themeClasses.iconButton} h-8 w-8`}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--control-bg)] px-3">
          <div role="tablist" aria-label="搜索结果类型" className="flex items-center gap-1">
            {FILTERS.map((filter) => (
              <button
                key={filter.kind}
                type="button"
                role="tab"
                aria-selected={activeKind === filter.kind}
                onClick={() => {
                  setActiveKind(filter.kind)
                  void runSearch(query, filter.kind)
                }}
                className={`h-7 rounded-md px-2.5 text-[11px] font-medium transition ${activeKind === filter.kind ? 'bg-[var(--accent-violet-soft)] text-[var(--accent-violet-strong)]' : 'text-[var(--text-muted)] hover:bg-[var(--control-bg-hover)] hover:text-[var(--text-secondary)]'}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-[var(--text-muted)]">{result.indexedDocumentCount} 项索引</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {error ? (
            <div className="px-5 py-12 text-center text-sm text-red-500 dark:text-red-200">{error}</div>
          ) : !query.trim() ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">{result.indexedDocumentCount} 项本地索引</div>
          ) : result.entries.length === 0 && !loading ? (
            <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">没有匹配结果</div>
          ) : (
            <div role="listbox" aria-label="工作区搜索结果" className="space-y-0.5">
              {result.entries.map((entry, index) => (
                <button
                  key={entry.documentId}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void openEntry(entry)}
                  className={`grid min-h-16 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2 text-left transition ${activeIndex === index ? 'bg-[var(--accent-violet-soft)]' : 'hover:bg-[var(--control-bg-hover)]'}`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${activeIndex === index ? 'border-[var(--accent-violet-muted)] text-[var(--accent-violet-strong)]' : 'border-[var(--border-subtle)] text-[var(--text-muted)]'}`}>
                    <ResultIcon kind={entry.kind} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{entry.title}</span>
                      <span className="shrink-0 text-[9px] text-[var(--text-muted)]">{kindLabel[entry.kind]}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]">{entry.snippet || entry.assetRelativePath || entry.projectName}</span>
                  </span>
                  <span className="max-w-36 truncate text-[10px] text-[var(--text-muted)]">{entry.projectName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
