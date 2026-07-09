import * as Sentry from '@sentry/node'
import {
  createRpcServerMetricsWrapper,
  RpcResponseCode,
  ServiceType
} from '../../../src/adapters/rpc-server/metrics-wrapper'

// Sentry's exports are non-configurable, so they can't be spied on directly. Mock the
// module with call-through implementations: startSpan/suppressTracing still run their
// callback (so metrics are recorded), while remaining assertable as jest mocks.
jest.mock('@sentry/node', () => {
  const actual = jest.requireActual('@sentry/node')
  return {
    __esModule: true,
    ...actual,
    startSpan: jest.fn((_options: unknown, callback: (...args: unknown[]) => unknown) => callback()),
    suppressTracing: jest.fn((callback: (...args: unknown[]) => unknown) => callback())
  }
})
import { RpcServerContext } from '../../../src/types'
import { mockLogs } from '../../mocks/components/logs'
import { mockMetrics } from '../../mocks/components'
import { createMockConfigComponent } from '../../mocks/components/config'

describe('RPC Server Metrics Component', () => {
  async function createTestContext(tracingEnabled: boolean = true) {
    return {
      wrapper: await createRpcServerMetricsWrapper({
        components: {
          metrics: mockMetrics,
          logs: mockLogs,
          config: createMockConfigComponent({
            getString: jest.fn().mockResolvedValue(tracingEnabled ? 'true' : 'false')
          })
        }
      }),
      mockContext: { address: '0x123' } as RpcServerContext
    }
  }

  describe('initialization', () => {
    it('should return an object with withMetrics method', async () => {
      const { wrapper } = await createTestContext()
      expect(wrapper).toHaveProperty('withMetrics')
      expect(typeof wrapper.withMetrics).toBe('function')
    })
  })

  describe('message size calculation', () => {
    it('should handle empty/null messages', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const callService = jest.fn().mockResolvedValue({})
      const wrappedService = wrapper.withMetrics({
        testMethod: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      await wrappedService.testMethod(null, mockContext)

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_in_procedure_call_size_bytes',
        { procedure: 'testMethod' },
        0
      )
    })

    it('should handle falsy values correctly', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const nullService = jest.fn().mockResolvedValue(null)
      const wrappedService = wrapper.withMetrics({
        nullResponseMethod: {
          creator: nullService,
          type: ServiceType.CALL
        }
      })

      await wrappedService.nullResponseMethod({}, mockContext)

      const observeCalls = mockMetrics.observe.mock.calls
      const responseCall = observeCalls.find(
        (call) => call[0] === 'rpc_out_procedure_call_size_bytes' && call[1].procedure === 'nullResponseMethod'
      )

      expect(responseCall).toBeDefined()
      expect(responseCall[2]).toBe(0)
    })

    it('should return 0 for all falsy values', async () => {
      const { wrapper, mockContext } = await createTestContext()

      let returnValue: any = undefined

      const falsyService = jest.fn().mockImplementation(() => Promise.resolve(returnValue))
      const wrappedService = wrapper.withMetrics({
        falsyTest: {
          creator: falsyService,
          type: ServiceType.CALL
        }
      })

      const falsyValues = [null, undefined, false, 0, '', NaN]

      for (const value of falsyValues) {
        mockMetrics.observe.mockClear()
        returnValue = value

        await wrappedService.falsyTest({}, mockContext)

        const observeCalls = mockMetrics.observe.mock.calls
        const responseCall = observeCalls.find(
          (call) => call[0] === 'rpc_out_procedure_call_size_bytes' && call[1].procedure === 'falsyTest'
        )

        expect(responseCall).toBeDefined()
        expect(responseCall[2]).toBe(0)
      }
    })

    it('should handle complex objects', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const callService = jest.fn().mockResolvedValue({ result: 'success' })
      const wrappedService = wrapper.withMetrics({
        testMethod: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      const testObj = { user: 'test', data: [1, 2, 3], nested: { value: true } }
      await wrappedService.testMethod(testObj, mockContext)

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_in_procedure_call_size_bytes',
        { procedure: 'testMethod' },
        expect.any(Number)
      )
    })

    it('should handle JSON stringify errors', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const callService = jest.fn().mockResolvedValue({})
      const wrappedService = wrapper.withMetrics({
        testMethod: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      const circular: any = {}
      circular.self = circular

      await wrappedService.testMethod(circular, mockContext)

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_in_procedure_call_size_bytes',
        { procedure: 'testMethod' },
        0
      )
    })
  })

  describe('measureRpcCall', () => {
    it('should wrap a call method and record metrics', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const callResult = { paginationData: { total: 100, page: 1 } }
      const callService = jest.fn().mockResolvedValue(callResult)
      const wrappedService = wrapper.withMetrics({
        testCall: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      const params = { id: 123 }
      const result = await wrappedService.testCall(params, mockContext)

      expect(callService).toHaveBeenCalledWith(params, mockContext)

      expect(result).toEqual(callResult)

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_in_procedure_call_size_bytes',
        { procedure: 'testCall' },
        expect.any(Number)
      )
      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_out_procedure_call_size_bytes',
        { code: 'OK', procedure: 'testCall' },
        expect.any(Number)
      )
      expect(mockMetrics.increment).toHaveBeenCalledWith('rpc_procedure_call_total', {
        code: 'OK',
        procedure: 'testCall'
      })
      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_procedure_call_duration_seconds',
        { code: 'OK', procedure: 'testCall' },
        expect.any(Number)
      )
    })

    it('should handle errors in call methods', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const testError = new Error('Test error')
      const callService = jest.fn().mockRejectedValue(testError)
      const wrappedService = wrapper.withMetrics({
        errorCall: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      await expect(wrappedService.errorCall({}, mockContext)).rejects.toThrow(testError)

      expect(mockMetrics.increment).toHaveBeenCalledWith('rpc_procedure_call_total', {
        code: 'ERROR',
        procedure: 'errorCall'
      })
      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_procedure_call_duration_seconds',
        { code: 'ERROR', procedure: 'errorCall' },
        expect.any(Number)
      )
    })
  })

  describe('measureRpcStream', () => {
    it('should wrap a stream method and record metrics', async () => {
      const { wrapper, mockContext } = await createTestContext()

      async function* testGenerator() {
        yield 1
        yield 2
        yield 3
      }

      const streamService = jest.fn().mockImplementation(testGenerator)
      const wrappedService = wrapper.withMetrics({
        testStream: {
          creator: streamService,
          type: ServiceType.STREAM,
          event: 'testStream'
        }
      })

      const params = { id: 456 }
      const results = []

      for await (const item of wrappedService.testStream(params, mockContext)) {
        results.push(item)
      }

      expect(streamService).toHaveBeenCalledWith(params, mockContext)

      expect(results).toEqual([1, 2, 3])

      expect(mockMetrics.increment).toHaveBeenCalledWith('rpc_updates_sent_on_subscription', {
        event: 'testStream'
      })

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_in_procedure_call_size_bytes',
        { procedure: 'testStream' },
        expect.any(Number)
      )
      expect(mockMetrics.increment).toHaveBeenCalledWith('rpc_procedure_call_total', {
        code: 'OK',
        procedure: 'testStream'
      })
      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_procedure_call_duration_seconds',
        { code: 'OK', procedure: 'testStream' },
        expect.any(Number)
      )
    })

    it('should handle errors in stream methods', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const testError = new Error('Stream error')

      async function* errorGenerator() {
        yield 1
        throw testError
      }

      const streamService = jest.fn().mockImplementation(errorGenerator)
      const wrappedService = wrapper.withMetrics({
        errorStream: {
          creator: streamService,
          type: ServiceType.STREAM,
          event: 'errorStream'
        }
      })

      const iterator = wrappedService.errorStream({}, mockContext)
      await expect(async () => {
        for await (const _ of iterator) {
        }
      }).rejects.toThrow(testError)

      expect(mockMetrics.increment).toHaveBeenCalledWith('rpc_procedure_call_total', {
        code: 'STREAM_ERROR',
        procedure: 'errorStream'
      })
      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_procedure_call_duration_seconds',
        { code: 'STREAM_ERROR', procedure: 'errorStream' },
        expect.any(Number)
      )
    })

    it('should throw an error if a stream method does not have an event property', async () => {
      const { wrapper } = await createTestContext()

      const streamFn = jest.fn()

      expect(() =>
        wrapper.withMetrics({
          method1: { creator: streamFn, type: ServiceType.STREAM }
        })
      ).toThrow('Stream service "method1" must have an event property')
    })
  })

  describe('withMetrics', () => {
    it('should wrap multiple methods of different types', async () => {
      const { wrapper } = await createTestContext()

      const callFn = jest.fn()
      const streamFn = jest.fn()

      const wrappedServices = wrapper.withMetrics({
        method1: { creator: callFn, type: ServiceType.CALL },
        method2: { creator: streamFn, type: ServiceType.STREAM, event: 'testStream' }
      })

      expect(wrappedServices).toHaveProperty('method1')
      expect(wrappedServices).toHaveProperty('method2')
      expect(typeof wrappedServices.method1).toBe('function')
      expect(typeof wrappedServices.method2).toBe('function')
    })

    it('should skip non-function properties', async () => {
      const { wrapper } = await createTestContext()

      const services = {
        getFriends: { creator: jest.fn(), type: ServiceType.CALL },
        invalidProp: { creator: 'not a function', type: ServiceType.CALL } as any
      }

      const wrappedServices = wrapper.withMetrics(services)

      expect(wrappedServices).toHaveProperty('getFriends')
      expect(typeof wrappedServices.getFriends).toBe('function')
    })
  })

  describe('response code mapping', () => {
    it.each([
      { $case: 'ok', code: RpcResponseCode.OK },
      { $case: 'internalServerError', code: RpcResponseCode.INTERNAL_SERVER_ERROR },
      { $case: 'invalidRequest', code: RpcResponseCode.INVALID_REQUEST },
      { $case: 'profileNotFound', code: RpcResponseCode.PROFILE_NOT_FOUND },
      { $case: 'invalidFriendshipAction', code: RpcResponseCode.INVALID_FRIENDSHIP_ACTION }
    ])('should map response with case $case to $code', async ({ $case, code }) => {
      const { wrapper, mockContext } = await createTestContext()

      const errorResponse = {
        response: { $case }
      }

      const callService = jest.fn().mockResolvedValue(errorResponse)
      const wrappedService = wrapper.withMetrics({
        testMethod: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      await wrappedService.testMethod({}, mockContext)

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_out_procedure_call_size_bytes',
        { code, procedure: 'testMethod' },
        expect.any(Number)
      )
    })

    it('should map paginated response to OK code', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const paginatedResponse = {
        paginationData: { nextCursor: 'next' }
      }

      const callService = jest.fn().mockResolvedValue(paginatedResponse)
      const wrappedService = wrapper.withMetrics({
        testMethod: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      await wrappedService.testMethod({}, mockContext)

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_out_procedure_call_size_bytes',
        { code: 'OK', procedure: 'testMethod' },
        expect.any(Number)
      )
    })

    it('should map blocking status response to OK code', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const blockingResponse = {
        blockedUsers: [],
        blockedByUsers: []
      }

      const callService = jest.fn().mockResolvedValue(blockingResponse)
      const wrappedService = wrapper.withMetrics({
        testMethod: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      await wrappedService.testMethod({}, mockContext)

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_out_procedure_call_size_bytes',
        { code: 'OK', procedure: 'testMethod' },
        expect.any(Number)
      )
    })

    it('should map unknown response to UNKNOWN code', async () => {
      const { wrapper, mockContext } = await createTestContext()

      const unknownResponse = {
        someField: 'value'
      }

      const callService = jest.fn().mockResolvedValue(unknownResponse)
      const wrappedService = wrapper.withMetrics({
        testMethod: {
          creator: callService,
          type: ServiceType.CALL
        }
      })

      await wrappedService.testMethod({}, mockContext)

      expect(mockMetrics.observe).toHaveBeenCalledWith(
        'rpc_out_procedure_call_size_bytes',
        { code: 'UNKNOWN', procedure: 'testMethod' },
        expect.any(Number)
      )
    })
  })

  describe('when the RPC_TRACING_ENABLED flag is toggled', () => {
    const startSpanMock = Sentry.startSpan as jest.Mock
    const suppressTracingMock = Sentry.suppressTracing as jest.Mock

    beforeEach(() => {
      startSpanMock.mockClear()
      suppressTracingMock.mockClear()
    })

    describe('and the flag is enabled (the default)', () => {
      it('should wrap a call in a Sentry span and not suppress tracing', async () => {
        const { wrapper, mockContext } = await createTestContext(true)

        const wrappedService = wrapper.withMetrics({
          testCall: { creator: jest.fn().mockResolvedValue({}), type: ServiceType.CALL }
        })

        await wrappedService.testCall({}, mockContext)

        expect(startSpanMock).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'RPC testCall', op: 'rpc.call' }),
          expect.any(Function)
        )
        expect(suppressTracingMock).not.toHaveBeenCalled()
      })

      it('should wrap a stream set-up in a Sentry span and not suppress tracing', async () => {
        const { wrapper, mockContext } = await createTestContext(true)

        async function* testGenerator() {
          yield 1
        }
        const wrappedService = wrapper.withMetrics({
          testStream: { creator: jest.fn().mockImplementation(testGenerator), type: ServiceType.STREAM, event: 'testStream' }
        })

        for await (const _ of wrappedService.testStream({}, mockContext)) {
        }

        expect(startSpanMock).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'RPC Stream testStream', op: 'rpc.stream.init' }),
          expect.any(Function)
        )
        expect(suppressTracingMock).not.toHaveBeenCalled()
      })
    })

    describe('and the flag is disabled', () => {
      it('should suppress tracing for a call and not open a Sentry span', async () => {
        const { wrapper, mockContext } = await createTestContext(false)

        const callService = jest.fn().mockResolvedValue({ paginationData: { total: 1 } })
        const wrappedService = wrapper.withMetrics({
          testCall: { creator: callService, type: ServiceType.CALL }
        })

        await wrappedService.testCall({}, mockContext)

        expect(startSpanMock).not.toHaveBeenCalled()
        expect(suppressTracingMock).toHaveBeenCalled()
        // Metrics are still recorded even with tracing off.
        expect(callService).toHaveBeenCalled()
        expect(mockMetrics.increment).toHaveBeenCalledWith('rpc_procedure_call_total', {
          code: 'OK',
          procedure: 'testCall'
        })
      })

      it('should suppress tracing for a stream set-up and not open a Sentry span', async () => {
        const { wrapper, mockContext } = await createTestContext(false)

        async function* testGenerator() {
          yield 1
        }
        const wrappedService = wrapper.withMetrics({
          testStream: { creator: jest.fn().mockImplementation(testGenerator), type: ServiceType.STREAM, event: 'testStream' }
        })

        const results = []
        for await (const item of wrappedService.testStream({}, mockContext)) {
          results.push(item)
        }

        expect(startSpanMock).not.toHaveBeenCalled()
        expect(suppressTracingMock).toHaveBeenCalled()
        // The stream still yields and records metrics with tracing off.
        expect(results).toEqual([1])
        expect(mockMetrics.increment).toHaveBeenCalledWith('rpc_procedure_call_total', {
          code: 'OK',
          procedure: 'testStream'
        })
      })
    })
  })
})
