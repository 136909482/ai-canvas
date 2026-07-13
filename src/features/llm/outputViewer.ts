function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll('`', '&#96;')
}

function renderInline(markdown: string) {
  const codeParts: string[] = []
  const withoutCode = escapeHtml(markdown).replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `@@CODE_${codeParts.length}@@`
    codeParts.push(`<code>${code}</code>`)
    return token
  })

  const html = withoutCode
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, href: string) => (
      `<a href="${escapeAttribute(href)}">${label}</a>`
    ))

  return codeParts.reduce((nextHtml, codeHtml, index) => (
    nextHtml.replace(`@@CODE_${index}@@`, codeHtml)
  ), html)
}

function isFence(line: string) {
  return line.trimStart().startsWith('```')
}

function isHeading(line: string) {
  return /^#{1,6}\s+/.test(line)
}

function isListItem(line: string) {
  return /^\s*(?:[-*+]\s+|\d+\.\s+)/.test(line)
}

function renderList(lines: string[]) {
  const ordered = lines.every((line) => /^\s*\d+\.\s+/.test(line))
  const items = lines
    .map((line) => line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, ''))
    .map((line) => `<li>${renderInline(line)}</li>`)
    .join('')

  return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`
}

function renderParagraph(lines: string[]) {
  return `<p>${lines.map(renderInline).join('<br>')}</p>`
}

export function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    if (isFence(line)) {
      const language = line.trim().slice(3).trim()
      const codeLines: string[] = []
      index += 1

      while (index < lines.length && !isFence(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }

      if (index < lines.length) {
        index += 1
      }

      const languageClass = language ? ` class="language-${escapeAttribute(language)}"` : ''
      blocks.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    if (isHeading(line)) {
      const match = /^(#{1,6})\s+(.+)$/.exec(line)
      if (match) {
        blocks.push(`<h${match[1].length}>${renderInline(match[2])}</h${match[1].length}>`)
      }
      index += 1
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push(`<blockquote>${renderParagraph(quoteLines)}</blockquote>`)
      continue
    }

    if (isListItem(line)) {
      const listLines: string[] = []
      while (index < lines.length && isListItem(lines[index])) {
        listLines.push(lines[index])
        index += 1
      }
      blocks.push(renderList(listLines))
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length
      && lines[index].trim()
      && !isFence(lines[index])
      && !isHeading(lines[index])
      && !isListItem(lines[index])
      && !/^\s*>\s?/.test(lines[index])
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }
    blocks.push(renderParagraph(paragraphLines))
  }

  return blocks.join('')
}

export function formatJsonForDisplay(text: string) {
  try {
    return {
      text: JSON.stringify(JSON.parse(text), null, 2),
      valid: true,
    }
  } catch {
    return {
      text,
      valid: false,
    }
  }
}
