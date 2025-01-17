import { mockDb, mockLogs, mockPubSub } from '../../../../mocks/components'
import { upsertFriendshipService } from '../../../../../src/adapters/rpc-server/services/upsert-friendship'
import { Action, FriendshipStatus, RpcServerContext, AppComponents } from '../../../../../src/types'
import * as FriendshipsLogic from '../../../../../src/logic/friendships'
import {
  UpsertFriendshipPayload,
  UpsertFriendshipResponse
} from '@dcl/protocol/out-ts/decentraland/social_service/v3/social_service_v3.gen'
import { ParsedUpsertFriendshipRequest } from '../../../../../src/logic/friendships'

jest.mock('../../../../../src/logic/friendships')

describe('upsertFriendshipService', () => {
  let components: jest.Mocked<Pick<AppComponents, 'db' | 'logs' | 'pubsub'>>
  let upsertFriendship: ReturnType<typeof upsertFriendshipService>

  const rpcContext: RpcServerContext = { address: '0x123', subscribers: undefined }
  const userAddress = '0x456'
  const message = 'Hello'

  const mockRequest: UpsertFriendshipPayload = {
    action: {
      $case: 'request',
      request: { user: { address: userAddress }, message }
    }
  }

  const mockParsedRequest: ParsedUpsertFriendshipRequest = {
    action: Action.REQUEST,
    user: userAddress,
    metadata: { message }
  }

  const existingFriendship = {
    id: 'friendship-id',
    address_requester: rpcContext.address,
    address_requested: userAddress,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const lastFriendshipAction = {
    id: 'action-id',
    friendship_id: 'friendship-id',
    acting_user: rpcContext.address,
    action: Action.REQUEST,
    timestamp: Date.now().toString()
  }

  beforeEach(() => {
    components = { db: mockDb, logs: mockLogs, pubsub: mockPubSub }
    upsertFriendship = upsertFriendshipService({ components })
    mockDb.executeTx.mockImplementation(async (cb) => await cb({} as any))
  })

  it('should return an internalServerError for an invalid request', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(null)

    const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: {}
      }
    })
  })

  it('should return invalidFriendshipAction for an invalid action', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockParsedRequest)
    jest.spyOn(FriendshipsLogic, 'validateNewFriendshipAction').mockReturnValueOnce(false)

    const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'invalidFriendshipAction',
        invalidFriendshipAction: {}
      }
    })
  })

  it('should update an existing friendship', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockParsedRequest)
    jest.spyOn(FriendshipsLogic, 'validateNewFriendshipAction').mockReturnValueOnce(true)
    jest.spyOn(FriendshipsLogic, 'getNewFriendshipStatus').mockReturnValueOnce(FriendshipStatus.Friends)

    mockDb.getFriendship.mockResolvedValueOnce(existingFriendship)
    mockDb.getLastFriendshipAction.mockResolvedValueOnce(lastFriendshipAction)

    const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

    expect(mockDb.updateFriendshipStatus).toHaveBeenCalledWith(existingFriendship.id, true, expect.anything())
    expect(mockDb.recordFriendshipAction).toHaveBeenCalledWith(
      existingFriendship.id,
      rpcContext.address,
      mockParsedRequest.action,
      mockParsedRequest.metadata,
      expect.anything()
    )
    expect(result).toEqual({
      response: {
        $case: 'accepted',
        accepted: {
          id: existingFriendship.id,
          createdAt: expect.any(Number)
        }
      }
    })
  })

  it('should create a new friendship', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockParsedRequest)
    jest.spyOn(FriendshipsLogic, 'validateNewFriendshipAction').mockReturnValueOnce(true)
    jest.spyOn(FriendshipsLogic, 'getNewFriendshipStatus').mockReturnValueOnce(FriendshipStatus.Requested)

    mockDb.getFriendship.mockResolvedValueOnce(null)
    mockDb.createFriendship.mockResolvedValueOnce({
      id: 'new-friendship-id',
      created_at: new Date()
    })

    const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

    expect(mockDb.createFriendship).toHaveBeenCalledWith([rpcContext.address, userAddress], false, expect.anything())
    expect(mockDb.recordFriendshipAction).toHaveBeenCalledWith(
      'new-friendship-id',
      rpcContext.address,
      mockParsedRequest.action,
      mockParsedRequest.metadata,
      expect.anything()
    )
    expect(result).toEqual({
      response: {
        $case: 'accepted',
        accepted: {
          id: 'new-friendship-id',
          createdAt: expect.any(Number)
        }
      }
    })
  })

  it('should publish an event after a successful friendship update', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockParsedRequest)
    jest.spyOn(FriendshipsLogic, 'validateNewFriendshipAction').mockReturnValueOnce(true)
    jest.spyOn(FriendshipsLogic, 'getNewFriendshipStatus').mockReturnValueOnce(FriendshipStatus.Friends)

    mockDb.getFriendship.mockResolvedValueOnce(existingFriendship)
    mockDb.getLastFriendshipAction.mockResolvedValueOnce(lastFriendshipAction)

    const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

    expect(components.pubsub.publishFriendshipUpdate).toHaveBeenCalledWith({
      from: rpcContext.address,
      to: userAddress,
      action: mockParsedRequest.action,
      timestamp: expect.any(Number),
      metadata: mockParsedRequest.metadata
    })
    expect(result.response.$case).toBe('accepted')
  })

  it('should handle errors gracefully', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockParsedRequest)
    mockDb.getFriendship.mockImplementationOnce(() => {
      throw new Error('Database error')
    })

    const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: {}
      }
    })
  })
})
