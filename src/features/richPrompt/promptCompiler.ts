import type {
  RichPromptDocument,
  RichPromptImageMentionNode,
  RichPromptReferenceItem,
  RichPromptTextNode,
} from './types'

type RichPromptInlineNode = RichPromptTextNode | RichPromptImageMentionNode

function isImageMentionNode(node: RichPromptInlineNode): node is RichPromptImageMentionNode {
  return node.type === 'imageMention'
}

function getMentionToken(node: RichPromptImageMentionNode) {
  return `@${node.attrs.label}`.replace(/\s+/g, '')
}

export function hydrateRichPromptImageMentionUrls(
  document: RichPromptDocument | null | undefined,
  references: RichPromptReferenceItem[],
) {
  if (!document?.content?.length || references.length === 0) {
    return document ?? null
  }

  const imageUrlBySourceId = new Map(
    references.map((reference) => [reference.sourceId, reference.imageUrl]),
  )
  const thumbnailRelativePathBySourceId = new Map(
    references.map((reference) => [reference.sourceId, reference.thumbnailRelativePath ?? '']),
  )
  const labelBySourceId = new Map(
    references.map((reference) => [reference.sourceId, reference.label]),
  )
  let changed = false

  const content = document.content.map((paragraph) => {
    let paragraphChanged = false
    const nextContent = paragraph.content?.map((node) => {
      if (!isImageMentionNode(node)) {
        return node
      }

      const nextImageUrl = imageUrlBySourceId.get(node.attrs.sourceNodeId)
      const nextThumbnailRelativePath = thumbnailRelativePathBySourceId.get(node.attrs.sourceNodeId)
      const nextLabel = labelBySourceId.get(node.attrs.sourceNodeId)
      if (
        (!nextImageUrl || nextImageUrl === node.attrs.imageUrl)
        && (!nextThumbnailRelativePath || nextThumbnailRelativePath === node.attrs.thumbnailRelativePath)
        && (!nextLabel || nextLabel === node.attrs.label)
      ) {
        return node
      }

      paragraphChanged = true
      changed = true
      return {
        ...node,
        attrs: {
          ...node.attrs,
          imageUrl: nextImageUrl ?? node.attrs.imageUrl,
          thumbnailRelativePath: nextThumbnailRelativePath || node.attrs.thumbnailRelativePath,
          label: nextLabel ?? node.attrs.label,
        },
      }
    })

    return paragraphChanged ? { ...paragraph, content: nextContent } : paragraph
  })

  return changed ? { ...document, content } : document
}

export function richPromptToPlainText(document: RichPromptDocument | null | undefined) {
  if (!document?.content?.length) {
    return ''
  }

  return document.content
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => (isImageMentionNode(node) ? getMentionToken(node) : node.text))
        .join(''),
    )
    .join('\n')
    .trim()
}

export function createRichPromptDocumentFromText(text: string): RichPromptDocument {
  const lines = text.split('\n')

  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}

export function updateRichPromptDocumentText(
  document: RichPromptDocument | null | undefined,
  text: string,
) {
  if (!document) {
    return createRichPromptDocumentFromText(text)
  }

  return createRichPromptDocumentFromText(text)
}

export function collectMentionedSourceIds(document: RichPromptDocument | null | undefined) {
  const sourceIds = new Set<string>()

  for (const paragraph of document?.content ?? []) {
    for (const node of paragraph.content ?? []) {
      if (isImageMentionNode(node) && node.attrs.sourceNodeId) {
        sourceIds.add(node.attrs.sourceNodeId)
      }
    }
  }

  return sourceIds
}

export function compileImageMentionPrompt(input: {
  richPrompt: RichPromptDocument | null | undefined
  fallbackPrompt: string
  references: RichPromptReferenceItem[]
}) {
  const userPrompt = richPromptToPlainText(input.richPrompt) || input.fallbackPrompt.trim()
  const mentionedSourceIds = collectMentionedSourceIds(input.richPrompt)

  if (!userPrompt || mentionedSourceIds.size === 0) {
    return userPrompt
  }

  const mappingLines = input.references
    .filter((reference) => mentionedSourceIds.has(reference.sourceId))
    .map((reference) => `- @${reference.label} = reference image ${reference.order} = image_urls[${reference.order - 1}]`)

  if (mappingLines.length === 0) {
    return userPrompt
  }

  return [
    'Reference image mapping:',
    ...mappingLines,
    '',
    'User request:',
    userPrompt,
  ].join('\n')
}
