export type MentionTriggerRange = {
  from: number
  to: number
}

export type MentionMenuPosition = {
  left: number
  top: number
  placement: 'above' | 'below'
}

type TriggerRangeInput = {
  cursorPosition: number
  textBeforeCursor: string
  readOnly: boolean
}

type AbandonedTriggerInput = {
  triggerRange: MentionTriggerRange | null
  textInRange: string
}

type PointerDismissInput = {
  hasActiveMenu: boolean
  clickedInsideMenu: boolean
}

type CaretRect = Pick<DOMRect, 'left' | 'top' | 'bottom'>
type ViewportRect = {
  width: number
  height: number
}

const MENU_INLINE_OFFSET_PX = 8
const MENU_BLOCK_GAP_PX = 4
const MENU_EDGE_PADDING_PX = 8
const MENU_ESTIMATED_WIDTH_PX = 168

export function getImageMentionTriggerRange({ cursorPosition, textBeforeCursor, readOnly }: TriggerRangeInput): MentionTriggerRange | null {
  if (readOnly || !textBeforeCursor.endsWith('@')) {
    return null
  }

  return {
    from: cursorPosition - 1,
    to: cursorPosition,
  }
}

export function getAbandonedMentionTriggerRange({ triggerRange, textInRange }: AbandonedTriggerInput): MentionTriggerRange | null {
  if (!triggerRange || textInRange !== '@') {
    return null
  }

  return triggerRange
}

export function shouldDismissMentionMenuPointer({ hasActiveMenu, clickedInsideMenu }: PointerDismissInput) {
  return hasActiveMenu && !clickedInsideMenu
}

export function getMenuPositionFromCaret({ caret, viewport }: { caret: CaretRect; viewport: ViewportRect }): MentionMenuPosition {
  const hasRoomAbove = caret.top >= 56
  const left = Math.min(
    Math.max(MENU_EDGE_PADDING_PX, caret.left + MENU_INLINE_OFFSET_PX),
    Math.max(MENU_EDGE_PADDING_PX, viewport.width - MENU_ESTIMATED_WIDTH_PX - MENU_EDGE_PADDING_PX),
  )

  return {
    left,
    top: hasRoomAbove
      ? Math.max(MENU_EDGE_PADDING_PX, caret.top - MENU_BLOCK_GAP_PX)
      : Math.min(viewport.height - MENU_EDGE_PADDING_PX, caret.bottom + MENU_BLOCK_GAP_PX),
    placement: hasRoomAbove ? 'above' : 'below',
  }
}
