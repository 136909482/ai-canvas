export const IMAGE_DENSE_MIN_COUNT = 4
const FRAME_BUDGET_EPSILON_MS = 0.01

export function getCanvasPerformanceBudget({ nodeCount = 0, imageCount = 0, gesture = 'drag' } = {}) {
  if (nodeCount >= 800) {
    return {
      name: 'large-canvas-800',
      averageFrameMs: 40,
      p95FrameMs: 40,
      maxFramesOver32: Number.POSITIVE_INFINITY,
      longTaskTotalMs: 120,
    }
  }

  if (nodeCount >= 300) {
    return {
      name: 'large-canvas-300',
      averageFrameMs: 24,
      p95FrameMs: 24,
      maxFramesOver32: Number.POSITIVE_INFINITY,
      longTaskTotalMs: 120,
    }
  }

  const isImageInteraction = imageCount >= IMAGE_DENSE_MIN_COUNT
    && ['drag', 'pan', 'select-pan', 'zoom'].includes(gesture)

  if (isImageInteraction) {
    return {
      name: 'image-dense-interaction',
      averageFrameMs: 17,
      p95FrameMs: 16.8,
      maxFramesOver32: 1,
      longTaskTotalMs: 120,
    }
  }

  return {
    name: 'default-interaction',
    averageFrameMs: 17,
    p95FrameMs: 32,
    maxFramesOver32: Number.POSITIVE_INFINITY,
    longTaskTotalMs: 120,
  }
}

export function evaluateCanvasPerformanceBudget(summary, budget) {
  const failures = []

  if (summary.averageFrameMs > budget.averageFrameMs + FRAME_BUDGET_EPSILON_MS) {
    failures.push(`average frame ${summary.averageFrameMs.toFixed(2)}ms > ${budget.averageFrameMs}ms`)
  }
  if (summary.p95FrameMs > budget.p95FrameMs + FRAME_BUDGET_EPSILON_MS) {
    failures.push(`p95 frame ${summary.p95FrameMs.toFixed(2)}ms > ${budget.p95FrameMs}ms`)
  }
  if (summary.framesOver32ms > budget.maxFramesOver32) {
    failures.push(`active frames over 32ms ${summary.framesOver32ms} > ${budget.maxFramesOver32}`)
  }
  if (summary.longTaskTotalMs > budget.longTaskTotalMs) {
    failures.push(`long task total ${summary.longTaskTotalMs.toFixed(2)}ms > ${budget.longTaskTotalMs}ms`)
  }
  if (summary.maxLowQualityPlaceholderCount > 0) {
    failures.push(`low-quality placeholders ${summary.maxLowQualityPlaceholderCount} > 0`)
  }

  return {
    passed: failures.length === 0,
    profile: budget,
    failures,
  }
}

export function validateCanvasPerformanceSample({
  gesture,
  zoomBefore,
  zoomAfter,
  zoomChanges,
  zoomFrom,
  zoomTo,
  panZoom,
  tolerance = 0.025,
}) {
  const failures = []

  if (!Number.isFinite(zoomBefore) || zoomBefore <= 0 || !Number.isFinite(zoomAfter) || zoomAfter <= 0) {
    failures.push('viewport zoom could not be measured')
  }

  if (gesture === 'zoom') {
    if (Math.abs(zoomBefore - zoomFrom) > tolerance) {
      failures.push(`zoom start ${zoomBefore.toFixed(3)} did not reach ${zoomFrom.toFixed(3)}`)
    }
    if (Math.abs(zoomAfter - zoomTo) > tolerance) {
      failures.push(`zoom end ${zoomAfter.toFixed(3)} did not reach ${zoomTo.toFixed(3)}`)
    }
    if (zoomChanges === 0) {
      failures.push('viewport zoom did not change during gesture')
    }
  }

  if (gesture === 'pan' || gesture === 'select-pan') {
    if (Math.abs(zoomBefore - panZoom) > tolerance) {
      failures.push(`pan zoom ${zoomBefore.toFixed(3)} did not reach ${panZoom.toFixed(3)}`)
    }
  }

  return {
    valid: failures.length === 0,
    failures,
  }
}
