import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sharedSource = readFileSync(
  fileURLToPath(new URL('../src/api/image/shared.ts', import.meta.url)),
  'utf8',
)

if (!sharedSource.includes('function getPayloadExplicitErrorMessage')) {
  throw new Error('image payload parsing should detect explicit provider error payloads')
}

if (!sharedSource.includes('status_code')) {
  throw new Error('image payload parsing should detect MoleAPI-style status_code failures')
}

if (!sharedSource.includes('statusCode')) {
  throw new Error('image payload parsing should detect camelCase statusCode failures')
}

if (!sharedSource.includes('statusCode !== null && statusCode >= 400')) {
  throw new Error('image payload parsing should treat 4xx/5xx status codes in JSON as failures')
}

if (!sharedSource.includes('throw new Error(`Image API failed: ${explicitErrorMessage}`)')) {
  throw new Error('image result parsing should throw explicit provider errors before searching for image URLs')
}
