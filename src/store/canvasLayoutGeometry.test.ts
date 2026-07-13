import assert from 'node:assert/strict'
import test from 'node:test'
import type { Node, NodeChange } from '@xyflow/react'
import { applyVisualNodeChanges } from './canvasLayoutGeometry.ts'

function createNode(id: string, type: string, x: number, y: number, width: number, height: number): Node {
  return {
    id,
    type,
    position: { x, y },
    width,
    height,
    data: {},
  }
}

function moveGroup(groupId: string, x: number, y: number, dragging: boolean): NodeChange {
  return {
    id: groupId,
    type: 'position',
    position: { x, y },
    dragging,
  }
}

test('moves visual group members during every active drag frame', () => {
  const groupId = 'drag-frame-group'
  const nodes = [
    createNode(groupId, 'groupNode', 0, 0, 500, 400),
    createNode('member', 'textNode', 100, 100, 120, 80),
    createNode('outside', 'textNode', 600, 100, 120, 80),
  ]

  const firstFrame = applyVisualNodeChanges(nodes, [moveGroup(groupId, 40, 30, true)])
  assert.deepEqual(firstFrame.find((node) => node.id === 'member')?.position, { x: 140, y: 130 })
  assert.deepEqual(firstFrame.find((node) => node.id === 'outside')?.position, { x: 600, y: 100 })

  const secondFrame = applyVisualNodeChanges(firstFrame, [moveGroup(groupId, 75, 55, true)])
  assert.deepEqual(secondFrame.find((node) => node.id === 'member')?.position, { x: 175, y: 155 })

  const settled = applyVisualNodeChanges(secondFrame, [moveGroup(groupId, 75, 55, false)])
  assert.deepEqual(settled.find((node) => node.id === 'member')?.position, { x: 175, y: 155 })
})

test('applies queued group drag frames incrementally instead of duplicating the final delta', () => {
  const groupId = 'queued-frame-group'
  const nodes = [
    createNode(groupId, 'groupNode', 10, 10, 500, 400),
    createNode('queued-member', 'textNode', 100, 100, 120, 80),
  ]
  const changes = [
    moveGroup(groupId, 30, 20, true),
    moveGroup(groupId, 60, 40, true),
  ]

  const moved = applyVisualNodeChanges(nodes, changes)
  assert.deepEqual(moved.find((node) => node.id === groupId)?.position, { x: 60, y: 40 })
  assert.deepEqual(moved.find((node) => node.id === 'queued-member')?.position, { x: 150, y: 130 })

  applyVisualNodeChanges(moved, [moveGroup(groupId, 60, 40, false)])
})
