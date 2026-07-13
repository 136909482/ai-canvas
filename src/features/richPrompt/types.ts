export type RichPromptTextNode = {
  type: 'text'
  text: string
}

export type RichPromptImageMentionAttrs = {
  sourceNodeId: string
  label: string
  imageUrl: string
  thumbnailRelativePath?: string
}

export type RichPromptImageMentionNode = {
  type: 'imageMention'
  attrs: RichPromptImageMentionAttrs
}

export type RichPromptParagraphNode = {
  type: 'paragraph'
  content?: Array<RichPromptTextNode | RichPromptImageMentionNode>
}

export type RichPromptDocument = {
  type: 'doc'
  content?: RichPromptParagraphNode[]
}

export type RichPromptReferenceItem = {
  sourceId: string
  imageUrl: string
  thumbnailRelativePath?: string
  label: string
  order: number
}
