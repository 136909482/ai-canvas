import { useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Position, useNodeId, useStore, useStoreApi } from '@xyflow/react'

type ToolbarAlign = 'start' | 'center' | 'end'

type StableNodeToolbarProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: ReactNode
  nodeId?: string
  isVisible?: boolean
  position?: Position
  offset?: number
  align?: ToolbarAlign
}

function getAlignmentFactor(align: ToolbarAlign) {
  if (align === 'start') return 0
  if (align === 'end') return 1
  return 0.5
}

function getToolbarTransform(
  nodeRect: { x: number, y: number, width: number, height: number },
  viewport: { x: number, y: number, zoom: number },
  position: Position,
  offset: number,
  align: ToolbarAlign,
) {
  const alignment = getAlignmentFactor(align)
  let x = (nodeRect.x + nodeRect.width * alignment) * viewport.zoom + viewport.x
  let y = nodeRect.y * viewport.zoom + viewport.y - offset
  let shiftX = -100 * alignment
  let shiftY = -100

  if (position === Position.Right) {
    x = (nodeRect.x + nodeRect.width) * viewport.zoom + viewport.x + offset
    y = (nodeRect.y + nodeRect.height * alignment) * viewport.zoom + viewport.y
    shiftX = 0
    shiftY = -100 * alignment
  } else if (position === Position.Bottom) {
    y = (nodeRect.y + nodeRect.height) * viewport.zoom + viewport.y + offset
    shiftY = 0
  } else if (position === Position.Left) {
    x = nodeRect.x * viewport.zoom + viewport.x - offset
    y = (nodeRect.y + nodeRect.height * alignment) * viewport.zoom + viewport.y
    shiftX = -100
    shiftY = -100 * alignment
  }

  return `translate(${x}px, ${y}px) translate(${shiftX}%, ${shiftY}%)`
}

export function StableNodeToolbar({
  children,
  nodeId,
  isVisible,
  position = Position.Top,
  offset = 10,
  align = 'center',
  className,
  style,
  ...rest
}: StableNodeToolbarProps) {
  const contextNodeId = useNodeId()
  const effectiveNodeId = nodeId ?? contextNodeId
  const storeApi = useStoreApi()
  const selectedNodeCount = useStore((state) => {
    let count = 0
    for (const node of state.nodes) {
      if (node.selected) count += 1
    }
    return count
  })
  const portalRoot = useStore((state) => (
    state.domNode?.querySelector('.react-flow__renderer') as HTMLElement | null
  ))
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const positionSignatureRef = useRef('')
  const isActive = typeof isVisible === 'boolean' ? isVisible : selectedNodeCount === 1

  useLayoutEffect(() => {
    if (!isActive || !effectiveNodeId) {
      return
    }

    const updatePosition = () => {
      const toolbar = toolbarRef.current
      const state = storeApi.getState()
      const node = state.nodeLookup.get(effectiveNodeId)
      if (!toolbar || !node) {
        return
      }

      const x = node.internals.positionAbsolute.x
      const y = node.internals.positionAbsolute.y
      const width = node.measured.width ?? node.internals.userNode.width ?? 0
      const height = node.measured.height ?? node.internals.userNode.height ?? 0
      const [viewportX, viewportY, zoom] = state.transform
      const zIndex = node.internals.z + 1
      const signature = `${x}:${y}:${width}:${height}:${viewportX}:${viewportY}:${zoom}:${zIndex}:${position}:${offset}:${align}`
      if (positionSignatureRef.current === signature && toolbar.style.transform) {
        return
      }

      positionSignatureRef.current = signature
      toolbar.style.transform = getToolbarTransform(
        { x, y, width, height },
        { x: viewportX, y: viewportY, zoom },
        position,
        offset,
        align,
      )
      toolbar.style.zIndex = String(zIndex)
    }

    updatePosition()
    return storeApi.subscribe(updatePosition)
  }, [align, effectiveNodeId, isActive, offset, position, storeApi])

  if (!isActive || !effectiveNodeId || !portalRoot) {
    return null
  }

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    ...style,
  }

  return createPortal(
    <div
      ref={toolbarRef}
      style={wrapperStyle}
      className={`react-flow__node-toolbar ${className ?? ''}`}
      data-id={effectiveNodeId}
      {...rest}
    >
      {children}
    </div>,
    portalRoot,
  )
}
