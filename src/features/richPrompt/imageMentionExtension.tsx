import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageMentionChip } from './ImageMentionChip'

export const ImageMentionExtension = Node.create({
  name: 'imageMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      sourceNodeId: { default: '' },
      label: { default: '图片' },
      imageUrl: { default: '' },
      thumbnailRelativePath: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-type="image"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-mention-type': 'image' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageMentionChip)
  },
})
