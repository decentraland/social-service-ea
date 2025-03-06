import { subscribeToBlockUpdatesService } from '../../../../../src/adapters/rpc-server/services/subscribe-to-block-updates'
import { Empty } from '@dcl/protocol/out-js/google/protobuf/empty.gen'
import { RpcServerContext } from '../../../../../src/types'
import { mockCatalystClient, mockLogs } from '../../../../mocks/components'
import { handleSubscriptionUpdates } from '../../../../../src/logic/updates'
import { createSubscribersContext } from '../../../../../src/adapters/rpc-server'

jest.mock('../../../../../src/logic/updates')

describe('subscribeToBlockUpdatesService', () => {
  let subscribeToBlockUpdates: ReturnType<typeof subscribeToBlockUpdatesService>
  let rpcContext: RpcServerContext
  const subscribersContext = createSubscribersContext()
  const mockHandler = handleSubscriptionUpdates as jest.Mock

  const mockUpdate = {
    blockerAddress: '0x123',
    blockedAddress: '0x456',
    isBlocked: true
  }

  beforeEach(async () => {
    subscribeToBlockUpdates = subscribeToBlockUpdatesService({
      components: {
        logs: mockLogs,
        catalystClient: mockCatalystClient
      }
    })

    rpcContext = {
      address: '0x123',
      subscribersContext
    }
  })

  it('should handle subscription updates', async () => {
    mockHandler.mockImplementationOnce(async function* () {
      yield mockUpdate
    })

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    expect(result.value).toEqual(mockUpdate)
    expect(result.done).toBe(false)
  })

  it('should handle errors during subscription', async () => {
    const testError = new Error('Test error')
    mockHandler.mockImplementationOnce(async function* () {
      throw testError
    })

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    await expect(generator.next()).rejects.toThrow(testError)
  })

  it('should properly clean up subscription on return', async () => {
    mockHandler.mockImplementationOnce(async function* () {
      while (true) {
        yield undefined
      }
    })

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    const result = await generator.return(undefined)

    expect(result.done).toBe(true)
  })

  it('should get the proper address from the update', async () => {
    mockHandler.mockImplementationOnce(async function* () {
      yield mockUpdate
    })

    const generator = subscribeToBlockUpdates({} as Empty, rpcContext)
    const result = await generator.next()

    const getAddressFromUpdate = mockHandler.mock.calls[0][0].getAddressFromUpdate
    expect(getAddressFromUpdate(mockUpdate)).toBe(mockUpdate.blockerAddress)
  })

  it('should filter updates based on address conditions', async () => {
    mockHandler.mockImplementationOnce(async function* () {
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
    const shouldHandleUpdate = mockHandler.mock.calls[0][0].shouldHandleUpdate

    expect(shouldHandleUpdate(mockUpdateBlockingNonLoggedUser)).toBe(false)
    expect(shouldHandleUpdate(mockUpdateBlockingLoggedUser)).toBe(true)
  })
})
