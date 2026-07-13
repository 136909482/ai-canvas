import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const orchestratorSource = readFileSync(
  fileURLToPath(new URL('../src/features/generateQueue/orchestrator.ts', import.meta.url)),
  'utf8',
)

const shouldUseAsyncMatch = orchestratorSource.match(/const shouldUseAsync = [\s\S]*?modelConfig\.asyncConfig\?\.enabled === true\)/)

if (!shouldUseAsyncMatch) {
  throw new Error('generate queue should keep an explicit shouldUseAsync guard')
}

const shouldUseAsyncSource = shouldUseAsyncMatch[0]

if (!shouldUseAsyncSource.includes("modelConfig.provider === 'openai'")) {
  throw new Error('async image generation should be limited to OpenAI compatible provider profiles')
}

if (shouldUseAsyncSource.includes("runningTask.operationType === 'text-to-image'")) {
  throw new Error('OpenAI compatible async image generation should allow provider-supported multipart edits')
}
