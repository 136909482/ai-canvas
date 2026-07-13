type RenderCountWindow = Window & {
  __AI_CANVAS_RENDER_COUNTS__?: Record<string, number>
}

export function recordComponentRender(name: string) {
  if (typeof window === 'undefined') {
    return
  }

  const counts = (window as RenderCountWindow).__AI_CANVAS_RENDER_COUNTS__
  if (!counts) {
    return
  }

  counts[name] = (counts[name] ?? 0) + 1
}
