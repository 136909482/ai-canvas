import { useEffect, useRef, type CSSProperties, type FocusEvent, type FormEvent, type SyntheticEvent, type WheelEvent } from 'react'
import { handleTextareaBlur, handleTextareaFocus } from '@/utils/textareaWheel'

type SharedTextEditorProps = {
  value: string
  placeholder: string
  rows?: number
  className?: string
  wrapperClassName?: string
  focusRequestKey?: number | string | null
  style?: CSSProperties
  onChange: (nextValue: string) => void
  onBeginTransaction?: () => void
  onCommitTransaction?: () => void
}

const BASE_WRAPPER_CLASS_NAME = 'min-h-0 h-full w-full overflow-hidden rounded-xl border border-transparent bg-transparent transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-violet-400/85 focus-within:shadow-[0_0_0_1px_rgba(167,139,250,0.26)]'
const BASE_TEXTAREA_CLASS_NAME = 'nowheel nodrag nopan min-h-0 h-full w-full resize-none overflow-y-auto overscroll-contain bg-transparent px-3 py-2.5 text-sm leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]'

export function SharedTextEditor({
  value,
  placeholder,
  rows = 4,
  className,
  wrapperClassName,
  focusRequestKey,
  style,
  onChange,
  onBeginTransaction,
  onCommitTransaction,
}: SharedTextEditorProps) {
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const lastCommittedValueRef = useRef(value)

  useEffect(() => {
    const textarea = textRef.current

    if (!textarea) {
      return
    }

    const isFocused = document.activeElement === textarea

    if (!isFocused && textarea.value !== value) {
      textarea.value = value
    }

    if (!isFocused) {
      lastCommittedValueRef.current = value
    }
  }, [value])

  useEffect(() => {
    if (focusRequestKey == null) {
      return
    }

    const textarea = textRef.current
    if (!textarea) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true })
      const cursorPosition = textarea.value.length
      textarea.setSelectionRange(cursorPosition, cursorPosition)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [focusRequestKey])

  const stopCanvasGesture = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const handleFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    stopCanvasGesture(event)
    handleTextareaFocus(event)
    lastCommittedValueRef.current = value
    onBeginTransaction?.()
  }

  const handleInput = (event: FormEvent<HTMLTextAreaElement>) => {
    onChange(event.currentTarget.value)
  }

  const handleBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    handleTextareaBlur(event)

    const committedValue = event.currentTarget.value

    onChange(committedValue)

    if (committedValue !== lastCommittedValueRef.current) {
      lastCommittedValueRef.current = committedValue
      onCommitTransaction?.()
      return
    }

    onCommitTransaction?.()
  }

  const handleWheel = (event: WheelEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget

    if (document.activeElement !== textarea) {
      return
    }

    const canScroll = textarea.scrollHeight > textarea.clientHeight
    if (!canScroll || event.deltaY === 0) {
      return
    }

    const maxScrollTop = textarea.scrollHeight - textarea.clientHeight
    const isScrollingDown = event.deltaY > 0
    const willScroll = isScrollingDown
      ? textarea.scrollTop < maxScrollTop
      : textarea.scrollTop > 0

    if (!willScroll) {
      return
    }

    event.stopPropagation()
  }

  return (
    <div className={wrapperClassName ? `${BASE_WRAPPER_CLASS_NAME} ${wrapperClassName}` : BASE_WRAPPER_CLASS_NAME}>
      <textarea
        ref={textRef}
        defaultValue={value}
        onFocus={handleFocus}
        onInput={handleInput}
        onBlur={handleBlur}
        onPointerDown={stopCanvasGesture}
        onMouseDown={stopCanvasGesture}
        onClick={stopCanvasGesture}
        onWheelCapture={handleWheel}
        placeholder={placeholder}
        rows={rows}
        className={className ? `${BASE_TEXTAREA_CLASS_NAME} ${className}` : BASE_TEXTAREA_CLASS_NAME}
        style={style}
      />
    </div>
  )
}
