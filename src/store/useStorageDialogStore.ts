import { create } from 'zustand'

interface StorageDialogStore {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useStorageDialogStore = create<StorageDialogStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
