const COMMON_IMAGE_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '2:1',
  '1:2',
  '3:1',
  '1:3',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '7:5',
  '5:7',
  '5:4',
  '4:5',
  '21:9',
  '9:21',
] as const

function getRatioValue(ratio: string) {
  const [ratioWidth, ratioHeight] = ratio.split(':').map(Number)
  return ratioWidth / ratioHeight
}

function formatApproximateImageRatio(width: number, height: number) {
  const actualRatio = width / height
  let bestRatio = '1:1'
  let bestDiff = Number.POSITIVE_INFINITY
  const maxPart = 32

  for (let ratioHeight = 1; ratioHeight <= maxPart; ratioHeight += 1) {
    const ratioWidth = Math.max(1, Math.min(maxPart, Math.round(actualRatio * ratioHeight)))
    const diff = Math.abs(ratioWidth / ratioHeight - actualRatio)

    if (diff < bestDiff) {
      bestRatio = `${ratioWidth}:${ratioHeight}`
      bestDiff = diff
    }
  }

  return bestRatio
}

export function formatReadableImageRatio(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return null
  }

  const actualRatio = width / height
  const closestCommonRatio = COMMON_IMAGE_RATIOS.reduce((closest, candidate) => {
    const candidateDiff = Math.abs(getRatioValue(candidate) - actualRatio)
    const closestDiff = Math.abs(getRatioValue(closest) - actualRatio)

    return candidateDiff < closestDiff ? candidate : closest
  }, COMMON_IMAGE_RATIOS[0])
  const commonRatio = getRatioValue(closestCommonRatio)

  if (Math.abs(commonRatio - actualRatio) / commonRatio <= 0.03) {
    return closestCommonRatio
  }

  return formatApproximateImageRatio(width, height)
}
