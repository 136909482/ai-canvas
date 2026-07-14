import { loadImageDimensions } from '@/features/generateQueue/previewUtils'
import { writeWorkspaceImageAsset } from '@/features/imageAssets/runtime'
import { buildProjectAssetPath } from '@/features/projectManager/projectAssetPaths'
import { platformBridge } from '@/platform'
import type { WorkspaceImageAsset } from '@/types'
import { getImportedImageNodeSize } from './imageImportSizing'

export { getImportedImageNodeSize } from './imageImportSizing'

export type ImportedImageResult = {
  imageUrl: string
  imageAsset: WorkspaceImageAsset | null
  name: string
  naturalWidth: number
  naturalHeight: number
  width: number
  height: number
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('图片上传失败，请稍后重试'))
    }

    reader.onerror = () => {
      reject(reader.error ?? new Error('图片上传失败，请稍后重试'))
    }

    reader.readAsDataURL(file)
  })
}

export async function importImageFile(
  file: File,
  workspaceConfigured: boolean,
  projectId: string | null,
): Promise<ImportedImageResult> {
  const tempImageUrl = URL.createObjectURL(file)

  try {
    const { width: naturalWidth, height: naturalHeight } = await loadImageDimensions(tempImageUrl)
    const imageAsset = workspaceConfigured
      ? await writeWorkspaceImageAsset({
          pathSegments: buildProjectAssetPath(projectId, 'uploads'),
          fileName: file.name,
          blob: file,
          originalWidth: naturalWidth,
          originalHeight: naturalHeight,
        })
      : null
    const imageUrl = imageAsset
      ? await platformBridge.resolveWorkspaceAssetUrl(imageAsset.relativePath)
      : await readFileAsDataUrl(file)
    const size = getImportedImageNodeSize(naturalWidth, naturalHeight)

    return {
      imageUrl,
      imageAsset,
      name: file.name,
      naturalWidth,
      naturalHeight,
      width: size.width,
      height: size.height,
    }
  } finally {
    URL.revokeObjectURL(tempImageUrl)
  }
}
