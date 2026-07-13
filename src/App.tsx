
import { lazy, Suspense, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { FolderOpen, Loader2, Plus } from 'lucide-react'
import { AppFeedbackHost } from '@/components/AppFeedbackHost'
import { Canvas } from '@/components/Canvas'
import { CanvasQuickActions } from '@/components/CanvasTopBar'
import { FloatingToolbar } from '@/components/FloatingToolbar'
import { ProjectBootstrap } from '@/components/ProjectBootstrap'
import { TaskQueueRunner } from '@/components/TaskQueueRunner'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Toolbar } from '@/components/Toolbar'
import { WorkspaceSearchDialog } from '@/components/WorkspaceSearchDialog'
import { platformBridge } from '@/platform'
import { useFeedbackStore } from '@/store/useFeedbackStore'
import { useImageEditorStore } from '@/store/useImageEditorStore'
import { useProjectDialogStore } from '@/store/useProjectDialogStore'
import { useProjectStore } from '@/store/useProjectStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { themeClasses } from '@/styles/themeClasses'

const ImageFullscreenEditor = lazy(() => import('@/components/ImageFullscreenEditor').then((module) => ({
  default: module.ImageFullscreenEditor,
})))
const ProjectManagerDialog = lazy(() => import('@/components/ProjectManagerDialog').then((module) => ({
  default: module.ProjectManagerDialog,
})))

function EmptyProjectHint() {
  const openProjectDialog = useProjectDialogStore((state) => state.open)
  const reloadFromWorkspace = useProjectStore((state) => state.reloadFromWorkspace)
  const workspaceConfigured = useSettingsStore((state) => state.runtime.workspaceConfigured)
  const setWorkspaceRuntimeStatus = useSettingsStore((state) => state.setWorkspaceRuntimeStatus)
  const hydrateFromWorkspace = useSettingsStore((state) => state.hydrateFromWorkspace)
  const notify = useFeedbackStore((state) => state.notify)
  const [isPickingWorkspace, setIsPickingWorkspace] = useState(false)

  const handleChooseWorkspace = async () => {
    setIsPickingWorkspace(true)

    try {
      const status = await platformBridge.pickWorkspaceDirectory()

      if (!status.configured || status.permission === 'denied') {
        return
      }

      setWorkspaceRuntimeStatus({
        configured: status.configured,
        directoryName: status.directoryName,
        permission: status.permission,
      })
      await hydrateFromWorkspace()
      await reloadFromWorkspace()

      if (!useProjectStore.getState().activeProjectId) {
        openProjectDialog()
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError'
        || error instanceof Error && error.message === '未选择缓存目录'

      if (!cancelled) {
        notify({
          tone: 'error',
          title: '保存位置设置失败',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      setIsPickingWorkspace(false)
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
      <div className={`pointer-events-auto w-full max-w-md rounded-lg p-6 text-center ${themeClasses.strongPanel}`}>
        <div className={`text-lg font-semibold ${themeClasses.textPrimary}`}>
          {workspaceConfigured ? '还没有项目' : '先选择项目保存位置'}
        </div>
        <p className={`mt-2 text-sm leading-6 ${themeClasses.textMuted}`}>
          {workspaceConfigured
            ? '工作区已经准备好，现在可以创建第一个项目。'
            : '项目和图片资源将保存在你选择的本地文件夹中。'}
        </p>
        <button
          type="button"
          onClick={workspaceConfigured ? openProjectDialog : () => { void handleChooseWorkspace() }}
          disabled={isPickingWorkspace}
          data-testid={workspaceConfigured ? 'empty-workspace-create-project' : 'workspace-setup-picker'}
          className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPickingWorkspace ? <Loader2 className="h-4 w-4 animate-spin" /> : workspaceConfigured ? <Plus className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
          {isPickingWorkspace ? '正在加载...' : workspaceConfigured ? '新建项目' : '选择保存位置'}
        </button>
      </div>
    </div>
  )
}

function AppContent() {
  const hasHydrated = useProjectStore((state) => state.hasHydrated)
  const isReady = useProjectStore((state) => state.isReady)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const imageEditorSession = useImageEditorStore((state) => state.session)
  if (!hasHydrated || !isReady) {
    return (
      <div className={`flex min-h-screen items-center justify-center text-sm ${themeClasses.canvas} ${themeClasses.textMuted}`}>
        正在初始化工作区...
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className={`w-screen h-screen relative ${themeClasses.canvas}`}>
        <Toolbar rightSlot={<CanvasQuickActions includeWorkflowActions={false} />} />
        <WorkspaceSearchDialog />
        <FloatingToolbar />
        <TaskQueueRunner />
        <Canvas />
        {imageEditorSession ? (
          <Suspense fallback={null}>
            <ImageFullscreenEditor key={`${imageEditorSession.nodeId}\u0000${imageEditorSession.imageUrl}`} />
          </Suspense>
        ) : null}
        {!activeProjectId ? <EmptyProjectHint /> : null}
      </div>
    </ReactFlowProvider>
  )
}

function ProjectManagerDialogHost() {
  const isOpen = useProjectDialogStore((state) => state.isOpen)

  if (!isOpen) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <ProjectManagerDialog />
    </Suspense>
  )
}

export default function App() {
  return (
    <>
      <ThemeProvider />
      <ProjectBootstrap />
      <AppContent />
      <ProjectManagerDialogHost />
      <AppFeedbackHost />
    </>
  )
}
