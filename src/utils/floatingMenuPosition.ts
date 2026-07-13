interface FloatingMenuPositionOptions {
  clientX: number
  clientY: number
  menuWidth: number
  minMenuHeight: number
  viewportWidth: number
  viewportHeight: number
  margin: number
}

export function getFloatingMenuPosition({
  clientX,
  clientY,
  menuWidth,
  minMenuHeight,
  viewportWidth,
  viewportHeight,
  margin,
}: FloatingMenuPositionOptions) {
  return {
    left: Math.max(
      margin,
      Math.min(viewportWidth - menuWidth - margin, clientX + margin),
    ),
    top: Math.max(
      margin,
      Math.min(viewportHeight - minMenuHeight - margin, clientY + margin),
    ),
  }
}
