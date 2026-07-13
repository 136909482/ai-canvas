type StreamParseResult = {
  deltas: string[]
  done: boolean
}

function extractContentDelta(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices)) {
    return ''
  }

  return choices
    .map((choice) => {
      if (!choice || typeof choice !== 'object') {
        return ''
      }

      const deltaContent = (choice as { delta?: { content?: unknown } }).delta?.content
      if (typeof deltaContent === 'string') {
        return deltaContent
      }

      const messageContent = (choice as { message?: { content?: unknown } }).message?.content
      if (typeof messageContent === 'string') {
        return messageContent
      }

      const text = (choice as { text?: unknown }).text
      return typeof text === 'string' ? text : ''
    })
    .join('')
}

function parseEventData(eventText: string) {
  return eventText
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart())
    .join('\n')
    .trim()
}

export function createChatCompletionStreamParser() {
  let buffer = ''
  let streamDone = false

  return {
    push(chunk: string): StreamParseResult {
      if (streamDone) {
        return { deltas: [], done: true }
      }

      buffer += chunk
      const deltas: string[] = []

      while (true) {
        const separatorMatch = /\r?\n\r?\n/.exec(buffer)
        if (!separatorMatch?.index && separatorMatch?.index !== 0) {
          break
        }

        const eventText = buffer.slice(0, separatorMatch.index)
        buffer = buffer.slice(separatorMatch.index + separatorMatch[0].length)
        const data = parseEventData(eventText)

        if (!data) {
          continue
        }

        if (data === '[DONE]') {
          streamDone = true
          buffer = ''
          break
        }

        try {
          const delta = extractContentDelta(JSON.parse(data))
          if (delta) {
            deltas.push(delta)
          }
        } catch {
          // Keep malformed events from breaking providers that emit comments or partial metadata.
        }
      }

      return { deltas, done: streamDone }
    },
  }
}
