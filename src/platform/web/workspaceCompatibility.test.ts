import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { ProjectRecord } from '../../types/index.ts'
import {
  isLegacyWorkspaceData,
  isWorkspaceManifest,
  normalizeStoredProjectRecord,
  type StoredProjectRecord,
} from './workspaceCompatibility.ts'

function readFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(
    new URL(`../../../test-fixtures/workspaces/${relativePath}`, import.meta.url),
    'utf8',
  ))
}

test('web workspace compatibility reads the legacy monolithic fixture', () => {
  const fixture = readFixture('legacy-monolithic/ai-canvas-workspace.json')
  assert(isLegacyWorkspaceData(fixture))

  const project = normalizeStoredProjectRecord(fixture.projects[0] as unknown as StoredProjectRecord)
  assert(project)
  assert.equal(project.id, 'legacy-project')
  assert.deepEqual(project.savedSnapshot, project.workingSnapshot)
  assert.equal(project.archivedAt, null)
})

test('web workspace compatibility reads the compact split workspace fixture', () => {
  const manifest = readFixture('split-v2/ai-canvas-workspace.json')
  assert(isWorkspaceManifest(manifest))
  assert.equal(manifest.projects[0]?.fileName, 'split-project.json')

  const storedProject = readFixture('split-v2/split-project.json') as ProjectRecord
  const project = normalizeStoredProjectRecord(storedProject)
  assert(project)
  assert.equal(project.id, manifest.projects[0]?.id)
  assert.deepEqual(project.savedSnapshot, project.workingSnapshot)
})
