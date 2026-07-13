import type { DragEvent } from 'react'

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false
  }

  const element = target as HTMLElement
  const tagName = element?.tagName?.toLowerCase()
  return Boolean(
    element.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || element.closest('[contenteditable="true"], .ProseMirror'),
  )
}

export function getSelectedReactFlowNodeIdFromDom() {
  const selectedNode = document.querySelector('.react-flow__node.selected [data-testid^="node-"]')
  const testId = selectedNode?.getAttribute('data-testid')
  return testId?.startsWith('node-') ? testId.slice('node-'.length) : null
}

export function getCanvasNodeIdFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  const nodeElement = target.closest('[data-testid^="node-"]')
  const testId = nodeElement?.getAttribute('data-testid')
  return testId?.startsWith('node-') ? testId.slice('node-'.length) : null
}

export function getFirstImageFile(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return null
  }

  return Array.from(dataTransfer.files).find((file) => file.type.startsWith('image/')) ?? null
}

export function hasImageFileTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return false
  }

  return Array.from(dataTransfer.items).some((item) => item.kind === 'file' && item.type.startsWith('image/'))
    || Array.from(dataTransfer.files).some((file) => file.type.startsWith('image/'))
}

export function isCanvasEmptyDropTarget(target: DragEvent<HTMLDivElement>['target'] | EventTarget | null) {
  if (!(target instanceof Element)) {
    return false
  }

  return !target.closest('.react-flow__node, .react-flow__edge, .react-flow__panel, input, textarea, select, [contenteditable="true"], .ProseMirror')
}
