import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterEdgeDeletedGraph,
  filterEdgesDeletedBySourceTargetExceptHandleGraph,
  filterNodeDeletedGraph,
  filterSelectedElementsDeletedGraph,
} from '../src/store/canvasGraphDeletionFilters.ts'

const nodes = [
  { id: 'text-1', type: 'textNode', position: { x: 0, y: 0 }, data: {} },
  { id: 'gen-1', type: 'generateNode', position: { x: 100, y: 0 }, data: {} },
  { id: 'img-1', type: 'imageNode', position: { x: 200, y: 0 }, data: {} },
]

const edges = [
  { id: 'edge-text-gen', source: 'text-1', target: 'gen-1', targetHandle: 'prompt' },
  { id: 'edge-img-gen-base', source: 'img-1', target: 'gen-1', targetHandle: 'base' },
  { id: 'edge-img-gen-mask', source: 'img-1', target: 'gen-1', targetHandle: 'mask' },
]

test('removes a node and every edge touching it', () => {
  const result = filterNodeDeletedGraph(nodes, edges, 'img-1')

  assert.deepEqual(result.nodes.map((node) => node.id), ['text-1', 'gen-1'])
  assert.deepEqual(result.edges.map((edge) => edge.id), ['edge-text-gen'])
})

test('removes only the selected edge by id', () => {
  const result = filterEdgeDeletedGraph(nodes, edges, 'edge-img-gen-base')

  assert.deepEqual(result.nodes.map((node) => node.id), ['text-1', 'gen-1', 'img-1'])
  assert.deepEqual(result.edges.map((edge) => edge.id), ['edge-text-gen', 'edge-img-gen-mask'])
})

test('keeps the excluded handle while removing sibling source-target edges', () => {
  const result = filterEdgesDeletedBySourceTargetExceptHandleGraph(nodes, edges, 'img-1', 'gen-1', 'mask')

  assert.deepEqual(result.edges.map((edge) => edge.id), ['edge-text-gen', 'edge-img-gen-mask'])
})

test('returns null when deleting an empty selection', () => {
  assert.equal(filterSelectedElementsDeletedGraph(nodes, edges), null)
})

test('removes selected nodes and selected edges in one pass', () => {
  const result = filterSelectedElementsDeletedGraph(
    nodes.map((node) => ({ ...node, selected: node.id === 'text-1' })),
    edges.map((edge) => ({ ...edge, selected: edge.id === 'edge-img-gen-mask' })),
  )

  assert(result)
  assert.deepEqual(result.nodes.map((node) => node.id), ['gen-1', 'img-1'])
  assert.deepEqual(result.edges.map((edge) => edge.id), ['edge-img-gen-base'])
})
