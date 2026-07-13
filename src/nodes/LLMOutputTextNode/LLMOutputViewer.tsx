import { useEffect, useMemo, type SyntheticEvent, type WheelEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { LLMOutputFormat, LLMOutputNodeStatus } from '@/types'
import { formatJsonForDisplay, markdownToHtml } from '@/features/llm/outputViewer'

type LLMOutputViewerProps = {
  text: string
  outputFormat: LLMOutputFormat
  status: LLMOutputNodeStatus
}

const viewerFrameClassName = 'node-scrollbar nowheel nodrag nopan h-full w-full overflow-y-auto overscroll-contain px-3 py-2.5 text-sm leading-6 text-[var(--text-primary)]'
const richTextClassName = `${viewerFrameClassName}
  [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none
  [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:mt-0 [&_.ProseMirror_h1]:text-lg [&_.ProseMirror_h1]:font-semibold
  [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold
  [&_.ProseMirror_h3]:mb-1.5 [&_.ProseMirror_h3]:mt-3 [&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-semibold
  [&_.ProseMirror_p]:my-1.5 [&_.ProseMirror_p:first-child]:mt-0
  [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5
  [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5
  [&_.ProseMirror_li]:my-0.5
  [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--accent-violet-muted)] [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-[var(--text-secondary)]
  [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:border [&_.ProseMirror_code]:border-[var(--border-subtle)] [&_.ProseMirror_code]:bg-[var(--control-bg-hover)] [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-[12px]
  [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:border [&_.ProseMirror_pre]:border-[var(--border-subtle)] [&_.ProseMirror_pre]:bg-[color-mix(in_srgb,var(--control-bg-hover)_80%,black_8%)] [&_.ProseMirror_pre]:p-3
  [&_.ProseMirror_pre_code]:border-0 [&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_pre_code]:text-[12px]
  [&_.ProseMirror_a]:text-[var(--accent-violet-strong)] [&_.ProseMirror_a]:underline`

export function LLMOutputViewer({ text, outputFormat, status }: LLMOutputViewerProps) {
  const isDone = status === 'done'
  const jsonDisplay = useMemo(
    () => (outputFormat === 'json' && isDone ? formatJsonForDisplay(text) : null),
    [isDone, outputFormat, text],
  )
  const markdownHtml = useMemo(
    () => markdownToHtml(text || ' '),
    [text],
  )
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
      }),
    ],
    editable: false,
    content: markdownHtml,
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
    },
  })

  useEffect(() => {
    if (!editor || outputFormat !== 'markdown') {
      return
    }

    editor.commands.setContent(markdownHtml, { emitUpdate: false })
  }, [editor, markdownHtml, outputFormat])

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const handleWheelCapture = (event: WheelEvent<HTMLElement>) => {
    event.stopPropagation()
  }

  const sharedInteractionProps = {
    onPointerDown: stopCanvasGesture,
    onMouseDown: stopCanvasGesture,
    onClick: stopCanvasGesture,
    onWheelCapture: handleWheelCapture,
  }

  if (outputFormat === 'json') {
    const displayText = jsonDisplay?.text ?? text

    return (
      <pre
        {...sharedInteractionProps}
        className={`${viewerFrameClassName} select-text whitespace-pre-wrap break-words font-mono text-[12px] leading-5`}
      >
        {displayText}
      </pre>
    )
  }

  if (outputFormat === 'markdown') {
    return (
      <EditorContent
        editor={editor}
        {...sharedInteractionProps}
        className={`${richTextClassName} select-text [&_.ProseMirror]:select-text`}
      />
    )
  }

  return (
    <pre
      {...sharedInteractionProps}
      className={`${viewerFrameClassName} select-text whitespace-pre-wrap break-words font-sans`}
    >
      {text}
    </pre>
  )
}
