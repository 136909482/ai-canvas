import { create } from 'zustand'
import { platformBridge } from '@/platform'
import {
  captureSelectedWorkflowTemplate,
  createWorkflowTemplate,
  normalizeWorkflowTemplateLibrary,
} from '@/features/workflowTemplates/runtime'
import type { WorkflowTemplate, WorkflowTemplateLibrary } from '@/types'
import { useCanvasStore } from './useCanvasStore'

interface WorkflowTemplateStore {
  templates: WorkflowTemplate[]
  hydrated: boolean
  busy: boolean
  openRequestVersion: number
  hydrate: () => Promise<void>
  requestOpen: () => void
  saveSelection: (name: string) => Promise<WorkflowTemplate>
  renameTemplate: (id: string, name: string) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
}

function buildLibrary(templates: WorkflowTemplate[]): WorkflowTemplateLibrary {
  return { type: 'ai-canvas-workflow-templates', version: 1, templates }
}

export const useWorkflowTemplateStore = create<WorkflowTemplateStore>()((set, get) => ({
  templates: [],
  hydrated: false,
  busy: false,
  openRequestVersion: 0,

  hydrate: async () => {
    set({ busy: true })
    try {
      const library = normalizeWorkflowTemplateLibrary(await platformBridge.loadWorkflowTemplates())
      set({ templates: library.templates, hydrated: true })
    } finally {
      set({ busy: false })
    }
  },

  requestOpen: () => set((state) => ({ openRequestVersion: state.openRequestVersion + 1 })),

  saveSelection: async (name) => {
    const { nodes, edges } = useCanvasStore.getState()
    const draft = captureSelectedWorkflowTemplate(nodes, edges)
    if (!draft) throw new Error('请先选择至少一个节点')
    const template = createWorkflowTemplate(name, draft)
    const templates = [template, ...get().templates]
    set({ busy: true })
    try {
      await platformBridge.saveWorkflowTemplates(buildLibrary(templates))
      set({ templates, hydrated: true })
      return template
    } finally {
      set({ busy: false })
    }
  },

  renameTemplate: async (id, name) => {
    const now = Date.now()
    const templates = get().templates.map((template) => template.id === id
      ? { ...template, name: name.trim(), updatedAt: now }
      : template)
    set({ busy: true })
    try {
      await platformBridge.saveWorkflowTemplates(buildLibrary(templates))
      set({ templates })
    } finally {
      set({ busy: false })
    }
  },

  deleteTemplate: async (id) => {
    const templates = get().templates.filter((template) => template.id !== id)
    set({ busy: true })
    try {
      await platformBridge.saveWorkflowTemplates(buildLibrary(templates))
      set({ templates })
    } finally {
      set({ busy: false })
    }
  },
}))
