import { mockCatalystClient, mockDb, mockLogs, mockPubSub } from '../../../../mocks/components'
import { upsertFriendshipService } from '../../../../../src/adapters/rpc-server/services/upsert-friendship'
import { Action, FriendshipStatus, RpcServerContext } from '../../../../../src/types'
import * as FriendshipsLogic from '../../../../../src/logic/friendships'
import {
  UpsertFriendshipPayload,
  UpsertFriendshipResponse
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  ParsedUpsertFriendshipRequest,
  parseFriendshipRequestToFriendshipRequestResponse
} from '../../../../../src/logic/friendships'
import { FRIENDSHIP_UPDATES_CHANNEL } from '../../../../../src/adapters/pubsub'
import { createMockProfile } from '../../../../mocks/profile'
import { mockSns } from '../../../../mocks/components/sns'

jest.mock('../../../../../src/logic/friendships')

describe('upsertFriendshipService', () => {
  let upsertFriendship: ReturnType<typeof upsertFriendshipService>

  const rpcContext: RpcServerContext = { address: '0x123', subscribersContext: undefined }
  const userAddress = '0x456'
  const message = 'Hello'

  const mockRequest: UpsertFriendshipPayload = {
    action: {
      $case: 'request',
      request: { user: { address: userAddress }, message }
    }
  }

  const mockAccept: UpsertFriendshipPayload = {
    action: {
      $case: 'accept',
      accept: { user: { address: userAddress } }
    }
  }

  const mockParsedRequest: ParsedUpsertFriendshipRequest = {
    action: Action.REQUEST,
    user: userAddress,
    metadata: { message }
  }

  const mockParsedAccept: ParsedUpsertFriendshipRequest = {
    action: Action.ACCEPT,
    user: userAddress
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

  const mockSenderProfile = createMockProfile(rpcContext.address)
  const mockReceiverProfile = createMockProfile(userAddress)

  beforeEach(async () => {

    upsertFriendship = upsertFriendshipService({
      components: {
        db: mockDb,
        logs: mockLogs,
        pubsub: mockPubSub,
        catalystClient: mockCatalystClient,
        sns: mockSns
      }
    })
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

  it('should return invalidFriendshipAction for a self-request', async () => {
    const mockSelfRequest: UpsertFriendshipPayload = {
      action: {
        $case: 'request',
        request: { user: { address: rpcContext.address }, message }
      }
    }
    const mockSelfRequestParsed = {
      action: Action.REQUEST,
      user: rpcContext.address,
      metadata: { message: 'Hello' }
    }
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockSelfRequestParsed)

    const result: UpsertFriendshipResponse = await upsertFriendship(mockSelfRequest, rpcContext)

    expect(result).toEqual({
      response: {
        $case: 'invalidFriendshipAction',
        invalidFriendshipAction: {
          message: 'You cannot send a friendship request to yourself'
        }
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

    mockDb.getLastFriendshipActionByUsers.mockResolvedValueOnce(lastFriendshipAction)
    mockDb.updateFriendshipStatus.mockResolvedValueOnce({
      id: existingFriendship.id,
      created_at: new Date(existingFriendship.created_at)
    })
    mockCatalystClient.getProfiles.mockResolvedValueOnce([mockSenderProfile, mockReceiverProfile])

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
        accepted: parseFriendshipRequestToFriendshipRequestResponse(
          {
            id: lastFriendshipAction.id,
            timestamp: lastFriendshipAction.timestamp,
            metadata: mockParsedRequest.metadata
          },
          mockSenderProfile,
        )
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
    mockCatalystClient.getProfiles.mockResolvedValueOnce([mockSenderProfile, mockReceiverProfile])

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
        accepted: parseFriendshipRequestToFriendshipRequestResponse(
          {
            id: lastFriendshipAction.id,
            timestamp: lastFriendshipAction.timestamp,
            metadata: mockParsedRequest.metadata
          },
          mockSenderProfile,
        )
      }
    })
  })

  it('should publish an event after a successful friendship update', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockParsedRequest)
    jest.spyOn(FriendshipsLogic, 'validateNewFriendshipAction').mockReturnValueOnce(true)
    jest.spyOn(FriendshipsLogic, 'getNewFriendshipStatus').mockReturnValueOnce(FriendshipStatus.Friends)

    mockDb.getLastFriendshipActionByUsers.mockResolvedValueOnce(lastFriendshipAction)
    mockDb.updateFriendshipStatus.mockResolvedValueOnce({
      id: existingFriendship.id,
      created_at: new Date(existingFriendship.created_at)
    })
    mockDb.recordFriendshipAction.mockResolvedValueOnce(lastFriendshipAction.id)
    mockCatalystClient.getProfiles.mockResolvedValueOnce([mockSenderProfile, mockReceiverProfile])

    const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)

    expect(mockPubSub.publishInChannel).toHaveBeenCalledWith(FRIENDSHIP_UPDATES_CHANNEL, {
      id: lastFriendshipAction.id,
      from: rpcContext.address,
      to: userAddress,
      action: mockParsedRequest.action,
      timestamp: expect.any(Number),
      metadata: mockParsedRequest.metadata
    })
    expect(result.response.$case).toBe('accepted')
  })

  it.each([
    [Action.REQUEST, mockRequest, mockParsedRequest],
    [Action.ACCEPT, mockAccept, mockParsedAccept]
  ])('should send a notification after a successful friendship %s', async (_action, requestPayload, parsedAccept) => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(parsedAccept)
    jest.spyOn(FriendshipsLogic, 'validateNewFriendshipAction').mockReturnValueOnce(true)
    jest.spyOn(FriendshipsLogic, 'getNewFriendshipStatus').mockReturnValueOnce(FriendshipStatus.Friends)

    const [mockSenderProfile, mockReceiverProfile] = [
      createMockProfile(rpcContext.address),
      createMockProfile(userAddress)
    ]

    mockDb.getLastFriendshipActionByUsers.mockResolvedValueOnce(lastFriendshipAction)
    mockDb.updateFriendshipStatus.mockResolvedValueOnce({
      id: existingFriendship.id,
      created_at: new Date(existingFriendship.created_at)
    })
    mockDb.recordFriendshipAction.mockResolvedValueOnce(lastFriendshipAction.id)
    mockCatalystClient.getProfiles.mockResolvedValueOnce([mockSenderProfile, mockReceiverProfile])
    jest.useFakeTimers()
    await upsertFriendship(requestPayload, rpcContext)
    jest.runAllTimers()
    expect(mockSns.publishMessage).toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('should handle empty profiles gracefully', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockParsedRequest)
    jest.spyOn(FriendshipsLogic, 'validateNewFriendshipAction').mockReturnValueOnce(true)
    jest.spyOn(FriendshipsLogic, 'getNewFriendshipStatus').mockReturnValueOnce(FriendshipStatus.Friends)

    mockDb.getLastFriendshipActionByUsers.mockResolvedValueOnce(lastFriendshipAction)
    mockDb.updateFriendshipStatus.mockResolvedValueOnce({
      id: existingFriendship.id,
      created_at: new Date(existingFriendship.created_at)
    })
    mockDb.recordFriendshipAction.mockResolvedValueOnce(lastFriendshipAction.id)
    mockCatalystClient.getProfiles.mockResolvedValueOnce([null, null])
    const result: UpsertFriendshipResponse = await upsertFriendship(mockRequest, rpcContext)
    expect(result).toEqual({
      response: {
        $case: 'internalServerError',
        internalServerError: {}
      }
    })
  })

  it('should handle errors gracefully', async () => {
    jest.spyOn(FriendshipsLogic, 'parseUpsertFriendshipRequest').mockReturnValueOnce(mockParsedRequest)
    mockDb.getLastFriendshipActionByUsers.mockImplementationOnce(() => {
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
