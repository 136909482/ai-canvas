import { filterAndSortProjects } from './projectManagerModel.ts'
import type { ProjectRecord } from '@/types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function createProject(
  id: string,
  name: string,
  updatedAt: number,
  lastOpenedAt: number,
  archivedAt: number | null = null,
): ProjectRecord {
  const snapshot = {
    schemaVersion: 1,
    canvas: { nodes: [], edges: [] },
    taskQueue: { tasks: [] },
  }

  return {
    id,
    name,
    savedSnapshot: snapshot,
    workingSnapshot: snapshot,
    createdAt: 0,
    updatedAt,
    lastOpenedAt,
    archivedAt,
  }
}

function runProjectManagerModelTests() {
  const projects = [
    createProject('charlie', 'Charlie', 100, 300),
    createProject('alpha', 'Alpha', 300, 100),
    createProject('bravo', 'Bravo', 200, 200),
  ]

  const updated = filterAndSortProjects(projects, {
    category: 'all',
    searchQuery: '',
    sortMode: 'updated',
  })
  assert(updated.map((project) => project.id).join(',') === 'alpha,bravo,charlie', 'updated sort should be newest first')
  assert(projects.map((project) => project.id).join(',') === 'charlie,alpha,bravo', 'filtering should not mutate the source array')

  const matching = filterAndSortProjects(projects, {
    category: 'all',
    searchQuery: '  ALP  ',
    sortMode: 'updated',
  })
  assert(matching.length === 1 && matching[0]?.id === 'alpha', 'search should trim input and ignore case')

  const ascending = filterAndSortProjects(projects, {
    category: 'all',
    searchQuery: '',
    sortMode: 'name-asc',
  })
  assert(ascending.map((project) => project.id).join(',') === 'alpha,bravo,charlie', 'ascending name sort should use project names')

  const descending = filterAndSortProjects(projects, {
    category: 'all',
    searchQuery: '',
    sortMode: 'name-desc',
  })
  assert(descending.map((project) => project.id).join(',') === 'charlie,bravo,alpha', 'descending name sort should use project names')

  const recentProjects = Array.from({ length: 14 }, (_, index) => (
    createProject(`project-${index}`, `Project ${index}`, index, index)
  ))
  const recent = filterAndSortProjects(recentProjects, {
    category: 'recent',
    searchQuery: '',
    sortMode: 'updated',
  })
  assert(recent.length === 12, 'recent category should limit results to twelve projects')
  assert(recent.every((project) => project.id !== 'project-0' && project.id !== 'project-1'), 'recent category should keep the most recently opened projects')

  const archivedProject = createProject('archived', 'Archived', 400, 400, 400)
  const mixedProjects = [...projects, archivedProject]
  const available = filterAndSortProjects(mixedProjects, {
    category: 'all',
    searchQuery: '',
    sortMode: 'updated',
  })
  assert(!available.some((project) => project.id === archivedProject.id), 'all category should exclude archived projects')
  const archived = filterAndSortProjects(mixedProjects, {
    category: 'archived',
    searchQuery: '',
    sortMode: 'updated',
  })
  assert(archived.length === 1 && archived[0]?.id === archivedProject.id, 'archived category should only include archived projects')
}

runProjectManagerModelTests()
