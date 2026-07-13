type ModelBrandInput = {
  name?: string
  modelId?: string
  apiUrl?: string
}

export function isClaudeModel(model: ModelBrandInput) {
  const searchableText = [
    model.name,
    model.modelId,
    model.apiUrl,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return searchableText.includes('claude') || searchableText.includes('anthropic')
}
