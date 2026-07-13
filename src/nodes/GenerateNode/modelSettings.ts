import type { GptImageQuality } from '@/types'

export const RATIOS = ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '1:4', '4:1', '1:8', '8:1']
export const RESOLUTIONS = ['1K', '2K', '4K']
export const GPT_IMAGE_QUALITIES = ['auto', 'low', 'medium', 'high'] as const
export const GPT_IMAGE_QUALITY_LABELS: Record<GptImageQuality, string> = {
  auto: '自动',
  low: '快速',
  medium: '均衡',
  high: '高质',
}

export function getRatioLabel(ratio: string) {
  return ratio === 'Auto' ? '自动' : ratio
}

export function getResolutionLabel(resolution: string) {
  return resolution
}
