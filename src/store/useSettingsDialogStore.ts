import { create } from 'zustand'

export type SettingsCategoryId = 'models' | 'storage' | 'canvas' | 'appearance' | 'tasks' | 'tools'

interface SettingsDialogStore {
  isOpen: boolean
  activeCategory: SettingsCategoryId
  open: (category?: SettingsCategoryId) => void
  close: () => void
  setActiveCategory: (category: SettingsCategoryId) => void
}

export const useSettingsDialogStore = create<SettingsDialogStore>((set) => ({
  isOpen: false,
  activeCategory: 'models',
  open: (category = 'models') => set({ isOpen: true, activeCategory: category }),
  close: () => set({ isOpen: false }),
  setActiveCategory: (category) => set({ activeCategory: category }),
}))
