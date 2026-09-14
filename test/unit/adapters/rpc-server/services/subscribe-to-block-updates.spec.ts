import { subscribeToBlockUpdatesService } from '../../../../../src/controllers/handlers/rpc/subscribe-to-block-updates'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import {
  SubscriptionStreamClosed,
  SubscriptionStreamClosedReason
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { RpcServerContext } from '../../../../../src/types'
import { createMockUpdateHandlerComponent } from '../../../../mocks/components'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'
import { createLogsMockedComponent } from '../../../../mocks/components/logs'
import { mockMetrics } from '../../../../mocks/components/metrics'
import { mockConfig } from '../../../../mocks/components/config'
import { createWsPoolMockedComponent } from '../../../../mocks/components/ws-pool'
import { ILoggerComponent } from '@well-known-components/interfaces'

describe('when subscribing to block updates', () => {
  let subscribeToBlockUpdates: ReturnType<typeof subscribeToBlockUpdatesService>
  let rpcContext: RpcServerContext
  let mockUpdateHandler: jest.Mocked<any>
  let subscribersContext: any
  let logs: jest.Mocked<ILoggerComponent>

  const mockUpdate = {
    blockerAddress: '0x123',
    blockedAddress: '0x456',
    isBlocked: true
  }

  beforeEach(() => {
    logs = createLogsMockedComponent()
    subscribersContext = createSubscribersContext({ logs, metrics: mockMetrics, config: mockConfig }, createWsPoolMockedComponent())
    mockUpdateHandler = createMockUpdateHandlerComponent({})

    subscribeToBlockUpdates = subscribeToBlockUpdatesService({
      components: {
        logs,
        updateHandler: mockUpdateHandler
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  describe('when the subscription has updates', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield mockUpdate
      })
    })

    it('should yield the update', async () => {
      const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
      const result = await generator.next()

      expect(result.value).toEqual(mockUpdate)
      expect(result.done).toBe(false)
    })
  })

  describe('when the subscription encounters an error', () => {
    let testError: Error

    beforeEach(() => {
      testError = new Error('Test error')
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        throw testError
      })
    })

    it('should propagate the error', async () => {
      const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
      await expect(generator.next()).rejects.toThrow(testError)
    })
  })

  describe('when the subscription is cleaned up', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        while (true) {
          yield undefined
        }
      })
    })

    it('should properly clean up subscription on return', async () => {
      const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
      const result = await generator.return(undefined)

      expect(result.done).toBe(true)
    })
  })

  describe('when extracting addresses from updates', () => {
    beforeEach(() => {
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield mockUpdate
      })

      const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
      generator.next()
    })

    it('should get the proper address from the update', () => {
      const getAddressFromUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].getAddressFromUpdate
      expect(getAddressFromUpdate(mockUpdate)).toBe(mockUpdate.blockerAddress)
    })
  })

  describe('when filtering updates', () => {
    let loggedUserAddress: string
    let mockUpdateBlockingNonLoggedUser: any
    let mockUpdateBlockingLoggedUser: any

    beforeEach(() => {
      loggedUserAddress = '0x123'
      mockUpdateBlockingNonLoggedUser = {
        blockedAddress: '0x456',
        blockerAddress: loggedUserAddress,
        isBlocked: true
      }

      mockUpdateBlockingLoggedUser = {
        blockedAddress: loggedUserAddress,
        blockerAddress: '0x456',
        isBlocked: true
      }

      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
        yield mockUpdate
      })

      const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
      generator.next()
    })

    it('should filter updates based on address conditions', () => {
      // Extract the shouldHandleUpdate function from the handler call
      const shouldHandleUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].shouldHandleUpdate

      expect(shouldHandleUpdate(mockUpdateBlockingNonLoggedUser)).toBe(false)
      expect(shouldHandleUpdate(mockUpdateBlockingLoggedUser)).toBe(true)
    })
  })

  describe('when building the final stream-closed message', () => {
    let streamClosed: SubscriptionStreamClosed

    beforeEach(async () => {
      streamClosed = { reason: SubscriptionStreamClosedReason.STREAM_CLOSED_DUPLICATE_SUBSCRIPTION }
      mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {})

      const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
      await generator.next()
    })

    it('should build an update with protobuf defaults carrying the stream-closed notice', () => {
      const buildStreamClosedUpdate =
        mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].buildStreamClosedUpdate

      expect(buildStreamClosedUpdate(streamClosed)).toEqual({ address: '', isBlocked: false, streamClosed })
    })
  })
})
