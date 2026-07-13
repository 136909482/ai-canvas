export const ALIGNMENT_SNAP_THRESHOLD = 8
export const ALIGNMENT_GUIDE_NEAR_DISTANCE = 260
export const ALIGNMENT_GUIDE_PADDING = 28

export type AlignmentNode = {
  id: string
  hidden?: boolean
  position: { x: number; y: number }
  width?: number | null
  height?: number | null
  measured?: {
    width?: number | null
    height?: number | null
  }
}

export type NodeBox = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type AlignmentGuides = {
  vertical?: {
    x: number
    y1: number
    y2: number
  }
  horizontal?: {
    y: number
    x1: number
    x2: number
  }
}

export type AlignmentSnap = {
  guides: AlignmentGuides
  delta: { x: number; y: number }
}

export type ResizeAlignmentSnap = {
  guides: AlignmentGuides
  nextBox: NodeBox
}

export function getNodeBox(node: AlignmentNode): NodeBox {
  const width = node.measured?.width ?? node.width ?? 240
  const height = node.measured?.height ?? node.height ?? 160

  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  }
}

export function getBoundingBox(boxes: NodeBox[]): NodeBox | null {
  if (boxes.length === 0) {
    return null
  }

  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))

  return {
    id: 'selection',
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function getHorizontalAnchors(box: NodeBox) {
  return [box.y, box.y + box.height / 2, box.y + box.height]
}

function getVerticalAnchors(box: NodeBox) {
  return [box.x, box.x + box.width / 2, box.x + box.width]
}

function getBoxDistance(leftBox: NodeBox, rightBox: NodeBox) {
  const horizontalGap = Math.max(
    0,
    Math.max(leftBox.x, rightBox.x) - Math.min(leftBox.x + leftBox.width, rightBox.x + rightBox.width),
  )
  const verticalGap = Math.max(
    0,
    Math.max(leftBox.y, rightBox.y) - Math.min(leftBox.y + leftBox.height, rightBox.y + rightBox.height),
  )

  return Math.hypot(horizontalGap, verticalGap)
}

function moveBox(box: NodeBox, delta: { x: number; y: number }) {
  return {
    ...box,
    x: box.x + delta.x,
    y: box.y + delta.y,
  }
}

function getNearbyCandidateBoxes(activeBox: NodeBox, activeNodeIds: Set<string>, allNodes: AlignmentNode[]) {
  return allNodes
    .filter((node) => !activeNodeIds.has(node.id) && !node.hidden)
    .map(getNodeBox)
    .map((box) => ({ box, distance: getBoxDistance(activeBox, box) }))
    .filter(({ distance }) => distance <= ALIGNMENT_GUIDE_NEAR_DISTANCE)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 1)
    .map(({ box }) => box)
}

function buildAlignmentGuides(boxes: NodeBox[], verticalX?: number, horizontalY?: number): AlignmentGuides {
  const left = Math.min(...boxes.map((box) => box.x)) - ALIGNMENT_GUIDE_PADDING
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + ALIGNMENT_GUIDE_PADDING
  const top = Math.min(...boxes.map((box) => box.y)) - ALIGNMENT_GUIDE_PADDING
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + ALIGNMENT_GUIDE_PADDING

  return {
    ...(verticalX !== undefined ? { vertical: { x: verticalX, y1: top, y2: bottom } } : {}),
    ...(horizontalY !== undefined ? { horizontal: { y: horizontalY, x1: left, x2: right } } : {}),
  }
}

function hasChanged(left: number, right: number) {
  return Math.abs(left - right) > 0.001
}

function getResizeEdgeChanges(originalBox: NodeBox, resizedBox: NodeBox) {
  const originalRight = originalBox.x + originalBox.width
  const resizedRight = resizedBox.x + resizedBox.width
  const originalBottom = originalBox.y + originalBox.height
  const resizedBottom = resizedBox.y + resizedBox.height

  return {
    left: hasChanged(originalBox.x, resizedBox.x),
    right: hasChanged(originalRight, resizedRight),
    top: hasChanged(originalBox.y, resizedBox.y),
    bottom: hasChanged(originalBottom, resizedBottom),
  }
}

function getBestResizeMatch(
  resizedAnchor: number,
  candidateAnchor: number,
  currentMatch: { anchor: number; diff: number; delta: number } | null,
) {
  const delta = candidateAnchor - resizedAnchor
  const diff = Math.abs(delta)

  if (diff > ALIGNMENT_SNAP_THRESHOLD || (currentMatch && diff >= currentMatch.diff)) {
    return currentMatch
  }

  return { anchor: candidateAnchor, diff, delta }
}

export function getResizeAlignmentSnap(
  originalNode: AlignmentNode,
  resizedNode: AlignmentNode,
  allNodes: AlignmentNode[],
): ResizeAlignmentSnap {
  const originalBox = getNodeBox(originalNode)
  const resizedBox = getNodeBox(resizedNode)
  const candidateBoxes = getNearbyCandidateBoxes(resizedBox, new Set([resizedNode.id]), allNodes)

  if (candidateBoxes.length === 0) {
    return { guides: {}, nextBox: resizedBox }
  }

  const changedEdges = getResizeEdgeChanges(originalBox, resizedBox)
  const canSnapLeft = changedEdges.left && !changedEdges.right
  const canSnapRight = changedEdges.right && !changedEdges.left
  const canSnapTop = changedEdges.top && !changedEdges.bottom
  const canSnapBottom = changedEdges.bottom && !changedEdges.top
  let verticalMatch: { edge: 'left' | 'right'; anchor: number; diff: number; delta: number } | null = null
  let horizontalMatch: { edge: 'top' | 'bottom'; anchor: number; diff: number; delta: number } | null = null

  for (const candidateBox of candidateBoxes) {
    if (canSnapLeft) {
      const match = getBestResizeMatch(
        resizedBox.x,
        candidateBox.x,
        verticalMatch,
      )
      verticalMatch = match ? { ...match, edge: 'left' } : verticalMatch
    }

    if (canSnapRight) {
      const match = getBestResizeMatch(
        resizedBox.x + resizedBox.width,
        candidateBox.x + candidateBox.width,
        verticalMatch,
      )
      verticalMatch = match ? { ...match, edge: 'right' } : verticalMatch
    }

    if (canSnapTop) {
      const match = getBestResizeMatch(
        resizedBox.y,
        candidateBox.y,
        horizontalMatch,
      )
      horizontalMatch = match ? { ...match, edge: 'top' } : horizontalMatch
    }

    if (canSnapBottom) {
      const match = getBestResizeMatch(
        resizedBox.y + resizedBox.height,
        candidateBox.y + candidateBox.height,
        horizontalMatch,
      )
      horizontalMatch = match ? { ...match, edge: 'bottom' } : horizontalMatch
    }
  }

  if (!verticalMatch && !horizontalMatch) {
    return { guides: {}, nextBox: resizedBox }
  }

  const nextBox = { ...resizedBox }

  if (verticalMatch?.edge === 'left') {
    nextBox.x += verticalMatch.delta
    nextBox.width = Math.max(1, nextBox.width - verticalMatch.delta)
  }

  if (verticalMatch?.edge === 'right') {
    nextBox.width = Math.max(1, nextBox.width + verticalMatch.delta)
  }

  if (horizontalMatch?.edge === 'top') {
    nextBox.y += horizontalMatch.delta
    nextBox.height = Math.max(1, nextBox.height - horizontalMatch.delta)
  }

  if (horizontalMatch?.edge === 'bottom') {
    nextBox.height = Math.max(1, nextBox.height + horizontalMatch.delta)
  }

  return {
    nextBox,
    guides: buildAlignmentGuides(
      [...candidateBoxes, nextBox],
      verticalMatch?.anchor,
      horizontalMatch?.anchor,
    ),
  }
}

export function getAlignmentSnap(draggedNodes: AlignmentNode[], allNodes: AlignmentNode[]): AlignmentSnap {
  const draggedIds = new Set(draggedNodes.map((node) => node.id))
  const draggedBoxes = draggedNodes.map(getNodeBox)
  const draggedBox = getBoundingBox(draggedBoxes)

  if (!draggedBox) {
    return { guides: {}, delta: { x: 0, y: 0 } }
  }

  const candidateBoxes = getNearbyCandidateBoxes(draggedBox, draggedIds, allNodes)

  if (candidateBoxes.length === 0) {
    return { guides: {}, delta: { x: 0, y: 0 } }
  }

  let verticalMatch: { x: number; diff: number; delta: number } | null = null
  let horizontalMatch: { y: number; diff: number; delta: number } | null = null

  const draggedVerticalAnchors = getVerticalAnchors(draggedBox)
  const draggedHorizontalAnchors = getHorizontalAnchors(draggedBox)

  for (const candidateBox of candidateBoxes) {
    for (const [index, candidateX] of getVerticalAnchors(candidateBox).entries()) {
      const draggedX = draggedVerticalAnchors[index]
      const delta = candidateX - draggedX
      const diff = Math.abs(delta)
      if (diff <= ALIGNMENT_SNAP_THRESHOLD && (!verticalMatch || diff < verticalMatch.diff)) {
        verticalMatch = { x: candidateX, diff, delta }
      }
    }

    for (const [index, candidateY] of getHorizontalAnchors(candidateBox).entries()) {
      const draggedY = draggedHorizontalAnchors[index]
      const delta = candidateY - draggedY
      const diff = Math.abs(delta)
      if (diff <= ALIGNMENT_SNAP_THRESHOLD && (!horizontalMatch || diff < horizontalMatch.diff)) {
        horizontalMatch = { y: candidateY, diff, delta }
      }
    }
  }

  if (!verticalMatch && !horizontalMatch) {
    return { guides: {}, delta: { x: 0, y: 0 } }
  }

  const delta = {
    x: verticalMatch?.delta ?? 0,
    y: horizontalMatch?.delta ?? 0,
  }
  const snappedDraggedBox = moveBox(draggedBox, delta)
  return {
    delta,
    guides: buildAlignmentGuides(
      [...candidateBoxes, snappedDraggedBox],
      verticalMatch?.x,
      horizontalMatch?.y,
    ),
  }
}
