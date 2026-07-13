import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const adapterSource = readFileSync(fileURLToPath(new URL('../src/api/imageAdapter.ts', import.meta.url)), 'utf8')
const openAiSource = readFileSync(fileURLToPath(new URL('../src/api/image/openai.ts', import.meta.url)), 'utf8')
const customAsyncSource = readFileSync(fileURLToPath(new URL('../src/api/image/customAsync.ts', import.meta.url)), 'utf8')
const aliyunSource = readFileSync(fileURLToPath(new URL('../src/api/image/aliyun.ts', import.meta.url)), 'utf8')
const testImageModelSource = readFileSync(fileURLToPath(new URL('../src/api/testImageModel.ts', import.meta.url)), 'utf8')
const constantsSource = readFileSync(fileURLToPath(new URL('../src/constants/generateNode.ts', import.meta.url)), 'utf8')
const settingsSource = readFileSync(fileURLToPath(new URL('../src/store/settingsConfig.ts', import.meta.url)), 'utf8')
const toolbarSettingsSource = readFileSync(fileURLToPath(new URL('../src/components/toolbar/settingsModel.ts', import.meta.url)), 'utf8')

function getGptImageGenerationPayloadBuilder() {
  const payloadBuilderMatch = openAiSource.match(/async function buildGptImageGenerationPayload[\s\S]*?return payload\n}/)

  if (!payloadBuilderMatch) {
    throw new Error('buildGptImageGenerationPayload should live in src/api/image/openai.ts')
  }

  return payloadBuilderMatch[0]
}

function getGptImageEditFormBuilder() {
  const formBuilderMatch = openAiSource.match(/async function buildGptImageEditFormData[\s\S]*?return formData\n}/)

  if (!formBuilderMatch) {
    throw new Error('buildGptImageEditFormData should live in src/api/image/openai.ts')
  }

  return formBuilderMatch[0]
}

function assertProviderRequestCodeIsSplit() {
  const requiredAdapterSnippets = [
    "from './image/openai'",
    "from './image/aliyun'",
  ]

  for (const snippet of requiredAdapterSnippets) {
    if (!adapterSource.includes(snippet)) {
      throw new Error(`imageAdapter facade should import provider code ${snippet}`)
    }
  }

  const forbiddenAdapterSnippets = [
    'async function buildGptImageGenerationPayload',
    'async function buildGptImageEditFormData',
    'async function generateWithOpenAI',
    'async function generateWithQwen',
    'QwenImagePayload',
    '/api/v1/services/aigc/multimodal-generation/generation',
  ]

  for (const snippet of forbiddenAdapterSnippets) {
    if (adapterSource.includes(snippet)) {
      throw new Error(`imageAdapter facade should not contain provider request implementation: ${snippet}`)
    }
  }

  if (!openAiSource.includes('generateWithOpenAI') || !openAiSource.includes('/v1/images/generations')) {
    throw new Error('OpenAI image request code should live in src/api/image/openai.ts')
  }

  if (!aliyunSource.includes('generateWithQwen') || !aliyunSource.includes('/api/v1/services/aigc/multimodal-generation/generation')) {
    throw new Error('Aliyun/Qwen image request code should live in src/api/image/aliyun.ts')
  }
}

function assertGptImage2PayloadPreservesConfiguredModel() {
  const payloadBuilder = getGptImageGenerationPayloadBuilder()
  const formBuilder = getGptImageEditFormBuilder()

  if (payloadBuilder.includes('model: GPT_IMAGE_2_MODEL')) {
    throw new Error('buildGptImage2Payload should preserve params.model instead of hardcoding gpt-image-2')
  }

  if (!payloadBuilder.includes('model: params.model')) {
    throw new Error('buildGptImage2Payload should send the configured model id')
  }

  if (!formBuilder.includes("appendStringFormField(formData, 'model', params.model)")) {
    throw new Error('gpt-image-2 edit form should send the configured model id')
  }
}

function assertGptImageOnlyAllowsConfiguredModelId() {
  const matcherSource = openAiSource.match(/export function isGptImageModel[\s\S]*?\n}/)?.[0] ?? ''

  if (!openAiSource.includes("const GPT_IMAGE_MODEL_ID = 'gpt-image-2'")) {
    throw new Error('OpenAI image adapter should define the configured gpt-image-2 model id')
  }

  if (!matcherSource.includes('=== GPT_IMAGE_MODEL_ID')) {
    throw new Error('OpenAI image adapter should only recognize the configured gpt-image-2 model id')
  }

  if (matcherSource.includes('startsWith') || matcherSource.includes('replace(/[^a-z0-9]/g')) {
    throw new Error('OpenAI image adapter should not accept guessed GPT image aliases')
  }

  if (!openAiSource.includes('function assertSupportedOpenAiImageModel')) {
    throw new Error('OpenAI image adapter should reject unsupported model ids before sending requests')
  }
}

function assertGptImage2DefaultsAreSentForConfiguredModel() {
  const payloadBuilder = getGptImageGenerationPayloadBuilder()
  const formBuilder = getGptImageEditFormBuilder()
  if (payloadBuilder.includes('isGptImage2OfficialModel')) {
    throw new Error('gpt-image-2 defaults should apply to the configured GPT image payload path')
  }

  const requiredSnippets = [
    'quality: normalizeGptImage2Quality(params.quality)',
    "moderation: 'low'",
    "output_format: 'png'",
  ]

  for (const snippet of requiredSnippets) {
    if (!payloadBuilder.includes(snippet)) {
      throw new Error(`gpt-image-2-official payload should include ${snippet}`)
    }
  }

  const requiredFormSnippets = [
    "appendStringFormField(formData, 'quality', normalizeGptImage2Quality(params.quality))",
    "appendStringFormField(formData, 'moderation', 'low')",
    "appendStringFormField(formData, 'output_format', 'png')",
  ]

  for (const snippet of requiredFormSnippets) {
    if (!formBuilder.includes(snippet)) {
      throw new Error(`gpt-image-2 edit form should include ${snippet}`)
    }
  }
}

function assertGptImage2QualityIsConfigurable() {
  const payloadBuilder = getGptImageGenerationPayloadBuilder()
  const formBuilder = getGptImageEditFormBuilder()

  if (!openAiSource.includes('function normalizeGptImage2Quality')) {
    throw new Error('gpt-image-2 quality should be normalized before being sent')
  }

  if (payloadBuilder.includes("quality: 'auto'")) {
    throw new Error('gpt-image-2 quality should come from request params, not be hardcoded to auto')
  }

  if (!payloadBuilder.includes('params.quality')) {
    throw new Error('gpt-image-2 payload should read quality from GenerateImageParams')
  }

  if (!formBuilder.includes('params.quality')) {
    throw new Error('gpt-image-2 edit form should read quality from GenerateImageParams')
  }
}

function assertGptImage2PayloadFollowsDocumentedSizeResolutionFields() {
  const payloadBuilder = getGptImageGenerationPayloadBuilder()
  const formBuilder = getGptImageEditFormBuilder()

  if (openAiSource.includes('GPT_IMAGE_2_OUTPUT_SIZE_PRESETS')) {
    throw new Error('gpt-image-2 payload should not infer undocumented pixel dimensions from preset tables')
  }

  if (!openAiSource.includes('return getGptImage2Size(effectiveRatio, params.resolution)')) {
    throw new Error('gpt-image-2 auto size should send the resolved prompt or reference ratio')
  }

  if (!openAiSource.includes('function ratioToGptImage2PixelSize')) {
    throw new Error('gpt-image-2 should convert unsupported prompt ratios like 2:5 into pixel sizes')
  }

  if (!openAiSource.includes('GPT_IMAGE_2_MIN_PIXELS')) {
    throw new Error('gpt-image-2 custom pixel sizes should respect the documented minimum output area')
  }

  const requiredSnippets = [
    'size,',
    'resolution: normalizeGptImage2Resolution(params.resolution)',
  ]

  for (const snippet of requiredSnippets) {
    if (!payloadBuilder.includes(snippet)) {
      throw new Error(`gpt-image-2 payload should include ${snippet}`)
    }
  }

  const requiredFormSnippets = [
    "appendStringFormField(formData, 'size', size)",
    "appendStringFormField(formData, 'resolution', normalizeGptImage2Resolution(params.resolution))",
  ]

  for (const snippet of requiredFormSnippets) {
    if (!formBuilder.includes(snippet)) {
      throw new Error(`gpt-image-2 edit form should include ${snippet}`)
    }
  }
}

function assertGeminiOpenAiCompatibleImageModelsUseGeminiPayload() {
  const payloadBuilder = getGptImageGenerationPayloadBuilder()
  const formBuilder = getGptImageEditFormBuilder()

  if (!openAiSource.includes("type OpenAiCompatibleImageRequestFamily = 'openai' | 'gemini'")) {
    throw new Error('OpenAI compatible image adapter should explicitly split OpenAI and Gemini parameter families')
  }

  if (!openAiSource.includes('function isGeminiImageModel')) {
    throw new Error('OpenAI compatible image adapter should recognize Gemini image model ids')
  }

  if (!openAiSource.includes('function resolveGeminiImageRequestSize')) {
    throw new Error('Gemini OpenAI-compatible image models should resolve size without GPT-only ratio names')
  }

  if (!openAiSource.includes('function normalizeGeminiImageResolution')) {
    throw new Error('Gemini OpenAI-compatible image models should send the documented resolution values')
  }

  if (!openAiSource.includes('function addGeminiImagePayloadFields')) {
    throw new Error('Gemini OpenAI-compatible generation payload should include Gemini-specific fields')
  }

  if (!openAiSource.includes('function addGeminiImageFormFields')) {
    throw new Error('Gemini OpenAI-compatible edit form data should include Gemini-specific fields')
  }

  if (!openAiSource.includes('function resolveOpenAiRequestSize')) {
    throw new Error('OpenAI image adapter should route size resolution by model family')
  }

  if (!payloadBuilder.includes("if (requestFamily === 'openai')")) {
    throw new Error('GPT-only generation fields should be gated to gpt-image-2')
  }

  if (!formBuilder.includes("if (requestFamily === 'openai')")) {
    throw new Error('GPT-only edit form fields should be gated to gpt-image-2')
  }

  const requiredGeminiSnippets = [
    'const imageSize = normalizeGeminiImageResolution(params.resolution)',
    'payload.resolution = imageSize',
    'payload.image_size = imageSize',
    'payload.image_config = imageConfig',
    'payload.aspect_ratio = size',
    "appendStringFormField(formData, 'resolution', imageSize)",
    "appendStringFormField(formData, 'image_size', imageSize)",
    "appendStringFormField(formData, 'image_config', JSON.stringify(imageConfig))",
    "appendStringFormField(formData, 'aspect_ratio', size)",
    'return normalizeSizePair(Number(matched[1]), Number(matched[2]))',
    'return normalizedRatio',
  ]

  for (const snippet of requiredGeminiSnippets) {
    if (!openAiSource.includes(snippet)) {
      throw new Error(`Gemini OpenAI-compatible image payload should include ${snippet}`)
    }
  }

  const geminiSizeResolver = openAiSource.match(/function resolveGeminiImageRequestSize[\s\S]*?\n}/)?.[0] ?? ''
  if (!geminiSizeResolver.includes('params.ratio')) {
    throw new Error('Gemini aspect ratio should honor the user-selected ratio when it is not Auto')
  }
  if (!openAiSource.includes('function hasGeminiAutoRatioReference')) {
    throw new Error('Gemini Auto aspect ratio should detect whether a reference image is present')
  }

  if (!geminiSizeResolver.includes('hasGeminiAutoRatioReference(params)') || !geminiSizeResolver.includes('? effectiveRatio') || !geminiSizeResolver.includes(": 'auto'")) {
    throw new Error('Gemini Auto aspect ratio should use the reference-derived ratio only when a reference image is present')
  }

  const geminiPayloadFields = openAiSource.match(/function addGeminiImagePayloadFields[\s\S]*?\n}/)?.[0] ?? ''
  const geminiFormFields = openAiSource.match(/function addGeminiImageFormFields[\s\S]*?\n}/)?.[0] ?? ''
  if (
    !geminiPayloadFields.includes('normalizeGeminiImageResolution(params.resolution)')
    || !geminiFormFields.includes('normalizeGeminiImageResolution(params.resolution)')
  ) {
    throw new Error('Gemini image_size should come from the user-selected resolution, not the reference-derived aspect ratio')
  }

  const forbiddenGeminiSnippets = [
    'official_fallback',
    'google_search',
    'google_image_search',
  ]

  for (const snippet of forbiddenGeminiSnippets) {
    if (openAiSource.includes(snippet)) {
      throw new Error(`Gemini OpenAI-compatible image payload should not send ${snippet}`)
    }
  }
}

function assertLegacyGptImageRequestPathsAreRemoved() {
  const forbiddenSnippets = [
    'isGptImage2Model',
    'supportsOpenAiInputFidelity',
    'supportsOpenAiResponseFormatParam',
    'buildOpenAiImageEditFormData',
    'shouldFallbackGptImage2EditToGeneration',
    'input_fidelity',
    'response_format',
  ]

  for (const snippet of forbiddenSnippets) {
    if (openAiSource.includes(snippet) || adapterSource.includes(snippet) || aliyunSource.includes(snippet)) {
      throw new Error(`legacy GPT image request path should be removed: ${snippet}`)
    }
  }

  const endpointResolverMatch = openAiSource.match(/function resolveOpenAiImageEndpointPath[\s\S]*?\n}/)
  if (
    !endpointResolverMatch?.[0].includes("'/v1/images/edits'")
    || !endpointResolverMatch?.[0].includes("'/v1/images/generations'")
  ) {
    throw new Error('GPT image requests should route text generation to generations and reference edits to edits')
  }
}

function assertGptImageEditFormSupportsMaskFile() {
  const formBuilder = getGptImageEditFormBuilder()
  if (formBuilder.includes('currently supports text-to-image and image-to-image only')) {
    throw new Error('gpt-image edit form should not reject mask edits')
  }

  if (!formBuilder.includes("formData.append('mask'")) {
    throw new Error('gpt-image edit form should upload a mask file for inpainting')
  }
}

function assertGptImageReferenceInputsUseMultipartEdits() {
  if (openAiSource.includes('/v1/uploads/images')) {
    throw new Error('GPT image reference inputs should not require the removed upload endpoint')
  }

  const payloadBuilder = getGptImageGenerationPayloadBuilder()
  if (payloadBuilder.includes('payload.image')) {
    throw new Error('OpenAI generations payload should not include reference images; references must use multipart edits')
  }

  const formBuilder = getGptImageEditFormBuilder()
  const requiredSnippets = [
    'convertReferenceImageToFile(imageUrl, index)',
    "formData.append(imageFieldName, imageFile)",
    "const imageFieldName = imageFiles.length > 1 ? 'image[]' : 'image'",
  ]

  for (const snippet of requiredSnippets) {
    if (!formBuilder.includes(snippet)) {
      throw new Error(`GPT image reference inputs should be uploaded as multipart edit images: ${snippet}`)
    }
  }

  if (openAiSource.includes('payload.image_urls')) {
    throw new Error('GPT image reference inputs should not be sent as generation image_urls')
  }
}

function assertGptImageSyncModeIsNotForcedAsync() {
  const generateMatch = openAiSource.match(/export async function generateWithOpenAI[\s\S]*?export async function submitOpenAiAsyncImageGeneration/)
  const generateSource = generateMatch?.[0] ?? ''

  if (!generateSource) {
    throw new Error('generateWithOpenAI should be present in OpenAI image adapter')
  }

  if (!generateSource.includes("params.requestMode === 'async'")) {
    throw new Error('generateWithOpenAI should use the configured request mode to enter async flow')
  }

  if (generateSource.includes('isGptImageModel(params.model)) {\n    const size = resolveGptImage2RequestSize')) {
    throw new Error('gpt-image compatible models should not be forced into async flow when the provider is configured as sync')
  }
}

function assertOpenAiCompatibleAsyncSupportsProviderTaskApi() {
  if (openAiSource.includes('IMAGE_EDIT_ASYNC_UNSUPPORTED_MESSAGE')) {
    throw new Error('OpenAI compatible async providers should be able to submit multipart image edits when configured')
  }

  if (!openAiSource.includes('buildGptImageEditFormData(params, size)')) {
    throw new Error('OpenAI compatible async submission should build multipart edit form data for reference-image tasks')
  }

  if (!openAiSource.includes('function resolveCustomAsyncConfigForRequest')) {
    throw new Error('OpenAI compatible async submission should resolve generation/edit submit paths per request')
  }

  if (!openAiSource.includes("submitPath: 'images/edits'")) {
    throw new Error('OpenAI compatible async image edits should submit to images/edits when using the default async config')
  }

  if (!customAsyncSource.includes('requestBody: BodyInit')) {
    throw new Error('custom async image submission should accept both JSON and FormData bodies')
  }

  if (!customAsyncSource.includes("headers.set('Content-Type', contentType)")) {
    throw new Error('custom async image submission should only set Content-Type when provided')
  }

  if (!customAsyncSource.includes("getByPath(payload, 'data')")) {
    throw new Error('custom async image submission should accept providers that return the task id as data')
  }

  if (!openAiSource.includes('getOpenAiCompatibleImageRequestFamily(params.model)')) {
    throw new Error('OpenAI compatible image models should be accepted by explicit parameter family')
  }
}

function assertModelConnectionTestRespectsProviderRequestMode() {
  if (!testImageModelSource.includes('requestMode: model.requestMode')) {
    throw new Error('image model connection test should respect the selected provider request mode')
  }

  if (testImageModelSource.includes("startsWith('gemini")) {
    throw new Error('Gemini image model connection tests should not force async mode')
  }
}

function assertDefaultProviderAsyncConfigMatchesImageTasksApi() {
  const requiredSnippets = [
    "submitQuery: { async: 'true' }",
    "taskIdPath: 'data'",
    "pollPath: 'images/tasks/{task_id}'",
    "statusPath: 'data.status'",
    "errorPath: 'data.fail_reason'",
    "data.data.data.*.url",
    "data.data.data.*.b64_json",
  ]

  for (const snippet of requiredSnippets) {
    if (!settingsSource.includes(snippet)) {
      throw new Error(`settings default async provider config should include ${snippet}`)
    }

    if (!toolbarSettingsSource.includes(snippet)) {
      throw new Error(`toolbar async provider config editor default should include ${snippet}`)
    }
  }
}

function assertReferenceImageLimitMatchesLatestProtocol() {
  if (!constantsSource.includes('MAX_GENERATE_REFERENCE_IMAGES = 16')) {
    throw new Error('GPT image reference limit should match the latest 16-image protocol')
  }
}

assertProviderRequestCodeIsSplit()
assertGptImage2PayloadPreservesConfiguredModel()
assertGptImageOnlyAllowsConfiguredModelId()
assertGptImage2DefaultsAreSentForConfiguredModel()
assertGptImage2QualityIsConfigurable()
assertGptImage2PayloadFollowsDocumentedSizeResolutionFields()
assertGeminiOpenAiCompatibleImageModelsUseGeminiPayload()
assertLegacyGptImageRequestPathsAreRemoved()
assertGptImageEditFormSupportsMaskFile()
assertGptImageReferenceInputsUseMultipartEdits()
assertGptImageSyncModeIsNotForcedAsync()
assertOpenAiCompatibleAsyncSupportsProviderTaskApi()
assertModelConnectionTestRespectsProviderRequestMode()
assertDefaultProviderAsyncConfigMatchesImageTasksApi()
assertReferenceImageLimitMatchesLatestProtocol()
