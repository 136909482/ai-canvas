import type { NodeProps } from '@xyflow/react'
import type { AppNode, AppNodeType } from '@/types'

type ComparableNodeProps<T extends AppNodeType> = NodeProps<AppNode<T>>

export function areNodeContentPropsEqual<T extends AppNodeType>(
  previous: ComparableNodeProps<T>,
  next: ComparableNodeProps<T>,
) {
  return (
    previous.id === next.id
    && previous.type === next.type
    && previous.data === next.data
    && previous.selected === next.selected
    && previous.dragging === next.dragging
    && previous.isConnectable === next.isConnectable
    && previous.sourcePosition === next.sourcePosition
    && previous.targetPosition === next.targetPosition
  )
}
