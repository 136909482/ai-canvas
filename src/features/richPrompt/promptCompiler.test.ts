import { createRichPromptDocumentFromText, richPromptToPlainText, updateRichPromptDocumentText } from './promptCompiler.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function runPromptCompilerTests() {
  const document = createRichPromptDocumentFromText('第一行\n第二行')

  assert(document.content?.length === 2, 'plain text should become one paragraph per line')
  assert(richPromptToPlainText(document) === '第一行\n第二行', 'plain text rich prompt should round-trip')

  const editedDocument = updateRichPromptDocumentText(document, '更新后的文本')
  assert(richPromptToPlainText(editedDocument) === '更新后的文本', 'text node rich prompts should accept plain text replacement')
}

runPromptCompilerTests()
