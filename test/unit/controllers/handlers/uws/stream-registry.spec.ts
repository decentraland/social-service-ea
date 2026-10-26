import {
  CommunityVoiceChatStatus,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import {
  createStreamRegistry,
  toBlockStreamEvent,
  toCommunityMemberConnectivityStreamEvent,
  toCommunityVoiceChatStreamEvent,
  toFriendConnectivityStreamEvent,
  toFriendshipStreamEvent,
  toPrivateVoiceChatStreamEvent
} from '../../../../../src/controllers/handlers/uws/stream-registry'
import { VoiceChatStatus } from '../../../../../src/logic/voice/types'
import { Action, RpcServerContext } from '../../../../../src/types'

const USER_ADDRESS = '0x1234567890123456789012345678901234567890'
const OTHER_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

describe('when mapping a friendship update', () => {
  describe('and it is a request', () => {
    it('should carry the request, its message and the requester address, without a profile', () => {
      expect(
        toFriendshipStreamEvent({
          id: 'request-id',
          from: OTHER_ADDRESS,
          to: USER_ADDRESS,
          action: Action.REQUEST,
          timestamp: 1000,
          metadata: { message: 'hi' }
        })
      ).toEqual({
        action: 'request',
        id: 'request-id',
        address: OTHER_ADDRESS,
        createdAt: 1000,
        message: 'hi'
      })
    })
  })

  describe.each([Action.ACCEPT, Action.REJECT, Action.CANCEL, Action.DELETE, Action.BLOCK])(
    'and it is a %s',
    (action) => {
      it('should carry only the action and who did it', () => {
        expect(
          toFriendshipStreamEvent({ id: 'id', from: OTHER_ADDRESS, to: USER_ADDRESS, action, timestamp: 1000 })
        ).toEqual({ action, address: OTHER_ADDRESS })
      })
    }
  )
})

describe('when mapping a friend connectivity update', () => {
  it.each([
    [ConnectivityStatus.ONLINE, 'online'],
    [ConnectivityStatus.OFFLINE, 'offline'],
    [ConnectivityStatus.AWAY, 'away']
  ])('should carry the friend address and name the status %s as %s', (status, name) => {
    expect(toFriendConnectivityStreamEvent({ address: OTHER_ADDRESS, status })).toEqual({
      address: OTHER_ADDRESS,
      status: name
    })
  })

  it('should drop an unknown status', () => {
    expect(toFriendConnectivityStreamEvent({ address: OTHER_ADDRESS, status: ConnectivityStatus.UNRECOGNIZED })).toBeNull()
  })
})

describe('when mapping a block update', () => {
  it('should carry who blocked the user and whether the block is on', () => {
    expect(toBlockStreamEvent({ blockerAddress: OTHER_ADDRESS, blockedAddress: USER_ADDRESS, isBlocked: false })).toEqual(
      { address: OTHER_ADDRESS, isBlocked: false }
    )
  })
})

describe('when mapping a private voice chat update', () => {
  describe('and the call is requested', () => {
    it('should carry the caller', () => {
      expect(
        toPrivateVoiceChatStreamEvent({
          callId: 'call',
          status: VoiceChatStatus.REQUESTED,
          callerAddress: OTHER_ADDRESS,
          calleeAddress: USER_ADDRESS
        })
      ).toEqual({ callId: 'call', status: 'requested', callerAddress: OTHER_ADDRESS })
    })
  })

  describe('and the call is accepted with credentials', () => {
    it('should carry the credentials but not the caller', () => {
      expect(
        toPrivateVoiceChatStreamEvent({
          callId: 'call',
          status: VoiceChatStatus.ACCEPTED,
          callerAddress: USER_ADDRESS,
          calleeAddress: OTHER_ADDRESS,
          credentials: { connectionUrl: 'livekit:caller' }
        })
      ).toEqual({ callId: 'call', status: 'accepted', connectionUrl: 'livekit:caller' })
    })
  })
})

describe('when mapping a community member connectivity update', () => {
  it('should carry the community, the member and the status name', () => {
    expect(
      toCommunityMemberConnectivityStreamEvent({
        communityId: 'community',
        memberAddress: OTHER_ADDRESS,
        status: ConnectivityStatus.ONLINE
      })
    ).toEqual({ communityId: 'community', memberAddress: OTHER_ADDRESS, status: 'online' })
  })
})

describe('when mapping a community voice chat update', () => {
  it('should name the status and keep the optional fields only when present', () => {
    expect(
      toCommunityVoiceChatStreamEvent({
        communityId: 'community',
        createdAt: 1000,
        status: CommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_STARTED,
        positions: ['1,1'],
        worlds: [],
        isMember: true,
        communityName: 'Community'
      })
    ).toEqual({
      communityId: 'community',
      status: 'started',
      createdAt: 1000,
      positions: ['1,1'],
      worlds: [],
      isMember: true,
      communityName: 'Community'
    })
  })

  it('should carry when an ended voice chat ended', () => {
    expect(
      toCommunityVoiceChatStreamEvent({
        communityId: 'community',
        createdAt: 1000,
        endedAt: 2000,
        status: CommunityVoiceChatStatus.COMMUNITY_VOICE_CHAT_ENDED,
        positions: [],
        worlds: [],
        isMember: false,
        communityName: ''
      })
    ).toEqual(expect.objectContaining({ status: 'ended', endedAt: 2000 }))
  })
})

describe('when opening the streams', () => {
  let handleSubscriptionUpdates: jest.Mock
  let streams: ReturnType<typeof createStreamRegistry>
  let context: RpcServerContext
  let friendsDb: { getOnlineFriends: jest.Mock }
  let peersStats: { getConnectedPeers: jest.Mock }

  beforeEach(() => {
    handleSubscriptionUpdates = jest.fn().mockReturnValue((async function* () {})())
    friendsDb = { getOnlineFriends: jest.fn() }
    peersStats = { getConnectedPeers: jest.fn() }
    streams = createStreamRegistry({
      updateHandler: { handleSubscriptionUpdates } as any,
      friendsDb: friendsDb as any,
      peersStats: peersStats as any
    })
    context = { address: USER_ADDRESS, wsConnectionId: 'connection', subscribersContext: {} as any }
  })

  it.each([
    ['friendship_updates', 'friendshipUpdate'],
    ['friend_connectivity_updates', 'friendConnectivityUpdate'],
    ['block_updates', 'blockUpdate'],
    ['private_voice_chat_updates', 'privateVoiceChatUpdate'],
    ['community_member_connectivity_updates', 'communityMemberConnectivityUpdate'],
    ['community_voice_chat_updates', 'communityVoiceChatUpdate']
  ])('should subscribe %s to the %s updates of the connection', (stream, eventName) => {
    streams[stream].open(context)

    expect(handleSubscriptionUpdates).toHaveBeenCalledWith(expect.objectContaining({ rpcContext: context, eventName }))
  })

  it.each(['friendship_updates', 'friend_connectivity_updates'])(
    'should not resolve profiles for the %s updates',
    (stream) => {
      streams[stream].open(context)

      expect(handleSubscriptionUpdates.mock.calls[0][0].shouldRetrieveProfile).toBeFalsy()
    }
  )

  describe('and the stream is friendship_updates', () => {
    it('should only handle updates other users send to the connection user', () => {
      streams.friendship_updates.open(context)
      const { shouldHandleUpdate } = handleSubscriptionUpdates.mock.calls[0][0]

      expect(shouldHandleUpdate({ from: OTHER_ADDRESS, to: USER_ADDRESS })).toBe(true)
      expect(shouldHandleUpdate({ from: USER_ADDRESS, to: OTHER_ADDRESS })).toBe(false)
      expect(shouldHandleUpdate({ from: OTHER_ADDRESS, to: '0x0' })).toBe(false)
    })
  })

  describe('and the stream is block_updates', () => {
    it('should only handle blocks of the connection user', () => {
      streams.block_updates.open(context)
      const { shouldHandleUpdate } = handleSubscriptionUpdates.mock.calls[0][0]

      expect(shouldHandleUpdate({ blockerAddress: OTHER_ADDRESS, blockedAddress: USER_ADDRESS })).toBe(true)
      expect(shouldHandleUpdate({ blockerAddress: OTHER_ADDRESS, blockedAddress: '0x0' })).toBe(false)
    })
  })

  describe('and the stream is friend_connectivity_updates', () => {
    beforeEach(() => {
      peersStats.getConnectedPeers.mockResolvedValue([OTHER_ADDRESS])
      friendsDb.getOnlineFriends.mockResolvedValue([{ address: OTHER_ADDRESS }])
    })

    it('should start with the friends that are already online', async () => {
      streams.friend_connectivity_updates.open(context)
      const { getInitialUpdates } = handleSubscriptionUpdates.mock.calls[0][0]

      await expect(getInitialUpdates()).resolves.toEqual([{ address: OTHER_ADDRESS, status: 'online' }])
      expect(friendsDb.getOnlineFriends).toHaveBeenCalledWith(USER_ADDRESS, [OTHER_ADDRESS])
    })

    it('should not handle the connectivity of the connection user', () => {
      streams.friend_connectivity_updates.open(context)
      const { shouldHandleUpdate } = handleSubscriptionUpdates.mock.calls[0][0]

      expect(shouldHandleUpdate({ address: USER_ADDRESS })).toBe(false)
      expect(shouldHandleUpdate({ address: OTHER_ADDRESS })).toBe(true)
    })
  })
})
