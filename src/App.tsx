
import { lazy, Suspense } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { AppFeedbackHost } from '@/components/AppFeedbackHost'
import { Canvas } from '@/components/Canvas'
import { CanvasQuickActions } from '@/components/CanvasTopBar'
import { FloatingToolbar } from '@/components/FloatingToolbar'
import { ProjectBootstrap } from '@/components/ProjectBootstrap'
import { TaskQueueRunner } from '@/components/TaskQueueRunner'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Toolbar } from '@/components/Toolbar'
import { WorkspaceSearchDialog } from '@/components/WorkspaceSearchDialog'
import { useImageEditorStore } from '@/store/useImageEditorStore'
import { useProjectDialogStore } from '@/store/useProjectDialogStore'
import { useProjectStore } from '@/store/useProjectStore'
import { themeClasses } from '@/styles/themeClasses'

const ImageFullscreenEditor = lazy(() => import('@/components/ImageFullscreenEditor').then((module) => ({
  default: module.ImageFullscreenEditor,
})))
const ProjectManagerDialog = lazy(() => import('@/components/ProjectManagerDialog').then((module) => ({
  default: module.ProjectManagerDialog,
})))

function EmptyProjectHint() {
  const openProjectDialog = useProjectDialogStore((state) => state.open)

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
      <div className={`pointer-events-auto w-full max-w-md rounded-[24px] p-6 text-center ${themeClasses.strongPanel}`}>
        <div className={`text-lg font-semibold ${themeClasses.textPrimary}`}>还没有项目</div>
        <p className={`mt-2 text-sm leading-6 ${themeClasses.textMuted}`}>先创建一个项目，再开始在画布上编辑内容。</p>
        <button
          type="button"
          onClick={openProjectDialog}
          className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--canvas-bg)] transition hover:opacity-90"
        >
          打开项目管理
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
