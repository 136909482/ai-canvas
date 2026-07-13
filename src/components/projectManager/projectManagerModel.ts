import type { ProjectRecord } from '@/types'

export type ProjectCategory = 'all' | 'recent' | 'archived'
export type ProjectViewMode = 'grid' | 'list'
export type ProjectSortMode = 'updated' | 'name-asc' | 'name-desc'

interface ProjectFilterOptions {
  category: ProjectCategory
  searchQuery: string
  sortMode: ProjectSortMode
}

export function filterAndSortProjects(
  projects: ProjectRecord[],
  { category, searchQuery, sortMode }: ProjectFilterOptions,
) {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const availableProjects = projects.filter((project) => !project.archivedAt)
  let sourceProjects = category === 'archived'
    ? projects.filter((project) => Boolean(project.archivedAt))
    : category === 'recent'
      ? [...availableProjects].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, 12)
      : availableProjects

  sourceProjects = sourceProjects.filter((project) => (
    normalizedQuery ? project.name.toLowerCase().includes(normalizedQuery) : true
  ))

  if (sortMode === 'name-asc') {
    return sourceProjects.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }

  if (sortMode === 'name-desc') {
    return sourceProjects.sort((left, right) => right.name.localeCompare(left.name, 'zh-CN'))
  }

  return sourceProjects.sort((left, right) => right.updatedAt - left.updatedAt)
}
