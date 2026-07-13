export function loadImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => reject(new Error('Failed to read generated image dimensions'))
    image.src = imageUrl
  })
}

export function getPreviewNodeSize(imageWidth: number, imageHeight: number) {
  const MIN_WIDTH = 260
  const MIN_HEIGHT = 200
  const MAX_WIDTH = 420
  const MAX_HEIGHT = 420
  const VERTICAL_PADDING = 12
  const HORIZONTAL_PADDING = 12

  const aspectRatio = imageWidth / imageHeight
  let contentWidth = Math.min(MAX_WIDTH - HORIZONTAL_PADDING, Math.max(MIN_WIDTH - HORIZONTAL_PADDING, imageWidth))
  let contentHeight = contentWidth / aspectRatio

  if (contentHeight > MAX_HEIGHT - VERTICAL_PADDING) {
    contentHeight = MAX_HEIGHT - VERTICAL_PADDING
    contentWidth = contentHeight * aspectRatio
  }

  return {
    width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, contentWidth + HORIZONTAL_PADDING))),
    height: Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, contentHeight + VERTICAL_PADDING))),
  }
}
