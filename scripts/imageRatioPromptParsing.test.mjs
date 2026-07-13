import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sharedSource = readFileSync(
  fileURLToPath(new URL('../src/api/image/shared.ts', import.meta.url)),
  'utf8',
)

if (!sharedSource.includes('const PROMPT_RATIO_PATTERN')) {
  throw new Error('prompt ratio parsing should support ratio-like text such as 2:5')
}

if (!sharedSource.includes('function normalizeRatioPair')) {
  throw new Error('prompt ratio parsing should normalize pixel dimensions such as 1024x1536 into ratios')
}

if (sharedSource.includes('SUPPORTED_IMAGE_RATIOS.map((ratio) => ratio.replace')) {
  throw new Error('prompt ratio parsing should not be limited to the predefined ratio list')
}

if (!sharedSource.includes('return normalizeRatioPair(width, height)')) {
  throw new Error('prompt ratio parsing should return the parsed prompt ratio')
}

const autoRatioResolverMatch = sharedSource.match(/export async function resolveEffectiveRatio[\s\S]*?\n}/)
const autoRatioResolver = autoRatioResolverMatch?.[0] ?? ''
const referenceRatioIndex = autoRatioResolver.indexOf('const primaryReferenceImageUrl')
const promptRatioIndex = autoRatioResolver.indexOf('const promptRatio = parseRatioFromPrompt(params.prompt)')

if (referenceRatioIndex < 0 || promptRatioIndex < 0 || referenceRatioIndex > promptRatioIndex) {
  throw new Error('image-to-image auto ratio should inspect the reference before parsing ratio-like prompt text')
}
