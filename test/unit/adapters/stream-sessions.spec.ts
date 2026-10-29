import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { createStreamSessionsComponent } from '../../../src/adapters/stream-sessions'
import { createVoiceMockedComponent } from '../../mocks/components/voice'
import mitt from 'mitt'
import { verify } from '@dcl/crypto-middleware'
import { registerStreamWsHandler, STREAM_WS_PATH } from '../../../src/controllers/handlers/uws/stream-ws-handler'
import { StreamDefinition } from '../../../src/types/subscriptions'
import { WsPoolFullError } from '../../../src/logic/ws-pool'
import { SubscriptionRateLimitedError } from '../../../src/logic/ws-admission'
import { createWsAdmissionMockedComponent } from '../../mocks/components/ws-admission'
import { ISubscribersContext, WsNotAuthenticatedUserData, WsUserData } from '../../../src/types'
import emitterToAsyncGenerator, { MAX_VALUE_QUEUE_SIZE } from '../../../src/utils/emitterToGenerator'
import { mockConfig, mockFetcher, mockLogs, mockMetrics, mockUWs } from '../../mocks/components'
import { mockTracing } from '../../mocks/components/tracing'
import { createWsPoolMockedComponent } from '../../mocks/components/ws-pool'

jest.mock('@dcl/crypto-middleware', () => ({
  ...jest.requireActual('@dcl/crypto-middleware'),
  verify: jest.fn()
}))

const requestError = (message: string, statusCode: number) =>
  Object.assign(new Error(message), { name: 'RequestError', statusCode })

const AUTH_FRAME = Buffer.from(JSON.stringify({ 'x-identity-timestamp': '1' }))
const flush = () => new Promise((resolve) => setImmediate(resolve))

type Events = { blockUpdate: { address: string } }

describe('when handling stream WebSocket sessions', () => {
  let sessions: Awaited<ReturnType<typeof createStreamSessionsComponent>>
  let handlers: any
  let ws: any
  let data: WsUserData
  let wsPool: ReturnType<typeof createWsPoolMockedComponent>
  let wsAdmission: ReturnType<typeof createWsAdmissionMockedComponent>
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
    ;(verify as jest.Mock).mockReset()
    generators = []
    emitter = mitt<Events>()
    data = {
      isConnected: false,
      auth: false,
      authenticating: false,
      wsConnectionId: 'conn-1',
      protocol: 'stream'
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
    wsAdmission = createWsAdmissionMockedComponent()
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
        wsAdmission,
        subscribersContext
      },
      streams
    )
    await registerStreamWsHandler({
      logs: mockLogs,
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

    describe('and the client keeps sending on the closing socket', () => {
      beforeEach(async () => {
        await send({ type: 'ping' })
      })

      it('should ignore further messages', () => {
        expect(sentOfType('pong')).toHaveLength(0)
      })
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
        await send({ type: 'ping' })
      })

      it('should close once without replying to the excess message', () => {
        expect(ws.end).toHaveBeenCalledTimes(1)
        expect(ws.end).toHaveBeenCalledWith(1008, 'Message rate exceeded; reconnect with backoff')
        expect(sentOfType('pong')).toHaveLength(39)
      })
    })

    describe('and enough time passes to replenish a token', () => {
      beforeEach(async () => {
        for (let index = 0; index < 39; index++) await send({ type: 'ping' })
        now = 50
        await send({ type: 'ping' })
      })

      it('should allow the next message', () => {
        expect(ws.end).not.toHaveBeenCalled()
        expect(sentOfType('pong')).toHaveLength(40)
      })
    })

    describe('and the client floods malformed messages', () => {
      beforeEach(async () => {
        for (let index = 0; index < 40; index++) await send('invalid json')
      })

      it('should enforce the same budget', () => {
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

      describe('and the socket close callback follows shutdown', () => {
        beforeEach(() => {
          handlers.close(ws, 1001)
        })

        it('should keep cleanup idempotent', () => {
          expect(subscribersContext.removeConnection).toHaveBeenCalledTimes(1)
          expect(wsPool.unregisterConnection).toHaveBeenCalledTimes(1)
        })
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

  describe('when unsubscribing during a pending snapshot', () => {
    let resolveFirst: (value: { n: number }) => void
    let resolveSecond: (value: { n: number }) => void
    let opens: number

    beforeEach(async () => {
      opens = 0
      streams.delayed_snapshot = {
        open: async function* (context) {
          context.subscribersContext.setActiveSubscription('conn-1', 'snapshot')
          opens += 1
          try {
            yield await new Promise<{ n: number }>((resolve) => {
              if (opens === 1) resolveFirst = resolve
              else resolveSecond = resolve
            })
          } finally {
            context.subscribersContext.clearActiveSubscription('conn-1', 'snapshot')
          }
        }
      }
      await authenticate()
      await send({ type: 'subscribe', id: 'same', stream: 'delayed_snapshot' })
      await send({ type: 'unsubscribe', id: 'same' })
      await send({ type: 'subscribe', id: 'same', stream: 'delayed_snapshot' })
      resolveFirst({ n: 1 })
      await flush()
    })

    afterEach(async () => {
      resolveSecond({ n: 2 })
      await flush()
    })

    it('should acknowledge cancellation immediately and allow reusing the id', () => {
      expect(sentOfType('subscribed')).toHaveLength(2)
      expect(sentOfType('end')).toEqual([{ type: 'end', id: 'same', reason: 'unsubscribed' }])
      expect(sentOfType('event')).toEqual([])
    })

    it('should not let the cancelled generator clear the replacement subscription', () => {
      expect(subscribersContext.clearActiveSubscription).toHaveBeenCalledTimes(1)
    })

    describe('and the client subscribes to the same stream again', () => {
      beforeEach(async () => {
        await send({ type: 'subscribe', id: 'other', stream: 'delayed_snapshot' })
      })

      it('should still track the replacement subscription', () => {
        expect(lastSent()).toMatchObject({ code: 'duplicate_subscription' })
      })
    })
  })

  describe('when a snapshot is buffered by the socket', () => {
    beforeEach(async () => {
      await authenticate()
      ws.getBufferedAmount = jest.fn().mockReturnValue(0)
      // The acknowledgement succeeds; the first snapshot event is buffered, not dropped.
      ws.send.mockReturnValueOnce(1).mockImplementationOnce((payload: string) => {
        sent.push(JSON.parse(payload))
        return 0
      })
      await send({ type: 'subscribe', id: 'finite', stream: 'finite_stream' })
      await flush()
    })

    it('should pause event delivery until the socket drains', () => {
      expect(sentOfType('event').map((event) => event.data.n)).toEqual([1])
    })

    describe('and the socket drains', () => {
      beforeEach(async () => {
        handlers.drain(ws)
        await flush()
      })

      it('should resume delivery without duplicating the buffered event', () => {
        expect(sentOfType('event').map((event) => event.data.n)).toEqual([1, 2])
        expect(ws.end).not.toHaveBeenCalled()
      })
    })
  })

  describe.each([0, 65, 16384])('when an unsubscribe id has invalid length %s', (length) => {
    beforeEach(async () => {
      await authenticate()
      await send({ type: 'unsubscribe', id: 'x'.repeat(length) })
    })

    it('should reject the id without reflecting it', () => {
      expect(lastSent()).toMatchObject({ type: 'error', code: 'unknown_subscription' })
      expect(lastSent().id).toBeUndefined()
    })
  })

  describe('when a client authenticates', () => {
    beforeEach(async () => {
      await authenticate()
    })

    it('should verify a chain signed for the stream path', () => {
      expect(verify).toHaveBeenCalledWith('get', STREAM_WS_PATH, expect.anything(), expect.anything())
    })

    it('should count the connection against its address as a stream socket', () => {
      expect(wsAdmission.claimConnection).toHaveBeenCalledWith(
        '0xabc0000000000000000000000000000000000001',
        'conn-1',
        'stream'
      )
    })

    it('should not end any other connection', () => {
      expect(wsPool.endConnection).not.toHaveBeenCalled()
    })

    it('should count the first-frame handshake', () => {
      expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_authentications', { method: 'first_frame' })
    })

    describe('and the socket closes', () => {
      beforeEach(() => {
        handlers.close(ws, 1000)
      })

      it('should release the address slot', () => {
        expect(wsAdmission.releaseConnection).toHaveBeenCalledWith('conn-1')
      })

      it('should label the close with the known code', () => {
        expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_close_codes', { code: '1000' })
      })
    })

    describe('and the socket closes with an arbitrary client code', () => {
      beforeEach(() => {
        handlers.close(ws, 4321)
      })

      it('should fold the code into a bounded label', () => {
        expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_close_codes', { code: 'other' })
      })
    })
  })

  describe('when the authenticating address is already at its connection cap', () => {
    beforeEach(async () => {
      wsAdmission.claimConnection.mockReturnValueOnce({ evictedConnectionId: 'oldest-connection' })
      await authenticate()
    })

    it('should end the displaced oldest connection', () => {
      expect(wsPool.endConnection).toHaveBeenCalledWith('oldest-connection', 3005, 'Replaced by a newer connection')
    })

    it('should still accept the new connection', () => {
      expect(sentOfType('ready')).toHaveLength(1)
      expect(ws.end).not.toHaveBeenCalled()
    })
  })

  describe('when the address has spent its subscription budget', () => {
    beforeEach(async () => {
      await authenticate()
      wsAdmission.admitSubscription.mockImplementationOnce(() => {
        throw new SubscriptionRateLimitedError()
      })
      await send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
    })

    it('should reject the subscription without acknowledging it first', () => {
      expect(sentOfType('subscribed')).toHaveLength(0)
      expect(lastSent()).toEqual({
        type: 'error',
        id: 'blocks',
        code: 'rate_limited',
        message: 'Subscription rate exceeded; retry with backoff'
      })
    })

    it('should not open the stream', () => {
      expect(emitter.all.get('blockUpdate') ?? []).toHaveLength(0)
    })

    it('should keep the socket open', () => {
      expect(ws.end).not.toHaveBeenCalled()
    })

    describe('and the client retries the same id', () => {
      beforeEach(async () => {
        await send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
      })

      it('should accept it once the budget allows', () => {
        expect(sentOfType('subscribed')).toEqual([{ type: 'subscribed', id: 'blocks' }])
      })
    })
  })

  describe('when a socket whose connection slot was taken by a newer one subscribes', () => {
    beforeEach(async () => {
      await authenticate()
      wsAdmission.admitSubscription.mockImplementationOnce(() => {
        throw new Error('Connection conn-1 has no admission claim')
      })
      await send({ type: 'subscribe', id: 'blocks', stream: 'block_updates' })
    })

    it('should answer a stream error for that subscription instead of failing the frame', () => {
      expect(lastSent()).toMatchObject({ type: 'error', id: 'blocks', code: 'stream_error' })
      expect(sentOfType('subscribed')).toHaveLength(0)
    })
  })

  describe('when a frame arrives while the auth chain is being verified', () => {
    beforeEach(async () => {
      ;(verify as jest.Mock).mockReturnValueOnce(new Promise(() => {}))
      await handlers.open(ws)
      void handlers.message(ws, AUTH_FRAME)
      await send({ type: 'ping' })
    })

    it('should answer auth_in_progress and count it as a protocol error', () => {
      expect(lastSent()).toMatchObject({ type: 'error', code: 'auth_in_progress' })
      expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_errors', { type: 'auth_in_progress' })
    })
  })

  describe('when registering the stream route', () => {
    let options: any

    describe('and no payload limit is configured', () => {
      beforeEach(() => {
        options = (mockUWs.app.ws as jest.Mock).mock.calls[0][1]
      })

      it('should cap incoming frames at 16 KiB, below the RPC socket limit', () => {
        expect(options.maxPayloadLength).toBe(16 * 1024)
      })
    })

    describe('and the payload limit is configured', () => {
      beforeEach(async () => {
        mockConfig.getNumber.mockImplementation(
          async (key) => (({ STREAM_WS_MAX_PAYLOAD_LENGTH: 4096 }) as any)[key] ?? undefined
        )
        ;(mockUWs.app.ws as jest.Mock).mockClear()
        await registerStreamWsHandler({
          logs: mockLogs,
          uwsServer: mockUWs,
          config: mockConfig,
          metrics: mockMetrics,
          streamSessions: sessions
        })
        options = (mockUWs.app.ws as jest.Mock).mock.calls[0][1]
      })

      it('should use it', () => {
        expect(options.maxPayloadLength).toBe(4096)
      })
    })

    describe.each([0, -1, 1.5])('and the payload limit is %s', (value) => {
      let registration: Promise<void>

      beforeEach(() => {
        mockConfig.getNumber.mockImplementation(
          async (key) => (({ STREAM_WS_MAX_PAYLOAD_LENGTH: value }) as any)[key] ?? undefined
        )
        registration = registerStreamWsHandler({
          logs: mockLogs,
          uwsServer: mockUWs,
          config: mockConfig,
          metrics: mockMetrics,
          streamSessions: sessions
        })
      })

      it('should refuse to register the route', async () => {
        await expect(registration).rejects.toThrow('STREAM_WS_MAX_PAYLOAD_LENGTH must be a positive integer')
      })
    })
  })

  describe('when upgrading a connection', () => {
    let res: any
    let req: any
    let requestHeaders: Record<string, string>
    let upgraded: any

    const runUpgrade = async () => {
      handlers.upgrade(res, req, {})
      await flush()
      upgraded = res.upgrade.mock.calls[0]?.[0]
    }

    beforeEach(() => {
      requestHeaders = {
        'sec-websocket-key': 'key',
        'sec-websocket-protocol': '',
        'sec-websocket-extensions': '',
        'x-identity-auth-chain-0': '{"type":"SIGNER"}',
        'x-identity-timestamp': '1',
        'x-identity-metadata': '{}',
        'user-agent': 'unity'
      }
      res = {
        upgrade: jest.fn(),
        onAborted: jest.fn(),
        cork: jest.fn((callback: () => void) => callback()),
        writeStatus: jest.fn().mockReturnThis(),
        end: jest.fn()
      }
      req = {
        getMethod: () => 'GET',
        getHeader: (key: string) => requestHeaders[key] ?? '',
        forEach: (callback: (key: string, value: string) => void) =>
          Object.entries(requestHeaders).forEach(([key, value]) => callback(key, value))
      }
    })

    describe('and the request carries a valid auth chain in its headers', () => {
      beforeEach(async () => {
        ;(verify as jest.Mock).mockResolvedValueOnce({ auth: '0xAbC0000000000000000000000000000000000001' })
        await runUpgrade()
      })

      it('should verify only the auth headers, signed for the stream path', () => {
        expect(verify).toHaveBeenCalledWith(
          'get',
          STREAM_WS_PATH,
          {
            'x-identity-auth-chain-0': '{"type":"SIGNER"}',
            'x-identity-timestamp': '1',
            'x-identity-metadata': '{}'
          },
          expect.anything()
        )
      })

      it('should upgrade inside a cork with the verified address', () => {
        expect(res.cork).toHaveBeenCalled()
        expect(upgraded).toMatchObject({
          auth: false,
          protocol: 'stream',
          verifiedAddress: '0xabc0000000000000000000000000000000000001'
        })
      })

      describe('and the socket opens', () => {
        beforeEach(async () => {
          jest.useFakeTimers()
          data = upgraded
          await handlers.open(ws)
          jest.advanceTimersByTime(60000)
        })

        it('should be authenticated and ready without an auth frame', () => {
          expect(data).toMatchObject({
            auth: true,
            address: '0xabc0000000000000000000000000000000000001',
            isConnected: true
          })
          expect(sentOfType('ready')).toHaveLength(1)
        })

        it('should claim its address slot and join the fan-out', () => {
          expect(wsAdmission.claimConnection).toHaveBeenCalledWith(
            '0xabc0000000000000000000000000000000000001',
            data.wsConnectionId,
            'stream'
          )
          expect(subscribersContext.addConnection).toHaveBeenCalledWith(
            '0xabc0000000000000000000000000000000000001',
            data.wsConnectionId
          )
        })

        it('should not start the first-frame deadline', () => {
          expect(ws.end).not.toHaveBeenCalled()
        })

        it('should not keep the verified address on the socket data', () => {
          expect(data).not.toHaveProperty('verifiedAddress')
        })

        it('should count the handshake method', () => {
          expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_authentications', {
            method: 'upgrade_headers'
          })
        })
      })
    })

    describe('and the auth chain in its headers is rejected', () => {
      beforeEach(async () => {
        ;(verify as jest.Mock).mockRejectedValueOnce(requestError('Invalid signature', 401))
        await runUpgrade()
      })

      it('should answer 401 without upgrading', () => {
        expect(res.writeStatus).toHaveBeenCalledWith('401 Unauthorized')
        expect(res.end).toHaveBeenCalled()
        expect(res.upgrade).not.toHaveBeenCalled()
      })

      it('should count a client rejection on the stream protocol', () => {
        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_auth_errors_by_protocol', {
          protocol: 'stream',
          type: 'client_rejected'
        })
      })
    })

    describe('and verifying the headers fails on the server side', () => {
      beforeEach(async () => {
        ;(verify as jest.Mock).mockRejectedValueOnce(requestError('Catalyst unreachable', 503))
        await runUpgrade()
      })

      it('should answer 503 without upgrading', () => {
        expect(res.writeStatus).toHaveBeenCalledWith('503 Service Unavailable')
        expect(res.upgrade).not.toHaveBeenCalled()
      })
    })

    describe('and the client goes away while the headers are verified', () => {
      beforeEach(async () => {
        ;(verify as jest.Mock).mockResolvedValueOnce({ auth: '0xAbC0000000000000000000000000000000000001' })
        res.onAborted.mockImplementation((onAbort: () => void) => onAbort())
        await runUpgrade()
      })

      it('should not touch the aborted response', () => {
        expect(res.upgrade).not.toHaveBeenCalled()
        expect(res.writeStatus).not.toHaveBeenCalled()
      })
    })

    describe('and the request carries no auth headers', () => {
      beforeEach(async () => {
        delete requestHeaders['x-identity-auth-chain-0']
        delete requestHeaders['x-identity-timestamp']
        delete requestHeaders['x-identity-metadata']
        await runUpgrade()
      })

      it('should upgrade right away for a first-frame handshake', () => {
        expect(verify).not.toHaveBeenCalled()
        expect(res.onAborted).not.toHaveBeenCalled()
        expect(upgraded).toMatchObject({ auth: false, protocol: 'stream' })
        expect(upgraded).not.toHaveProperty('verifiedAddress')
      })
    })
  })

  describe('when upgrading two connections', () => {
    let first: any
    let second: any

    beforeEach(() => {
      const res = { upgrade: jest.fn() }
      const req = { getMethod: () => 'GET', getHeader: () => 'x', forEach: jest.fn() }
      handlers.upgrade(res, req, {})
      handlers.upgrade(res, req, {})
      ;[first, second] = res.upgrade.mock.calls.map((call: any[]) => call[0])
    })

    it('should start them unauthenticated with unique connection ids', () => {
      expect(first).toMatchObject({ isConnected: false, auth: false, authenticating: false })
      expect(first.wsConnectionId).not.toEqual(second.wsConnectionId)
    })
  })

  describe('when opening a connection', () => {
    describe('and it registers successfully', () => {
      beforeEach(async () => {
        await handlers.open(ws)
      })

      it('should register it in the pool', () => {
        expect(wsPool.registerConnection).toHaveBeenCalledWith(ws)
        expect(data.isConnected).toBe(true)
      })
    })

    describe('and no auth chain arrives in time', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        await handlers.open(ws)
        jest.advanceTimersByTime(30000)
      })

      it('should close it with the auth timeout code', () => {
        expect(ws.end).toHaveBeenCalledWith(3004, 'Authorization timeout')
      })
    })

    describe('and the pool is full', () => {
      beforeEach(async () => {
        wsPool.registerConnection.mockImplementation(() => {
          throw new WsPoolFullError(1)
        })
        await handlers.open(ws)
      })

      it('should close it with the try-again-later code', () => {
        expect(ws.end).toHaveBeenCalledWith(1013, 'Unable to acquire connection')
      })
    })

    describe('and registering fails unexpectedly', () => {
      beforeEach(async () => {
        wsPool.registerConnection.mockImplementation(() => {
          throw new Error('unexpected')
        })
        await handlers.open(ws)
      })

      it('should report it and close the connection', () => {
        expect(mockTracing.captureException).toHaveBeenCalled()
        expect(ws.end).toHaveBeenCalledWith(1013, 'Unable to acquire connection')
      })
    })
  })

  describe('when authenticating', () => {
    describe('and the auth chain is valid', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        await authenticate()
        jest.advanceTimersByTime(60000)
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
        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_auth_errors_by_protocol', {
          protocol: 'stream',
          type: 'client_rejected'
        })
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
        expect(mockMetrics.increment).toHaveBeenCalledWith('ws_auth_errors_by_protocol', {
          protocol: 'stream',
          type: 'server_error'
        })
        expect(ws.end).toHaveBeenCalledWith(3003, 'Unauthorized')
      })
    })

    describe('and ending the socket throws because the client is already gone', () => {
      let result: Promise<void>

      beforeEach(async () => {
        ;(verify as jest.Mock).mockRejectedValueOnce(requestError('bad', 400))
        ws.end.mockImplementation(() => {
          throw new Error('closed')
        })
        await handlers.open(ws)
        result = handlers.message(ws, AUTH_FRAME)
      })

      it('should not propagate the error', async () => {
        await expect(result).resolves.toBeUndefined()
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

    describe('and the client pings', () => {
      beforeEach(async () => {
        await send({ type: 'ping' })
      })

      it('should answer with pong', () => {
        expect(sent).toEqual([{ type: 'pong' }])
      })
    })

    describe.each(['nope', '[]', 'null', '123', '"str"'])('and the client sends %s', (raw) => {
      beforeEach(async () => {
        await send(raw)
      })

      it('should answer with an invalid_message error', () => {
        expect(lastSent()).toMatchObject({ type: 'error', code: 'invalid_message' })
      })
    })

    describe('and the client sends an unknown type', () => {
      beforeEach(async () => {
        await send({ type: 'unknown' })
      })

      it('should answer with an invalid_message error', () => {
        expect(lastSent()).toMatchObject({ type: 'error', code: 'invalid_message' })
      })
    })

    describe('and subscribing', () => {
      describe.each([
        [{ type: 'subscribe', stream: 'block_updates' }],
        [{ type: 'subscribe', id: '', stream: 'block_updates' }],
        [{ type: 'subscribe', id: 5, stream: 'block_updates' }],
        [{ type: 'subscribe', id: 'x'.repeat(65), stream: 'block_updates' }]
      ])('and the id is invalid in %j', (message) => {
        beforeEach(async () => {
          await send(message)
        })

        it('should reject it', () => {
          expect(lastSent()).toMatchObject({ type: 'error', code: 'invalid_message' })
        })
      })

      describe.each(['missing', '', '__proto__', 'constructor', 'toString'])('and the stream is "%s"', (stream) => {
        beforeEach(async () => {
          await send({ type: 'subscribe', id: 'a', stream })
        })

        it('should reject it as unknown', () => {
          expect(lastSent()).toMatchObject({ type: 'error', code: 'unknown_stream', id: 'a' })
        })
      })

      describe('and the stream is not a string', () => {
        beforeEach(async () => {
          await send({ type: 'subscribe', id: 'a', stream: { a: 1 } })
        })

        it('should reject it as unknown', () => {
          expect(lastSent()).toMatchObject({ type: 'error', code: 'unknown_stream' })
        })
      })

      describe('and the subscription is valid', () => {
        let open: jest.SpyInstance

        beforeEach(async () => {
          open = jest.spyOn(streams.block_updates, 'open')
          await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })
        })

        it('should acknowledge it', () => {
          expect(sent[0]).toEqual({ type: 'subscribed', id: 'a' })
        })

        it('should hand the stream the connection identity and a scoped subscribers context', () => {
          expect(open).toHaveBeenCalledWith(
            expect.objectContaining({ address: '0xabc0000000000000000000000000000000000001', wsConnectionId: 'conn-1' })
          )
          expect(subscribersContext.registerGenerator).toHaveBeenCalledWith('conn-1', expect.any(Object))
        })

        describe('and a second subscription to the same stream arrives', () => {
          beforeEach(async () => {
            await send({ type: 'subscribe', id: 'b', stream: 'block_updates' })
          })

          it('should reject it', () => {
            expect(lastSent()).toMatchObject({ type: 'error', code: 'duplicate_subscription', id: 'b' })
            expect(generators).toHaveLength(1)
          })
        })

        describe('and another subscription reuses the id', () => {
          beforeEach(async () => {
            await send({ type: 'subscribe', id: 'a', stream: 'finite_stream' })
          })

          it('should reject it', () => {
            expect(lastSent()).toMatchObject({ type: 'error', code: 'duplicate_subscription' })
          })
        })
      })
    })

    describe('and an update is emitted on a subscribed stream', () => {
      beforeEach(async () => {
        await send({ type: 'subscribe', id: 'a', stream: 'block_updates' })
        sent.length = 0
      })

      describe('and one update arrives', () => {
        beforeEach(async () => {
          emitter.emit('blockUpdate', { address: '0xblocker' })
          await flush()
        })

        it('should send the update with the subscription id and stream', () => {
          expect(sent).toEqual([{ type: 'event', id: 'a', stream: 'block_updates', data: { address: '0xblocker' } }])
          expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_updates_sent', { event: 'block_updates' })
        })
      })

      describe('and consecutive updates arrive', () => {
        beforeEach(async () => {
          for (let i = 0; i < 5; i++) emitter.emit('blockUpdate', { address: `0x${i}` })
          await flush()
        })

        it('should keep their order', () => {
          expect(sentOfType('event').map((message) => message.data.address)).toEqual([
            '0x0',
            '0x1',
            '0x2',
            '0x3',
            '0x4'
          ])
        })
      })

      describe('and the client is not draining the socket', () => {
        beforeEach(async () => {
          ws.send.mockReset()
          ws.send.mockImplementation(() => 2)
          emitter.emit('blockUpdate', { address: '0x1' })
          await flush()
          emitter.emit('blockUpdate', { address: '0x2' })
          await flush()
        })

        it('should end the connection as a slow consumer and stop sending', () => {
          expect(ws.end).toHaveBeenCalledTimes(1)
          expect(ws.end).toHaveBeenCalledWith(1008, 'Slow consumer')
          expect(ws.send).toHaveBeenCalledTimes(1)
          expect(emitter.all.get('blockUpdate') ?? []).toHaveLength(0)
          expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_errors', { type: 'slow_consumer' })
        })
      })

      describe('and the socket was already closed by the client', () => {
        beforeEach(async () => {
          ws.send.mockImplementation(() => {
            throw new Error('Invalid access of closed uWS.WebSocket')
          })
          emitter.emit('blockUpdate', { address: '0x1' })
          await flush()
        })

        it('should stop the subscription without throwing', () => {
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

      describe('and the subscription id is known', () => {
        beforeEach(async () => {
          await send({ type: 'unsubscribe', id: 'a' })
          await flush()
        })

        it('should destroy only that subscription and confirm the end', () => {
          expect(generators[0].destroy).toHaveBeenCalledTimes(1)
          expect(sent).toEqual([{ type: 'end', id: 'a', reason: 'unsubscribed' }])
        })

        describe('and an update arrives afterwards', () => {
          beforeEach(async () => {
            sent.length = 0
            emitter.emit('blockUpdate', { address: '0x1' })
            await flush()
          })

          it('should not deliver it', () => {
            expect(sent).toEqual([])
          })
        })

        describe('and the client subscribes to the same stream again', () => {
          beforeEach(async () => {
            sent.length = 0
            await send({ type: 'subscribe', id: 'b', stream: 'block_updates' })
          })

          it('should acknowledge the new subscription', () => {
            expect(sent[0]).toEqual({ type: 'subscribed', id: 'b' })
          })
        })

        describe('and the client unsubscribes again', () => {
          beforeEach(async () => {
            await send({ type: 'unsubscribe', id: 'a' })
          })

          it('should reject it', () => {
            expect(lastSent()).toMatchObject({ type: 'error', code: 'unknown_subscription' })
          })
        })
      })

      describe('and the subscription id is unknown', () => {
        beforeEach(async () => {
          await send({ type: 'unsubscribe', id: 'zzz' })
        })

        it('should reject it echoing the id', () => {
          expect(lastSent()).toMatchObject({ code: 'unknown_subscription', id: 'zzz' })
        })
      })

      describe('and the subscription id is not a string', () => {
        beforeEach(async () => {
          await send({ type: 'unsubscribe', id: 42 })
        })

        it('should reject it without echoing the id', () => {
          expect(lastSent()).toMatchObject({ code: 'unknown_subscription' })
          expect(lastSent().id).toBeUndefined()
        })
      })
    })

    describe('and the stream completes by itself', () => {
      beforeEach(async () => {
        await send({ type: 'subscribe', id: 'f', stream: 'finite_stream' })
        await flush()
      })

      it('should send every update and then end with the completed reason', () => {
        expect(sent.map((message) => message.type)).toEqual(['subscribed', 'event', 'event', 'end'])
        expect(lastSent()).toEqual({ type: 'end', id: 'f', reason: 'completed' })
      })

      describe('and the client subscribes again', () => {
        beforeEach(async () => {
          sent.length = 0
          await send({ type: 'subscribe', id: 'g', stream: 'finite_stream' })
        })

        it('should acknowledge the new subscription', () => {
          expect(sent[0]).toEqual({ type: 'subscribed', id: 'g' })
        })
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

      describe('and the client keeps using the connection', () => {
        beforeEach(async () => {
          await send({ type: 'ping' })
        })

        it('should keep it usable', () => {
          expect(lastSent()).toEqual({ type: 'pong' })
          expect(ws.end).not.toHaveBeenCalled()
        })
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
        expect(mockMetrics.increment).toHaveBeenCalledWith('stream_ws_close_codes', { code: '1000' })
      })

      describe('and an update arrives afterwards', () => {
        beforeEach(() => {
          sent.length = 0
          emitter.emit('blockUpdate', { address: '0x1' })
        })

        it('should not send anything to the closed socket', () => {
          expect(sent).toEqual([])
        })
      })
    })

    describe('and it never authenticated', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        await handlers.open(ws)
        await handlers.close(ws, 1006, Buffer.from(''))
        jest.advanceTimersByTime(60000)
      })

      it('should not detach any user but still release the pool slot', () => {
        expect(subscribersContext.removeConnection).not.toHaveBeenCalled()
        expect(wsPool.unregisterConnection).toHaveBeenCalled()
      })

      it('should cancel the auth timeout', () => {
        expect(ws.end).not.toHaveBeenCalled()
      })
    })

    describe('and detaching the user throws', () => {
      beforeEach(async () => {
        await authenticate()
        subscribersContext.removeConnection.mockImplementationOnce(() => {
          throw new Error('detach failed')
        })
        await handlers.close(ws, 1000, Buffer.from(''))
      })

      it('should still release the pool slot and report the error', () => {
        expect(mockTracing.captureException).toHaveBeenCalled()
        expect(wsPool.unregisterConnection).toHaveBeenCalled()
      })
    })

    describe('and it closes twice', () => {
      beforeEach(async () => {
        await authenticate()
        await handlers.close(ws, 1000, Buffer.from(''))
      })

      it('should not throw on the second close', () => {
        expect(() => handlers.close(ws, 1000, Buffer.from(''))).not.toThrow()
      })
    })
  })
})
