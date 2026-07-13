import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  migrateProjectSnapshot,
  migrateWorkspaceDataSnapshots,
  type PersistedProjectSnapshot,
} from './migrations.ts'

function readSnapshotFixture(name: string): PersistedProjectSnapshot {
  return JSON.parse(readFileSync(
    new URL(`../../../test-fixtures/snapshots/${name}.json`, import.meta.url),
    'utf8',
  )) as PersistedProjectSnapshot
}

test('migrates the complete unversioned snapshot fixture without losing graph or queue data', () => {
  const fixture = readSnapshotFixture('v0-unversioned')
  const migrated = migrateProjectSnapshot(fixture)

  assert.equal(migrated.schemaVersion, CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION)
  assert.deepEqual(migrated.canvas.nodes, fixture.canvas?.nodes)
  assert.deepEqual(migrated.canvas.edges, fixture.canvas?.edges)
  assert.deepEqual(migrated.taskQueue.tasks, fixture.taskQueue?.tasks)
})

test('normalizes missing legacy snapshot containers to empty arrays', () => {
  const migrated = migrateProjectSnapshot(readSnapshotFixture('v0-partial'))

  assert.equal(migrated.schemaVersion, CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION)
  assert.equal(migrated.canvas.nodes[0]?.id, 'text-partial')
  assert.deepEqual(migrated.canvas.edges, [])
  assert.deepEqual(migrated.taskQueue.tasks, [])
})

test('migrates both saved and working snapshots in workspace data', () => {
  const fixture = readSnapshotFixture('v0-unversioned')
  const data = migrateWorkspaceDataSnapshots({
    projects: [{
      id: 'project-1',
      name: 'Legacy project',
      savedSnapshot: fixture as never,
      workingSnapshot: fixture as never,
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
    }],
    activeProjectId: 'project-1',
    lastOpenedProjectId: 'project-1',
  })

  assert.equal(data.projects[0].savedSnapshot.schemaVersion, CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION)
  assert.equal(data.projects[0].workingSnapshot.schemaVersion, CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION)
})

test('rejects snapshots created by a newer application version', () => {
  assert.throws(
    () => migrateProjectSnapshot({
      schemaVersion: CURRENT_PROJECT_SNAPSHOT_SCHEMA_VERSION + 1,
      canvas: { nodes: [], edges: [] },
      taskQueue: { tasks: [] },
    }),
    /版本高于当前应用支持版本/,
  )
})
