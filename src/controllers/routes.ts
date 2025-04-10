import {
  HttpRequest,
  HttpResponse,
  createMetricsHandler,
  onRequestEnd,
  onRequestStart
} from '@well-known-components/uws-http-server'
import { AppComponents, IHandler, TestComponents } from '../types'
import { createStatusHandler } from './handlers/status-handler'
import { registerWsHandler } from './handlers/ws-handler'
import { createPrivacyHandler } from './handlers/privacy-handler'

export async function setupRoutes(components: AppComponents | TestComponents): Promise<void> {
  const { metrics, server } = components

  function wrap(h: IHandler) {
    return async (res: HttpResponse, req: HttpRequest) => {
      const { labels, end } = onRequestStart(metrics, req.getMethod(), h.path)
      res.onAborted(() => {
        res.aborted = true
      })
      let status = 500
      try {
        const result = await h.f(res, req)

        status = result.status ?? 200
        if (!res.aborted) {
          res.writeStatus(`${status}`)
        }

        const headers = new Headers(result.headers ?? {})

        if (!headers.has('Access-Control-Allow-Origin')) {
          headers.set('Access-Control-Allow-Origin', '*')
        }

        headers.forEach((v, k) => !res.aborted && res.writeHeader(k, v))

        if (!res.aborted) {
          if (result.body === undefined) {
            res.end()
          } else if (typeof result.body === 'string') {
            res.end(result.body)
          } else {
            res.writeHeader('content-type', 'application/json')
            res.end(JSON.stringify(result.body))
          }
        }
      } catch (err) {
        if (!res.aborted) {
          res.writeStatus(`${status}`)
          res.end()
        }
      } finally {
        onRequestEnd(metrics, labels, status, end)
      }
    }
  }

  await registerWsHandler(components)

  {
    const handler = await createStatusHandler(components)
    server.app.get(handler.path, wrap(handler))
  }

  {
    const { path, handler } = await createMetricsHandler(components, metrics.registry!)
    server.app.get(path, handler)
  }

  const privacyHandler = await createPrivacyHandler(components)
  server.app.get(privacyHandler.path, wrap(privacyHandler))

  server.app.any('/health/live', (res, req) => {
    const { end, labels } = onRequestStart(metrics, req.getMethod(), '/health/live')
    res.writeStatus('200 OK')
    res.writeHeader('Access-Control-Allow-Origin', '*')
    res.end('alive')
    onRequestEnd(metrics, labels, 200, end)
  })

  server.app.any('/*', (res, req) => {
    const { end, labels } = onRequestStart(metrics, req.getMethod(), '')
    res.writeStatus('404 Not Found')
    res.writeHeader('Access-Control-Allow-Origin', '*')
    res.writeHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'Not Found' }))
    onRequestEnd(metrics, labels, 404, end)
  })
}
