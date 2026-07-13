import { create } from 'zustand'
import type { WorkspaceImageAsset } from '@/types'

export interface ImageEditorSession {
  nodeId: string
  nodeType: 'imageNode' | 'generatedPreviewNode'
  imageUrl: string
  imageAsset?: WorkspaceImageAsset | null
  title: string
  sourceImageNodeId?: string | null
}

interface ImageEditorStore {
  session: ImageEditorSession | null
  open: (session: ImageEditorSession) => void
  close: () => void
}

export const useImageEditorStore = create<ImageEditorStore>((set) => ({
  session: null,
  open: (session) => set({ session }),
  close: () => set({ session: null }),
}))
