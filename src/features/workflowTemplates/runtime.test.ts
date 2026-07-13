import assert from 'node:assert/strict'
import test from 'node:test'
import type { Edge, Node } from '@xyflow/react'
import {
  captureSelectedWorkflowTemplate,
  createWorkflowTemplate,
  instantiateWorkflowTemplate,
  normalizeWorkflowTemplateLibrary,
} from './runtime.ts'

test('captures selected nodes, internal edges and normalized positions', () => {
  const nodes: Node[] = [
    { id: 'text-1', type: 'textNode', position: { x: 120, y: 80 }, data: { text: 'hello' }, selected: true },
    { id: 'gen-2', type: 'generateNode', position: { x: 420, y: 180 }, data: { connectedTextNode: 'text-1' }, selected: true },
    { id: 'img-3', type: 'imageNode', position: { x: 900, y: 80 }, data: {}, selected: false },
  ]
  const edges: Edge[] = [
    { id: 'inside', source: 'text-1', target: 'gen-2' },
    { id: 'outside', source: 'gen-2', target: 'img-3' },
  ]

  const draft = captureSelectedWorkflowTemplate(nodes, edges)
  assert.ok(draft)
  assert.deepEqual(draft.nodes.map((node) => node.position), [{ x: 0, y: 0 }, { x: 300, y: 100 }])
  assert.deepEqual(draft.edges.map((edge) => edge.id), ['inside'])
})

test('instantiates a template with new ids and remapped internal references', () => {
  const draft = captureSelectedWorkflowTemplate([
    { id: 'text-1', type: 'textNode', position: { x: 0, y: 0 }, data: {}, selected: true },
    { id: 'gen-2', type: 'generateNode', position: { x: 200, y: 40 }, data: { connectedTextNode: 'text-1', maskSourceNodeId: 'img-external' }, selected: true },
  ], [{ id: 'edge-1', source: 'text-1', target: 'gen-2', targetHandle: 'prompt' }])
  assert.ok(draft)
  const template = createWorkflowTemplate('Prompt to image', draft, 100, 'template-1')
  let nodeSequence = 1
  const instance = instantiateWorkflowTemplate(template, { x: 500, y: 300 }, (type) => `${type}-${nodeSequence++}`, () => 'edge-new')

  assert.ok(instance)
  assert.deepEqual(instance.nodeIds, ['textNode-1', 'generateNode-2'])
  assert.deepEqual(instance.nodes.map((node) => node.position), [{ x: 500, y: 300 }, { x: 700, y: 340 }])
  assert.equal(instance.nodes[1].data.connectedTextNode, 'textNode-1')
  assert.equal(instance.nodes[1].data.maskSourceNodeId, null)
  assert.deepEqual(instance.edges[0], {
    id: 'edge-new',
    source: 'textNode-1',
    target: 'generateNode-2',
    targetHandle: 'prompt',
    selected: false,
  })
})

test('normalizes missing or invalid template libraries to an empty versioned file', () => {
  assert.deepEqual(normalizeWorkflowTemplateLibrary(null), {
    type: 'ai-canvas-workflow-templates',
    version: 1,
    templates: [],
  })
})
