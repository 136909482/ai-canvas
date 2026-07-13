export function getImportedImageNodeSize(naturalWidth: number, naturalHeight: number) {
  const aspectRatio = naturalWidth / naturalHeight
  const MAX_SIZE = 500
  const MIN_SIZE = 100
  let imgDisplayWidth: number
  let imgDisplayHeight: number

  if (naturalWidth >= naturalHeight) {
    imgDisplayWidth = MAX_SIZE
    imgDisplayHeight = MAX_SIZE / aspectRatio
  } else {
    imgDisplayHeight = MAX_SIZE
    imgDisplayWidth = MAX_SIZE * aspectRatio
  }

  if (imgDisplayWidth < MIN_SIZE) {
    imgDisplayWidth = MIN_SIZE
    imgDisplayHeight = MIN_SIZE / aspectRatio
  }
  if (imgDisplayHeight < MIN_SIZE) {
    imgDisplayHeight = MIN_SIZE
    imgDisplayWidth = MIN_SIZE * aspectRatio
  }

  return {
    width: Math.round(imgDisplayWidth + 12),
    height: Math.round(imgDisplayHeight + 12),
  }
}
