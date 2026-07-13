import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'

export function ImageMentionChip({ node }: NodeViewProps) {
  const attrs = node.attrs as {
    sourceNodeId: string
    label: string
    imageUrl: string
    thumbnailRelativePath?: string
  }

  return (
    <NodeViewWrapper
      as="span"
      data-mention-type="image"
      data-source-node-id={attrs.sourceNodeId}
      className="inline-flex max-w-[9rem] select-none items-center gap-1 rounded-full border border-[var(--accent-violet-muted)] bg-[var(--accent-violet-soft)] px-1.5 py-0.5 align-middle text-[11px] font-medium leading-none text-[var(--accent-violet-strong)]"
    >
      <span className="inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-[4px] border border-[var(--border-subtle)] bg-[var(--control-bg)]">
        <CanvasImagePreview
          src={attrs.imageUrl}
          alt=""
          imageAsset={attrs.thumbnailRelativePath ? { thumbnailRelativePath: attrs.thumbnailRelativePath } : null}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </span>
      <span className="truncate">{attrs.label}</span>
    </NodeViewWrapper>
  )
}
