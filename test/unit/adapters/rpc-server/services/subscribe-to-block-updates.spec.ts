import { subscribeToBlockUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-block-updates'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext } from '../../../../../src/types'
import { mockLogs, createMockUpdateHandlerComponent } from '../../../../mocks/components'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'

describe('when subscribing to block updates', () => {
  let subscribeToBlockUpdates: ReturnType<typeof subscribeToBlockUpdatesService>
  let rpcContext: RpcServerContext
  const subscribersContext = createSubscribersContext()
  const mockUpdateHandler = createMockUpdateHandlerComponent({})

  const mockUpdate = {
    blockerAddress: '0x123',
    blockedAddress: '0x456',
    isBlocked: true
  }

  beforeEach(async () => {
    subscribeToBlockUpdates = subscribeToBlockUpdatesService({
      components: {
        logs: mockLogs,
        updateHandler: mockUpdateHandler
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  it('should handle subscription updates', async () => {
    mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
      yield mockUpdate
    })

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    expect(result.value).toEqual(mockUpdate)
    expect(result.done).toBe(false)
  })

  it('should handle errors during subscription', async () => {
    const testError = new Error('Test error')
    mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
      throw testError
    })

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    await expect(generator.next()).rejects.toThrow(testError)
  })

  it('should properly clean up subscription on return', async () => {
    mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
      while (true) {
        yield undefined
      }
    })

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    const result = await generator.return(undefined)

    expect(result.done).toBe(true)
  })

  it('should get the proper address from the update', async () => {
    mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
      yield mockUpdate
    })

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    const getAddressFromUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].getAddressFromUpdate
    expect(getAddressFromUpdate(mockUpdate)).toBe(mockUpdate.blockerAddress)
  })

  it('should filter updates based on address conditions', async () => {
    mockUpdateHandler.handleSubscriptionUpdates.mockImplementationOnce(async function* () {
      yield mockUpdate
    })

    const loggedUserAddress = '0x123'

    const mockUpdateBlockingNonLoggedUser = {
      blockedAddress: '0x456',
      blockerAddress: loggedUserAddress,
      isBlocked: true
    }

    const mockUpdateBlockingLoggedUser = {
      blockedAddress: loggedUserAddress,
      blockerAddress: '0x456',
      isBlocked: true
    }

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    // Extract the shouldHandleUpdate function from the handler call
    const shouldHandleUpdate = mockUpdateHandler.handleSubscriptionUpdates.mock.calls[0][0].shouldHandleUpdate

    expect(shouldHandleUpdate(mockUpdateBlockingNonLoggedUser)).toBe(false)
    expect(shouldHandleUpdate(mockUpdateBlockingLoggedUser)).toBe(true)
  })
})
