import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProjectRecord } from '../../types/index.ts'
import { extractProjectSearchDocuments, searchWorkspaceDocuments } from './runtime.ts'

function project(): ProjectRecord {
  const snapshot = {
    schemaVersion: 1,
    canvas: {
      nodes: [
        { id: 'text-1', type: 'textNode', position: { x: 0, y: 0 }, data: { label: '分镜', text: '雨夜里的霓虹街道' } },
        { id: 'image-2', type: 'imageNode', position: { x: 300, y: 0 }, data: { name: '城市参考图', tags: ['夜景'], resolution: '2048x2048', imageUrl: 'data:image/png;base64,secret', imageAsset: { relativePath: 'images/city.png' } } },
      ],
      edges: [],
    },
    taskQueue: { tasks: [] },
  }
  return { id: 'project-1', name: '赛博城市', savedSnapshot: snapshot, workingSnapshot: snapshot, createdAt: 1, updatedAt: 2, lastOpenedAt: 2 }
}

test('extracts project, text, and asset documents without embedded data urls', () => {
  const documents = extractProjectSearchDocuments(project())
  assert.deepEqual(documents.map((document) => document.kind), ['project', 'text', 'text', 'asset'])
  assert.equal(documents.some((document) => document.content.includes('data:image')), false)
  assert.equal(documents.find((document) => document.kind === 'asset')?.assetRelativePath, 'images/city.png')
})

test('searches Chinese substrings and combined keywords with stable relevance', () => {
  const documents = extractProjectSearchDocuments(project())
  assert.equal(searchWorkspaceDocuments(documents, { text: '霓虹街' })[0]?.nodeId, 'text-1')
  assert.equal(searchWorkspaceDocuments(documents, { text: '夜景 2048', kinds: ['asset'] })[0]?.nodeId, 'image-2')
  assert.equal(searchWorkspaceDocuments(documents, { text: '不存在' }).length, 0)
})
