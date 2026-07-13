import { useEffect, type MutableRefObject } from 'react'
import { useCanvasStore } from '@/store/useCanvasStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import {
  getCanvasNodeIdFromTarget,
  getSelectedReactFlowNodeIdFromDom,
  isEditableTarget,
} from './canvasDomUtils'

interface CanvasKeyboardShortcutOptions {
  flushPendingNodeDragRef: MutableRefObject<(() => void) | null>
  lastPointerDownNodeIdRef: MutableRefObject<string | null>
}

function syncFallbackSelection(lastPointerDownNodeIdRef: MutableRefObject<string | null>) {
  const canvasState = useCanvasStore.getState()
  const selectedNodeCount = canvasState.nodes.reduce((count, node) => count + (node.selected ? 1 : 0), 0)
  const selectedNodeId = selectedNodeCount === 0
    ? getSelectedReactFlowNodeIdFromDom() ?? lastPointerDownNodeIdRef.current
    : null

  if (selectedNodeId) {
    canvasState.selectNode(selectedNodeId)
  }
}

export function useCanvasKeyboardShortcuts({
  flushPendingNodeDragRef,
  lastPointerDownNodeIdRef,
}: CanvasKeyboardShortcutOptions) {
  useEffect(() => {
    const handlePointerDownCapture = (event: PointerEvent) => {
      lastPointerDownNodeIdRef.current = getCanvasNodeIdFromTarget(event.target)
    }

    document.addEventListener('pointerdown', handlePointerDownCapture, true)
    return () => document.removeEventListener('pointerdown', handlePointerDownCapture, true)
  }, [lastPointerDownNodeIdRef])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isEditable = isEditableTarget(event.target)
      const isModifierPressed = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const historyState = useHistoryStore.getState()

      if (key === 'delete' && !isEditable) {
        flushPendingNodeDragRef.current?.()
        historyState.runTracked(useCanvasStore.getState().deleteSelectedElements)
        return
      }

      if (key === 'c' && !isModifierPressed && !isEditable) {
        flushPendingNodeDragRef.current?.()
        syncFallbackSelection(lastPointerDownNodeIdRef)

        const arranged = historyState.runTracked(() => useCanvasStore.getState().arrangeConnectedGraphFromSelection())
        if (arranged) {
          event.preventDefault()
        }
        return
      }

      if (!isModifierPressed || isEditable) {
        return
      }

      if (key === 'z' && event.shiftKey) {
        if (historyState.canRedo()) {
          event.preventDefault()
          historyState.redo()
        }
        return
      }

      if (key === 'z') {
        if (historyState.canUndo()) {
          event.preventDefault()
          historyState.undo()
        }
        return
      }

      if (key === 'y') {
        if (historyState.canRedo()) {
          event.preventDefault()
          historyState.redo()
        }
        return
      }

      if (key === 'd') {
        flushPendingNodeDragRef.current?.()
        const duplicatedNodeId = historyState.runTracked(() => useCanvasStore.getState().duplicateSelectedNode())
        if (duplicatedNodeId) {
          event.preventDefault()
        }
        return
      }

      if (key === 'c') {
        flushPendingNodeDragRef.current?.()
        const copiedNodeId = useCanvasStore.getState().copySelectedNode()
        if (copiedNodeId) {
          event.preventDefault()
        }
      }
    }

    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
        return
      }

      flushPendingNodeDragRef.current?.()
      syncFallbackSelection(lastPointerDownNodeIdRef)

      const canvasState = useCanvasStore.getState()
      const selectedNode = canvasState.nodes.find((node) => node.selected)
      if (!selectedNode) {
        return
      }

      const clipboardHasImage = Array.from(event.clipboardData?.items ?? []).some((item) => item.type.startsWith('image/'))
      const shouldPreserveImagePaste = selectedNode.type === 'imageNode'
        && !selectedNode.parentId
        && !selectedNode.data?.imageUrl
        && clipboardHasImage

      if (shouldPreserveImagePaste) {
        return
      }

      const pastedNodeId = useHistoryStore.getState().runTracked(() => {
        const latestCanvasState = useCanvasStore.getState()
        return latestCanvasState.pasteCopiedNode() ?? latestCanvasState.duplicateSelectedNode()
      })
      if (!pastedNodeId) {
        return
      }

      event.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('paste', handlePaste)
    }
  }, [flushPendingNodeDragRef, lastPointerDownNodeIdRef])
}
