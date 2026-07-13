import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { ImageMentionExtension } from './imageMentionExtension'
import {
  getAbandonedMentionTriggerRange,
  getImageMentionTriggerRange,
  getMenuPositionFromCaret,
  shouldDismissMentionMenuPointer,
  type MentionMenuPosition,
  type MentionTriggerRange,
} from './mentionTrigger'
import { hydrateRichPromptImageMentionUrls, richPromptToPlainText } from './promptCompiler'
import type { RichPromptDocument, RichPromptReferenceItem } from './types'
import { CanvasImagePreview } from '@/components/CanvasImagePreview'
import { themeClasses } from '@/styles/themeClasses'

type RichPromptEditorProps = {
  value: RichPromptDocument | null | undefined
  fallbackText: string
  references: RichPromptReferenceItem[]
  placeholder: string
  readOnly: boolean
  minHeightClassName?: string
  onChange: (nextDocument: RichPromptDocument, nextText: string) => void
  onFocus?: () => void
  onBlur?: () => void
}

function createInitialContent(value: RichPromptDocument | null | undefined, fallbackText: string): RichPromptDocument {
  if (value?.type === 'doc') {
    return value
  }

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: fallbackText ? [{ type: 'text', text: fallbackText }] : [],
      },
    ],
  }
}

export function RichPromptEditor({
  value,
  fallbackText,
  references,
  placeholder,
  readOnly,
  minHeightClassName = 'min-h-[120px]',
  onChange,
  onFocus,
  onBlur,
}: RichPromptEditorProps) {
  const editorFrameRef = useRef<HTMLDivElement>(null)
  const mentionMenuRef = useRef<HTMLDivElement>(null)
  const [mentionMenu, setMentionMenu] = useState<{
    range: MentionTriggerRange
    position: MentionMenuPosition
  } | null>(null)
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
      ImageMentionExtension,
    ],
    [placeholder],
  )
  const content = useMemo(
    () => createInitialContent(hydrateRichPromptImageMentionUrls(value, references), fallbackText),
    [fallbackText, references, value],
  )
  const editor = useEditor({
    extensions,
    editable: !readOnly,
    content,
    editorProps: {
      attributes: {
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
      },
    },
    onUpdate: ({ editor }) => {
      const nextDocument = editor.getJSON() as RichPromptDocument
      onChange(nextDocument, richPromptToPlainText(nextDocument))
    },
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor || (editor.isFocused && !readOnly)) {
      return
    }

    editor.commands.setContent(content, { emitUpdate: false })
  }, [content, editor, readOnly])

  const clearAbandonedMentionTrigger = useCallback((menu = mentionMenu) => {
    if (!editor || !menu) {
      setMentionMenu(null)
      return
    }

    const abandonedRange = getAbandonedMentionTriggerRange({
      triggerRange: menu.range,
      textInRange: editor.state.doc.textBetween(menu.range.from, menu.range.to, '\n', '\0'),
    })

    if (abandonedRange) {
      editor.commands.deleteRange(abandonedRange)
    }

    setMentionMenu(null)
  }, [editor, mentionMenu])

  const updateMentionMenu = useCallback(() => {
    if (!editor || readOnly || references.length === 0 || !editor.state.selection.empty) {
      clearAbandonedMentionTrigger()
      return
    }

    const cursorPosition = editor.state.selection.from
    const triggerRange = getImageMentionTriggerRange({
      cursorPosition,
      textBeforeCursor: editor.state.doc.textBetween(0, cursorPosition, '\n', '\0'),
      readOnly,
    })

    if (!triggerRange) {
      clearAbandonedMentionTrigger()
      return
    }

    try {
      setMentionMenu({
        range: triggerRange,
        position: getMenuPositionFromCaret({
          caret: editor.view.coordsAtPos(cursorPosition),
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        }),
      })
    } catch {
      clearAbandonedMentionTrigger()
    }
  }, [clearAbandonedMentionTrigger, editor, readOnly, references.length])

  const insertMention = (reference: RichPromptReferenceItem) => {
    const chain = editor?.chain().focus()

    if (!chain) {
      return
    }

    if (mentionMenu) {
      chain.deleteRange(mentionMenu.range)
    }

    chain
      .focus()
      .insertContent({
        type: 'imageMention',
        attrs: {
          sourceNodeId: reference.sourceId,
          label: reference.label,
          imageUrl: reference.imageUrl,
          thumbnailRelativePath: reference.thumbnailRelativePath ?? '',
        },
      })
      .insertContent(' ')
      .run()
    setMentionMenu(null)
  }

  const handleWheelCapture = (event: WheelEvent<HTMLDivElement>) => {
    if (!editor?.isFocused) {
      return
    }

    event.stopPropagation()
  }

  useEffect(() => {
    if (!mentionMenu) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const clickedInsideMenu = event.target instanceof Node
        && Boolean(mentionMenuRef.current?.contains(event.target))

      if (shouldDismissMentionMenuPointer({ hasActiveMenu: true, clickedInsideMenu })) {
        clearAbandonedMentionTrigger(mentionMenu)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [clearAbandonedMentionTrigger, mentionMenu])

  return (
    <div ref={editorFrameRef} className="relative flex min-h-0 flex-1 cursor-text">
      <EditorContent
        editor={editor}
        onKeyUp={updateMentionMenu}
        onMouseUp={updateMentionMenu}
        onWheelCapture={handleWheelCapture}
        onBlur={() => clearAbandonedMentionTrigger()}
        className={`node-scrollbar nowheel h-full ${minHeightClassName} w-full cursor-text overflow-y-auto overscroll-contain rounded-lg px-3 py-2.5 text-sm leading-6 transition nodrag nopan ${themeClasses.nodeTextarea}
          [&_.ProseMirror]:min-h-full [&_.ProseMirror]:cursor-text [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-0
          [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0
          [&_.is-editor-empty:first-child::before]:pointer-events-none
          [&_.is-editor-empty:first-child::before]:text-[var(--text-muted)]
          [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]`}
      />

      {mentionMenu ? createPortal(
        <div
          ref={mentionMenuRef}
          className={`nodrag nopan fixed z-[1000] flex max-w-[12rem] flex-col gap-0.5 border border-[var(--accent-violet-muted)] bg-[color-mix(in_srgb,var(--panel-bg-strong)_92%,transparent)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.32),0_0_0_1px_rgba(139,92,246,0.08)] backdrop-blur-xl ${
            references.length === 1 ? 'rounded-full' : 'rounded-lg'
          }`}
          style={{
            left: mentionMenu.position.left,
            top: mentionMenu.position.top,
            transform: mentionMenu.position.placement === 'above' ? 'translateY(-100%)' : undefined,
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {references.map((reference) => (
            <button
              key={reference.sourceId}
              type="button"
              className="flex h-8 min-w-0 items-center gap-2 rounded-full px-1.5 pr-3 text-left text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--accent-violet-soft)] hover:text-[var(--text-primary)]"
              onClick={() => insertMention(reference)}
            >
              <CanvasImagePreview
                src={reference.imageUrl}
                alt=""
                imageAsset={reference.thumbnailRelativePath ? { thumbnailRelativePath: reference.thumbnailRelativePath } : null}
                className="h-6 w-6 shrink-0 rounded-[6px] border border-[var(--border-subtle)] object-cover shadow-[0_2px_8px_rgba(0,0,0,0.28)]"
                draggable={false}
              />
              <span className="truncate">{reference.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
