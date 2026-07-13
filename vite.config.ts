import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'

function getOpenAiProxyTarget(request: IncomingMessage) {
  const requestUrl = new URL(request.url ?? '', 'http://localhost')
  const target = requestUrl.searchParams.get('target')

  if (!target) {
    throw new Error('Missing OpenAI proxy target')
  }

  const targetUrl = new URL(target)
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    throw new Error('Invalid OpenAI proxy target protocol')
  }

  return targetUrl
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function copyProxyResponseHeaders(response: Response, target: ServerResponse) {
  response.headers.forEach((value, key) => {
    if (key === 'transfer-encoding' || key === 'content-encoding') {
      return
    }

    target.setHeader(key, value)
  })
}

function createOpenAiProxyPlugin(): Plugin {
  return {
    name: 'openai-compatible-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api-proxy/openai', async (request, response) => {
        try {
          const targetUrl = getOpenAiProxyTarget(request)
          const headers = new Headers()

          for (const [key, value] of Object.entries(request.headers)) {
            if (!value || key === 'host' || key === 'connection' || key === 'content-length') {
              continue
            }

            headers.set(key, Array.isArray(value) ? value.join(', ') : value)
          }

          const method = request.method ?? 'GET'
          const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(request)
          const proxiedResponse = await fetch(targetUrl, {
            method,
            headers,
            body,
          })

          response.statusCode = proxiedResponse.status
          copyProxyResponseHeaders(proxiedResponse, response)
          response.end(Buffer.from(await proxiedResponse.arrayBuffer()))
        } catch (error) {
          response.statusCode = 502
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }))
        }
      })
    },
  }
}

export default defineConfig({
  clearScreen: false,
  plugins: [react(), tailwindcss(), createOpenAiProxyPlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    target: 'chrome120',
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (normalizedId.includes('/src/components/Toolbar.tsx')) {
            return 'app-toolbar'
          }

          if (!normalizedId.includes('node_modules')) {
            return undefined
          }

          if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/') || normalizedId.includes('/scheduler/')) {
            return 'vendor-react'
          }

          if (normalizedId.includes('/@xyflow/')) {
            return 'vendor-flow'
          }

          if (
            normalizedId.includes('/@tiptap/')
            || normalizedId.includes('/prosemirror-')
            || normalizedId.includes('/orderedmap/')
            || normalizedId.includes('/rope-sequence/')
          ) {
            return 'vendor-editor'
          }

          if (normalizedId.includes('/three/')) {
            return 'vendor-three'
          }

          if (normalizedId.includes('/@photo-sphere-viewer/')) {
            return 'vendor-panorama'
          }

          if (normalizedId.includes('/lucide-react/')) {
            return 'vendor-icons'
          }

          if (normalizedId.includes('/zustand/') || normalizedId.includes('/dexie/')) {
            return 'vendor-state'
          }

          return 'vendor'
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    watch: {
      ignored: ['**/electron/**', '**/release/**'],
    },
    proxy: {
      '/api-proxy/aliyun': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api-proxy\/aliyun/, ''),
      },
      '/api-proxy/aliyun-intl': {
        target: 'https://dashscope-intl.aliyuncs.com',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api-proxy\/aliyun-intl/, ''),
      },
      '/api-proxy/aliyun-us': {
        target: 'https://dashscope-us.aliyuncs.com',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api-proxy\/aliyun-us/, ''),
      },
    },
  },
})
