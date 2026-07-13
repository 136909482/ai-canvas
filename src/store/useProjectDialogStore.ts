import { create } from 'zustand'

interface ProjectDialogStore {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useProjectDialogStore = create<ProjectDialogStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
