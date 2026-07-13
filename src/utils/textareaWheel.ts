import type { FocusEvent, WheelEvent } from 'react'

export function handleTextareaFocus(event: FocusEvent<HTMLTextAreaElement>) {
  event.currentTarget.classList.add('nowheel')
}

export function handleTextareaBlur(event: FocusEvent<HTMLTextAreaElement>) {
  event.currentTarget.classList.remove('nowheel')
}

export function handleTextareaWheel(event: WheelEvent<HTMLTextAreaElement>) {
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
