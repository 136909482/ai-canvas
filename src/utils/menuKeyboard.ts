export type MenuNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

export function getNextMenuIndex(key: MenuNavigationKey, currentIndex: number, itemCount: number) {
  if (itemCount <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return itemCount - 1
  if (key === 'ArrowDown') return (Math.max(-1, currentIndex) + 1) % itemCount
  return (currentIndex <= 0 ? itemCount : currentIndex) - 1
}

export function handleMenuKeyboard(
  event: Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopPropagation'>,
  menu: HTMLElement | null,
  onEscape: () => void,
) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onEscape()
    return true
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !menu) return false

  const items = Array.from(menu.querySelectorAll<HTMLElement>(
    '[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="option"]:not([disabled])',
  ))
  const currentIndex = items.indexOf(document.activeElement as HTMLElement)
  const nextIndex = getNextMenuIndex(event.key as MenuNavigationKey, currentIndex, items.length)
  if (nextIndex < 0) return false

  event.preventDefault()
  event.stopPropagation()
  items[nextIndex]?.focus()
  return true
}
