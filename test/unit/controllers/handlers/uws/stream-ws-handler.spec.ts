import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { createStreamSessionsComponent } from '../../../../../src/adapters/stream-sessions'
import { createVoiceMockedComponent } from '../../../../mocks/components/voice'
import mitt from 'mitt'
import { verify } from '@dcl/crypto-middleware'
import { registerStreamWsHandler, STREAM_WS_PATH } from '../../../../../src/controllers/handlers/uws/stream-ws-handler'
import { StreamDefinition } from '../../../../../src/controllers/handlers/uws/stream-registry'
import { WsPoolFullError } from '../../../../../src/logic/ws-pool'
import { ISubscribersContext, WsNotAuthenticatedUserData, WsUserData } from '../../../../../src/types'
import emitterToAsyncGenerator, { MAX_VALUE_QUEUE_SIZE } from '../../../../../src/utils/emitterToGenerator'
import { mockConfig, mockFetcher, mockLogs, mockMetrics, mockUWs } from '../../../../mocks/components'
import { mockTracing } from '../../../../mocks/components/tracing'
import { createWsPoolMockedComponent } from '../../../../mocks/components/ws-pool'

jest.mock('@dcl/crypto-middleware', () => ({
  ...jest.requireActual('@dcl/crypto-middleware'),
  verify: jest.fn()
}))

const requestError = (message: string, statusCode: number) =>
  Object.assign(new Error(message), { name: 'RequestError', statusCode })

const AUTH_FRAME = Buffer.from(JSON.stringify({ 'x-identity-timestamp': '1' }))
const flush = () => new Promise((resolve) => setImmediate(resolve))

type Events = { blockUpdate: { address: string } }

describe('stream-ws-handler', () => {
  let sessions: Awaited<ReturnType<typeof createStreamSessionsComponent>>
  let handlers: any
  let ws: any
  let data: WsUserData
  let wsPool: ReturnType<typeof createWsPoolMockedComponent>
  let subscribersContext: jest.Mocked<ISubscribersContext>
  let emitter: ReturnType<typeof mitt<Events>>
  let generators: Array<{ destroy: jest.Mock; real: { destroy(): void } }>
  let streams: Record<string, StreamDefinition>
  let sent: any[]

  const lastSent = () => sent[sent.length - 1]
  const sentOfType = (type: string) => sent.filter((message) => message.type === type)

  const authenticate = async (address = '0xAbC0000000000000000000000000000000000001') => {
    ;(verify as jest.Mock).mockResolvedValueOnce({ auth: address, authMetadata: {} })
    await handlers.open(ws)
    await handlers.message(ws, AUTH_FRAME)
  }

  const send = async (message: unknown) => {
    await handlers.message(ws, Buffer.from(typeof message === 'string' ? message : JSON.stringify(message)))
  }

  beforeEach(async () => {
    sent = []
    generators = []
    emitter = mitt<Events>()
    data = {
      isConnected: false,
      auth: false,
      authenticating: false,
      wsConnectionId: 'conn-1'
    } as WsNotAuthenticatedUserData
    ws = {
      getUserData: jest.fn(() => data),
      send: jest.fn((payload: string) => {
        sent.push(JSON.parse(payload))
        return 1
      }),
      end: jest.fn()
    }
    wsPool = createWsPoolMockedComponent()
    subscribersContext = {
      addConnection: jest.fn(),
      removeConnection: jest.fn(),
      registerGenerator: jest.fn(),
      unregisterGenerator: jest.fn(),
      hasActiveSubscription: jest.fn(),
      setActiveSubscription: jest.fn(),
      clearActiveSubscription: jest.fn()
    } as unknown as jest.Mocked<ISubscribersContext>

    streams = {
      block_updates: {
        open: (context) => {
          const generator = emitterToAsyncGenerator(emitter, 'blockUpdate', context.onSubscriptionOverflow)
          const destroy = jest.fn(() => generator.destroy())
          context.subscribersContext.registerGenerator(context.wsConnectionId!, { destroy })
          generators.push({ destroy, real: generator })
          return generator
        }
      },
      failing_stream: {
        open: async function* () {
          throw new Error('boom')
        }
      },
      finite_stream: {
        open: async function* () {
          yield { n: 1 }
          yield { n: 2 }
        }
      }
    }

    mockConfig.getNumber.mockImplementation(
      async (key) => (({ WS_AUTH_TIMEOUT_IN_MS: 30000 }) as any)[key] ?? undefined
    )
    ;(mockUWs.app.ws as jest.Mock).mockClear()

    sessions = await createStreamSessionsComponent(
      {
        logs: mockLogs,
        metrics: mockMetrics,
        fetcher: mockFetcher,
        voice: createVoiceMockedComponent({}),
        config: mockConfig,
        tracing: mockTracing,
        wsPool,
        subscribersContext
      },
      streams
    )
    await registerStreamWsHandler({
      uwsServer: mockUWs,
      config: mockConfig,
      metrics: mockMetrics,
      streamSessions: sessions
    })

    handlers = (mockUWs.app.ws as jest.Mock).mock.calls[0][1]
  })

  afterEach(async () => {
    await sessions[STOP_COMPONENT]?.()
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  it('should register the socket on the stream path, not on the RPC one', () => {
    expect((mockUWs.app.ws as jest.Mock).mock.calls[0][0]).toBe(STREAM_WS_PATH)
    expect(STREAM_WS_PATH).not.toBe('/')
  })

  describe('when the subscription queue overflows', () => {
    beforeEach(async () => {
      await authenticate()
      await send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
      for (let index = 0; index < MAX_VALUE_QUEUE_SIZE + 2; index++) {
        emitter.emit('blockUpdate', { address: '0xblocker' })
      }
      await flush()
    })

    it('should close with an explicit resync requirement and remove the listener', () => {
      expect(ws.end).toHaveBeenCalledWith(1008, 'Subscription overflow; reconnect and resync')
      expect(emitter.all.get('blockUpdate') ?? []).toHaveLength(0)
      expect(data.isConnected).toBe(false)
    })

    it('should ignore further messages on the closing socket', async () => {
      await send({ type: 'ping' })
      expect(sentOfType('pong')).toHaveLength(0)
    })
  })

  describe('when enforcing the incoming message budget', () => {
    let now: number

    beforeEach(async () => {
      now = 0
      jest.spyOn(performance, 'now').mockImplementation(() => now)
      await authenticate()
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    describe('and the client exceeds the burst allowance', () => {
      beforeEach(async () => {
        for (let index = 0; index < 40; index++) await send({ type: 'ping' })
      })

      it('should close once without replying to the excess message', async () => {
        await send({ type: 'ping' })
        expect(ws.end).toHaveBeenCalledTimes(1)
        expect(ws.end).toHaveBeenCalledWith(1008, 'Message rate exceeded; reconnect with backoff')
        expect(sentOfType('pong')).toHaveLength(39)
      })
    })

    describe('and enough time passes to replenish a token', () => {
      beforeEach(async () => {
        for (let index = 0; index < 39; index++) await send({ type: 'ping' })
        now = 50
      })

      it('should allow the next message', async () => {
        await send({ type: 'ping' })
        expect(ws.end).not.toHaveBeenCalled()
        expect(sentOfType('pong')).toHaveLength(40)
      })
    })

    describe('and the client floods malformed messages', () => {
      it('should enforce the same budget', async () => {
        for (let index = 0; index < 40; index++) await send('invalid json')
        expect(ws.end).toHaveBeenCalledWith(1008, 'Message rate exceeded; reconnect with backoff')
      })
    })
  })

  describe('when the session component stops', () => {
    describe('and a connection has active subscriptions', () => {
      beforeEach(async () => {
        await authenticate()
        await send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
        await sessions[STOP_COMPONENT]?.()
      })

      it('should close the socket and release its subscription and pool slot', () => {
        expect(ws.end).toHaveBeenCalledWith(1001, 'Server shutting down')
        expect(emitter.all.get('blockUpdate') ?? []).toHaveLength(0)
        expect(wsPool.unregisterConnection).toHaveBeenCalledTimes(1)
      })

      it('should keep cleanup idempotent when the socket close callback follows shutdown', () => {
        handlers.close(ws, 1001)
        expect(subscribersContext.removeConnection).toHaveBeenCalledTimes(1)
        expect(wsPool.unregisterConnection).toHaveBeenCalledTimes(1)
      })
    })

    describe('and a connection is waiting for authentication', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        await handlers.open(ws)
        await sessions[STOP_COMPONENT]?.()
        jest.advanceTimersByTime(60000)
      })

      it('should clear its authentication timer', () => {
        expect(ws.end).toHaveBeenCalledTimes(1)
        expect(ws.end).toHaveBeenCalledWith(1001, 'Server shutting down')
      })
    })
  })

  describe('when upgrading a connection', () => {
    it('should start unauthenticated with a unique connection id', () => {
      const res = { upgrade: jest.fn() }
      const req = { getMethod: () => 'GET', getHeader: () => 'x' }

      handlers.upgrade(res, req, {})
      handlers.upgrade(res, req, {})

      const [first, second] = res.upgrade.mock.calls.map((call: any[]) => call[0])
      expect(first).toMatchObject({ isConnected: false, auth: false, authenticating: false })
      expect(first.wsConnectionId).not.toEqual(second.wsConnectionId)
    })
  })

  describe('when opening a connection', () => {
    it('should register it in the pool', async () => {
      await handlers.open(ws)

      expect(wsPool.registerConnection).toHaveBeenCalledWith(ws)
      expect(data.isConnected).toBe(true)
    })

    it('should close it with the auth timeout code when no auth chain arrives', async () => {
      jest.useFakeTimers()
      await handlers.open(ws)

      jest.advanceTimersByTime(30000)

      expect(ws.end).toHaveBeenCalledWith(3004, 'Authorization timeout')
    })

    describe('and the pool is full', () => {
      beforeEach(() => {
        wsPool.registerConnection.mockImplementation(() => {
          throw new WsPoolFullError(1)
        })
      })

      it('should close it with the try-again-later code', async () => {
        await handlers.open(ws)

        expect(ws.end).toHaveBeenCalledWith(1013, 'Unable to acquire connection')
      })
    })

    describe('and registering fails unexpectedly', () => {
      beforeEach(() => {
        wsPool.registerConnection.mockImplementation(() => {
          throw new Error('unexpected')
        })
      })

      it('should report it and close the connection', async () => {
        await handlers.open(ws)

        expect(mockTracing.captureException).toHaveBeenCalled()
        expect(ws.end).toHaveBeenCalledWith(1013, 'Unable to acquire connection')
      })
    })
  })

  describe('when authenticating', () => {
    describe('and the auth chain is valid', () => {
      beforeEach(async () => {
        await authenticate()
      })

      it('should answer ready', () => {
        expect(sent).toEqual([{ type: 'ready' }])
      })

      it('should register the normalized address for the fan-out', () => {
        expect(subscribersContext.addConnection).toHaveBeenCalledWith(
          '0xabc0000000000000000000000000000000000001',
          'conn-1'
        )
      })

      it('should clear the auth timeout', () => {
        jest.useFakeTimers()
        jest.advanceTimersByTime(60000)

        expect(ws.end).not.toHaveBeenCalled()
      })
    })

    describe('and the ready frame is dropped by the socket', () => {
      beforeEach(async () => {
        ws.send.mockReturnValueOnce(2)
        ws.end.mockImplementation((_code: number) => handlers.close(ws, 1008))
        await authenticate()
      })

      it('should detach the newly authenticated subscriber', () => {
        expect(subscribersContext.removeConnection).toHaveBeenCalledWith(
          '0xabc0000000000000000000000000000000000001',
          'conn-1'
        )
        expect(wsPool.unregisterConnection).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the frame is not valid JSON', () => {
      beforeEach(async () => {
        await handlers.open(ws)
        await send('not json')
      })

      it('should close with the unauthorized code without verifying anything', () => {
        expect(verify).not.toHaveBeenCalled()
        expect(ws.end).toHaveBeenCalledWith(3003, 'Unauthorized')
      })

      it('should count it as a client rejection', () => {
        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_auth_errors', { type: 'client_rejected' })
      })
    })

    describe('and the credentials are rejected', () => {
      beforeEach(async () => {
        ;(verify as jest.Mock).mockRejectedValueOnce(requestError('expired', 401))
        await handlers.open(ws)
        await handlers.message(ws, AUTH_FRAME)
      })

      it('should close with the unauthorized code and not report to tracing', () => {
        expect(ws.end).toHaveBeenCalledWith(3003, 'Unauthorized')
        expect(mockTracing.captureException).not.toHaveBeenCalled()
        expect(subscribersContext.addConnection).not.toHaveBeenCalled()
      })
    })

    describe('and the verification fails on our side', () => {
      beforeEach(async () => {
        ;(verify as jest.Mock).mockRejectedValueOnce(requestError('catalyst unreachable', 503))
        await handlers.open(ws)
        await handlers.message(ws, AUTH_FRAME)
      })

      it('should report it, count it as a server error and close', () => {
        expect(mockTracing.captureException).toHaveBeenCalled()
        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_auth_errors', { type: 'server_error' })
        expect(ws.end).toHaveBeenCalledWith(3003, 'Unauthorized')
      })
    })

    describe('and ending the socket throws because the client is already gone', () => {
      beforeEach(() => {
        ;(verify as jest.Mock).mockRejectedValueOnce(requestError('bad', 400))
        ws.end.mockImplementation(() => {
          throw new Error('closed')
        })
      })

      it('should not propagate the error', async () => {
        await handlers.open(ws)

        await expect(handlers.message(ws, AUTH_FRAME)).resolves.toBeUndefined()
      })
    })

    describe('and the socket closes while the signature is being verified', () => {
      beforeEach(async () => {
        let resolveVerify: (value: unknown) => void = () => undefined
        ;(verify as jest.Mock).mockReturnValueOnce(new Promise((resolve) => (resolveVerify = resolve)))
        await handlers.open(ws)
        const pending = handlers.message(ws, AUTH_FRAME)

        await handlers.close(ws, 1006, Buffer.from(''))
        resolveVerify({ auth: '0xabc0000000000000000000000000000000000001' })
        await pending
      })

      it('should not register the connection nor answer ready', () => {
        expect(subscribersContext.addConnection).not.toHaveBeenCalled()
        expect(sentOfType('ready')).toEqual([])
      })
    })

    describe('and a message arrives while the verification is in progress', () => {
      beforeEach(async () => {
        let resolveVerify: (value: unknown) => void = () => undefined
        ;(verify as jest.Mock).mockReturnValueOnce(new Promise((resolve) => (resolveVerify = resolve)))
        await handlers.open(ws)
        const pending = handlers.message(ws, AUTH_FRAME)

        await send({ type: 'ping' })
        resolveVerify({ auth: '0xabc0000000000000000000000000000000000001' })
        await pending
      })

      it('should answer with an auth_in_progress error and still complete the authentication', () => {
        expect(sentOfType('error')[0]).toMatchObject({ code: 'auth_in_progress' })
        expect(sentOfType('ready')).toHaveLength(1)
      })
    })
  })

  describe('when handling messages from an authenticated socket', () => {
    beforeEach(async () => {
      await authenticate()
      sent.length = 0
    })

    it('should answer ping with pong', async () => {
      await send({ type: 'ping' })

      expect(sent).toEqual([{ type: 'pong' }])
    })

    it.each(['nope', '[]', 'null', '123', '"str"'])('should answer %s with an invalid_message error', async (raw) => {
      await send(raw)

      expect(lastSent()).toMatchObject({ type: 'error', code: 'invalid_message' })
    })

    it('should answer an unknown type with an invalid_message error', async () => {
      await send({ type: 'unknown' })

      expect(lastSent()).toMatchObject({ type: 'error', code: 'invalid_message' })
    })

    describe('and subscribing', () => {
      it.each([
        [{ type: 'subscribe', stream: 'block_updates' }],
        [{ type: 'subscribe', id: '', stream: 'block_updates' }],
        [{ type: 'subscribe', id: 5, stream: 'block_updates' }],
        [{ type: 'subscribe', id: 'x'.repeat(65), stream: 'block_updates' }]
      ])('should reject an invalid id %j', async (message) => {
        await send(message)

        expect(lastSent()).toMatchObject({ type: 'error', code: 'invalid_message' })
      })

      it.each(['missing', '', '__proto__', 'constructor', 'toString'])(
        'should reject the stream "%s"',
        async (stream) => {
          await send({ type: 'subscribe', id: 'a', stream })

          expect(lastSent()).toMatchObject({ type: 'error', code: 'unknown_stream', id: 'a' })
        }
      )

      it('should reject a non-string stream', async () => {
        await send({ type: 'subscribe', id: 'a', stream: { a: 1 } })

        expect(lastSent()).toMatchObject({ type: 'error', code: 'unknown_stream' })
      })

      it('should acknowledge a valid subscription', async () => {
        await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })

        expect(sent[0]).toEqual({ type: 'subscribed', id: 'a' })
      })

      it('should reject a second subscription to the same stream', async () => {
        await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })
        await send({ type: 'subscribe', id: 'b', stream: 'block_updates' })

        expect(lastSent()).toMatchObject({ type: 'error', code: 'duplicate_subscription', id: 'b' })
        expect(generators).toHaveLength(1)
      })

      it('should reject reusing an id', async () => {
        await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })
        await send({ type: 'subscribe', id: 'a', stream: 'finite_stream' })

        expect(lastSent()).toMatchObject({ type: 'error', code: 'duplicate_subscription' })
      })

      it('should hand the stream the connection identity and a scoped subscribers context', async () => {
        const open = jest.spyOn(streams.block_updates, 'open')

        await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })

        expect(open).toHaveBeenCalledWith(
          expect.objectContaining({ address: '0xabc0000000000000000000000000000000000001', wsConnectionId: 'conn-1' })
        )
        expect(subscribersContext.registerGenerator).toHaveBeenCalledWith('conn-1', expect.any(Object))
      })
    })

    describe('and an update is emitted on a subscribed stream', () => {
      beforeEach(async () => {
        await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })
        sent.length = 0
      })

      it('should send the update with the subscription id and stream', async () => {
        emitter.emit('blockUpdate', { address: '0xblocker' })
        await flush()

        expect(sent).toEqual([{ type: 'event', id: 'a', stream: 'block_updates', data: { address: '0xblocker' } }])
        expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_updates_sent', { event: 'block_updates' })
      })

      it('should keep the order of consecutive updates', async () => {
        for (let i = 0; i < 5; i++) emitter.emit('blockUpdate', { address: `0x${i}` })
        await flush()

        expect(sentOfType('event').map((message) => message.data.address)).toEqual(['0x0', '0x1', '0x2', '0x3', '0x4'])
      })

      describe('and the client is not draining the socket', () => {
        beforeEach(() => {
          ws.send.mockReset()
          ws.send.mockImplementation(() => 2)
        })

        it('should end the connection as a slow consumer and stop sending', async () => {
          emitter.emit('blockUpdate', { address: '0x1' })
          await flush()
          emitter.emit('blockUpdate', { address: '0x2' })
          await flush()

          expect(ws.end).toHaveBeenCalledTimes(1)
          expect(ws.end).toHaveBeenCalledWith(1008, 'Slow consumer')
          expect(ws.send).toHaveBeenCalledTimes(1)
          expect(emitter.all.get('blockUpdate') ?? []).toHaveLength(0)
          expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_errors', { type: 'slow_consumer' })
        })
      })

      describe('and the socket was already closed by the client', () => {
        beforeEach(() => {
          ws.send.mockImplementation(() => {
            throw new Error('Invalid access of closed uWS.WebSocket')
          })
        })

        it('should stop the subscription without throwing', async () => {
          emitter.emit('blockUpdate', { address: '0x1' })
          await flush()

          expect(generators[0].destroy).not.toHaveBeenCalled()
          expect(sentOfType('event')).toEqual([])
        })
      })
    })

    describe('and unsubscribing', () => {
      beforeEach(async () => {
        await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })
        sent.length = 0
      })

      it('should destroy only that subscription and confirm the end', async () => {
        await send({ type: 'unsubscribe', id: 'a' })
        await flush()

        expect(generators[0].destroy).toHaveBeenCalledTimes(1)
        expect(sent).toEqual([{ type: 'end', id: 'a', reason: 'unsubscribed' }])
      })

      it('should stop delivering updates', async () => {
        await send({ type: 'unsubscribe', id: 'a' })
        await flush()
        sent.length = 0

        emitter.emit('blockUpdate', { address: '0x1' })
        await flush()

        expect(sent).toEqual([])
      })

      it('should allow subscribing to the same stream again', async () => {
        await send({ type: 'unsubscribe', id: 'a' })
        await flush()
        sent.length = 0

        await send({ type: 'subscribe', id: 'b', stream: 'block_updates' })

        expect(sent[0]).toEqual({ type: 'subscribed', id: 'b' })
      })

      it('should reject unsubscribing twice', async () => {
        await send({ type: 'unsubscribe', id: 'a' })
        await flush()
        await send({ type: 'unsubscribe', id: 'a' })

        expect(lastSent()).toMatchObject({ type: 'error', code: 'unknown_subscription' })
      })

      it('should reject an unknown or non-string id', async () => {
        await send({ type: 'unsubscribe', id: 'zzz' })
        expect(lastSent()).toMatchObject({ code: 'unknown_subscription', id: 'zzz' })

        await send({ type: 'unsubscribe', id: 42 })
        expect(lastSent()).toMatchObject({ code: 'unknown_subscription' })
        expect(lastSent().id).toBeUndefined()
      })
    })

    describe('and the stream completes by itself', () => {
      it('should send every update and then end with the completed reason', async () => {
        await send({ type: 'subscribe', id: 'f', stream: 'finite_stream' })
        await flush()

        expect(sent.map((message) => message.type)).toEqual(['subscribed', 'event', 'event', 'end'])
        expect(lastSent()).toEqual({ type: 'end', id: 'f', reason: 'completed' })
      })

      it('should let the client subscribe again afterwards', async () => {
        await send({ type: 'subscribe', id: 'f', stream: 'finite_stream' })
        await flush()
        sent.length = 0

        await send({ type: 'subscribe', id: 'g', stream: 'finite_stream' })

        expect(sent[0]).toEqual({ type: 'subscribed', id: 'g' })
      })
    })

    describe('and the stream throws', () => {
      beforeEach(async () => {
        await send({ type: 'subscribe', id: 'x', stream: 'failing_stream' })
        await flush()
      })

      it('should report a stream_error without leaking the cause', () => {
        const error = sentOfType('error')[0]

        expect(error).toMatchObject({ code: 'stream_error', id: 'x' })
        expect(JSON.stringify(error)).not.toContain('boom')
      })

      it('should keep the connection usable', async () => {
        await send({ type: 'ping' })

        expect(lastSent()).toEqual({ type: 'pong' })
        expect(ws.end).not.toHaveBeenCalled()
      })
    })
  })

  describe('when the connection closes', () => {
    describe('and it was authenticated with an active subscription', () => {
      beforeEach(async () => {
        await authenticate()
        await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })
        await handlers.close(ws, 1000, Buffer.from(''))
        await flush()
      })

      it('should detach the user from the fan-out with its connection id', () => {
        expect(subscribersContext.removeConnection).toHaveBeenCalledWith(
          '0xabc0000000000000000000000000000000000001',
          'conn-1'
        )
      })

      it('should destroy the subscription generators', () => {
        expect(generators[0].destroy).toHaveBeenCalled()
      })

      it('should release the pool slot and record the close code', () => {
        expect(wsPool.unregisterConnection).toHaveBeenCalledWith(data)
        expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_close_codes', { code: 1000 })
      })

      it('should not send anything to the closed socket', () => {
        sent.length = 0
        emitter.emit('blockUpdate', { address: '0x1' })

        expect(sent).toEqual([])
      })
    })

    describe('and it never authenticated', () => {
      beforeEach(async () => {
        await handlers.open(ws)
        await handlers.close(ws, 1006, Buffer.from(''))
      })

      it('should not detach any user but still release the pool slot', () => {
        expect(subscribersContext.removeConnection).not.toHaveBeenCalled()
        expect(wsPool.unregisterConnection).toHaveBeenCalled()
      })

      it('should cancel the auth timeout', () => {
        jest.useFakeTimers()
        jest.advanceTimersByTime(60000)

        expect(ws.end).not.toHaveBeenCalled()
      })
    })

    describe('and detaching the user throws', () => {
      beforeEach(async () => {
        await authenticate()
        subscribersContext.removeConnection.mockImplementationOnce(() => {
          throw new Error('detach failed')
        })
      })

      it('should still release the pool slot and report the error', async () => {
        await handlers.close(ws, 1000, Buffer.from(''))

        expect(mockTracing.captureException).toHaveBeenCalled()
        expect(wsPool.unregisterConnection).toHaveBeenCalled()
      })
    })

    describe('and it closes twice', () => {
      beforeEach(async () => {
        await authenticate()
      })

      it('should not throw', async () => {
        await handlers.close(ws, 1000, Buffer.from(''))

        expect(() => handlers.close(ws, 1000, Buffer.from(''))).not.toThrow()
      })
    })
  })
})
