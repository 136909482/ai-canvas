import {
  getAbandonedMentionTriggerRange,
  getImageMentionTriggerRange,
  getMenuPositionFromCaret,
  shouldDismissMentionMenuPointer,
} from './mentionTrigger.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function runMentionTriggerTests() {
  assert(getImageMentionTriggerRange({ cursorPosition: 4, textBeforeCursor: '画 @', readOnly: false })?.from === 3, 'range should start at typed @')
  assert(getImageMentionTriggerRange({ cursorPosition: 4, textBeforeCursor: '画 @', readOnly: false })?.to === 4, 'range should end at cursor')
  assert(getImageMentionTriggerRange({ cursorPosition: 4, textBeforeCursor: '画 @图', readOnly: false }) === null, 'range should close after typing query text')
  assert(getImageMentionTriggerRange({ cursorPosition: 4, textBeforeCursor: '画 @', readOnly: true }) === null, 'range should not open when editor is readonly')

  const position = getMenuPositionFromCaret({
    caret: { left: 120, top: 180, bottom: 204 },
    viewport: { width: 800, height: 600 },
  })

  assert(position.left === 128, 'menu left should be fixed near the viewport caret')
  assert(position.top === 176, 'menu top anchor should sit just above viewport caret')
  assert(position.placement === 'above', 'menu should open upward when there is enough room')

  const lowPosition = getMenuPositionFromCaret({
    caret: { left: 120, top: 20, bottom: 44 },
    viewport: { width: 800, height: 600 },
  })
  assert(lowPosition.top === 48, 'menu should open downward when caret is near the top edge')
  assert(lowPosition.placement === 'below', 'top-edge menu should use below placement')

  const abandonedRange = getAbandonedMentionTriggerRange({
    triggerRange: { from: 3, to: 4 },
    textInRange: '@',
  })
  assert(abandonedRange?.from === 3 && abandonedRange.to === 4, 'abandoned raw @ should be removable')
  assert(getAbandonedMentionTriggerRange({ triggerRange: { from: 3, to: 4 }, textInRange: 'x' }) === null, 'non-trigger text should not be removed')
  assert(shouldDismissMentionMenuPointer({ hasActiveMenu: true, clickedInsideMenu: false }), 'outside menu click should dismiss active menu')
  assert(!shouldDismissMentionMenuPointer({ hasActiveMenu: true, clickedInsideMenu: true }), 'inside menu click should keep active menu')
  assert(!shouldDismissMentionMenuPointer({ hasActiveMenu: false, clickedInsideMenu: false }), 'inactive menu should not dismiss')
}

runMentionTriggerTests()
