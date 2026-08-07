import { createServer } from 'net'
import { createServerComponent, FullHttpServerComponent, Router } from '@dcl/http-server'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { createMockConfigComponent } from '../../mocks/components/config'
import { createLogsMockedComponent } from '../../mocks/components'
import { resolveMaxRequestBodyBytes } from '../../../src/utils/requestBodyLimit'

const MAX_BODY_BYTES = 1024

type TestServerContext = Record<string, never>

/** Asks the OS for a port nothing is using, so the test cannot collide. */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

/**
 * The cap is enforced by the transport, before any route or schema runs, so this
 * drives a real listening server rather than a handler.
 */
describe('when the server is given a request body cap', () => {
  let server: FullHttpServerComponent<TestServerContext>
  let port: number
  let handler: jest.Mock

  beforeEach(async () => {
    port = await findFreePort()
    handler = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })

    server = await createServerComponent<TestServerContext>(
      {
        config: createMockConfigComponent({
          requireNumber: jest.fn().mockResolvedValue(port),
          requireString: jest.fn().mockResolvedValue('127.0.0.1')
        }),
        logs: createLogsMockedComponent()
      },
      { maxBodySize: resolveMaxRequestBodyBytes(MAX_BODY_BYTES) }
    )

    const router = new Router<TestServerContext>()
    router.post('/echo', handler)
    server.use(router.middleware())
    server.setContext({})

    await server[START_COMPONENT]!({ started: () => true, live: () => true, getComponents: () => ({}) })
  })

  afterEach(async () => {
    await server[STOP_COMPONENT]!()
  })

  describe('and a request body fits within the cap', () => {
    let response: Response
    let responseBody: string

    beforeEach(async () => {
      response = await fetch(`http://127.0.0.1:${port}/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'a'.repeat(100) })
      })
      // Drained so the socket is released instead of pinned by an unread body.
      responseBody = await response.text()
    })

    it('should reach the route', () => {
      expect(handler).toHaveBeenCalled()
    })

    it('should answer normally', () => {
      expect(response.status).toBe(200)
      expect(responseBody).toBe(JSON.stringify({ ok: true }))
    })
  })

  describe('and a request body exceeds the cap', () => {
    let response: Response

    beforeEach(async () => {
      response = await fetch(`http://127.0.0.1:${port}/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ padding: 'a'.repeat(MAX_BODY_BYTES * 2) })
      })
      // Drained so the socket is released instead of pinned by an unread body.
      await response.text()
    })

    it('should answer 413 Payload Too Large', () => {
      expect(response.status).toBe(413)
    })

    it('should never reach the route, so nothing parses the oversized body', () => {
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
