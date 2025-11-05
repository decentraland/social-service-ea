import {
  CommunityDeletedEvent,
  CommunityRenamedEvent,
  CommunityRequestToJoinReceivedEvent,
  CommunityDeletedContentViolationEvent,
  CommunityPostAddedEvent,
  Events
} from '@dcl/schemas'
import { CommunityRole } from '../../../src/types'
import { createCommunityBroadcasterComponent } from '../../../src/logic/community/broadcaster'
import { ICommunityBroadcasterComponent } from '../../../src/logic/community/types'
import { createSNSMockedComponent } from '../../mocks/components/sns'
import { mockCommunitiesDB } from '../../mocks/components/communities-db'
import { IPublisherComponent } from '@dcl/sns-component'

describe('Community Broadcaster Component', () => {
  let broadcasterComponent: ICommunityBroadcasterComponent
  let mockSns: jest.Mocked<IPublisherComponent>

  beforeEach(() => {
    mockSns = createSNSMockedComponent({})
    broadcasterComponent = createCommunityBroadcasterComponent({
      sns: mockSns,
      communitiesDb: mockCommunitiesDB
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when broadcasting a community deleted event', () => {
    let communityDeletedEvent: CommunityDeletedEvent

    beforeEach(() => {
      communityDeletedEvent = {
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.DELETED,
        key: 'community-deleted-123',
        timestamp: Date.now(),
        metadata: {
          id: 'community-123',
          name: 'Test Community',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          memberAddresses: []
        }
      }

      // Mock community members - create 5 members to test batching
      const mockMembers = Array.from({ length: 5 }, (_, i) => ({
        communityId: 'community-123',
        memberAddress: `0x${i.toString()}`,
        role: CommunityRole.Member,
        joinedAt: '2023-01-01T00:00:00Z'
      }))

      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockMembers)
    })

    it('should fetch all community members and publish in batches', async () => {
      await broadcasterComponent.broadcast(communityDeletedEvent)

      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith('community-123', {
        pagination: {
          limit: 100,
          offset: 0
        }
      })

      // Should create 1 batch (5 members / 100 batch size = 1 batch)
      expect(mockSns.publishMessages).toHaveBeenCalledTimes(1)
      const batchCall = mockSns.publishMessages.mock.calls[0][0]
      expect(batchCall).toHaveLength(1)

      // Check the batch
      expect(batchCall[0]).toMatchObject({
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.DELETED,
        key: 'community-deleted-123-batch-1',
        metadata: {
          id: 'community-123',
          name: 'Test Community',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          memberAddresses: expect.arrayContaining([expect.any(String)])
        }
      })

      // Verify total members are included correctly
      const totalMembersInBatches = batchCall.reduce(
        (sum, batch) => sum + (batch.metadata as any).memberAddresses.length,
        0
      )
      expect(totalMembersInBatches).toBe(5)
    })

    it('should handle pagination when fetching large member lists', async () => {
      // Mock multiple pages of members
      const firstPageMembers = Array.from({ length: 100 }, (_, i) => ({
        communityId: 'community-123',
        memberAddress: `0x${String(i)}`,
        role: CommunityRole.Member,
        joinedAt: '2023-01-01T00:00:00Z'
      }))

      const secondPageMembers = Array.from({ length: 50 }, (_, i) => ({
        communityId: 'community-123',
        memberAddress: `0x${String(i + 100)}`,
        role: CommunityRole.Member,
        joinedAt: '2023-01-01T00:00:00Z'
      }))

      mockCommunitiesDB.getCommunityMembers
        .mockResolvedValueOnce(firstPageMembers)
        .mockResolvedValueOnce(secondPageMembers)

      await broadcasterComponent.broadcast(communityDeletedEvent)

      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledTimes(2)
      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenNthCalledWith(1, 'community-123', {
        pagination: {
          limit: 100,
          offset: 0
        }
      })
      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenNthCalledWith(2, 'community-123', {
        pagination: {
          limit: 100,
          offset: 100
        }
      })
    })
  })

  describe('when broadcasting a community renamed event', () => {
    let communityRenamedEvent: CommunityRenamedEvent

    beforeEach(() => {
      communityRenamedEvent = {
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.RENAMED,
        key: 'community-renamed-123',
        timestamp: Date.now(),
        metadata: {
          id: 'community-123',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          oldName: 'Old Community Name',
          newName: 'New Community Name',
          memberAddresses: []
        }
      }

      const mockMembers = Array.from({ length: 3 }, (_, i) => ({
        communityId: 'community-123',
        memberAddress: `0x${String(i)}`,
        role: CommunityRole.Member,
        joinedAt: '2023-01-01T00:00:00Z'
      }))

      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockMembers)
    })

    it('should publish renamed event to all members in a single batch', async () => {
      await broadcasterComponent.broadcast(communityRenamedEvent)

      expect(mockSns.publishMessages).toHaveBeenCalledTimes(1)
      const batchCall = mockSns.publishMessages.mock.calls[0][0]
      expect(batchCall).toHaveLength(1)

      expect(batchCall[0]).toMatchObject({
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.RENAMED,
        key: 'community-renamed-123-batch-1',
        metadata: {
          id: 'community-123',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          oldName: 'Old Community Name',
          newName: 'New Community Name',
          memberAddresses: expect.arrayContaining([expect.any(String)])
        }
      })

      expect((batchCall[0].metadata as any).memberAddresses).toHaveLength(3)
    })
  })

  describe('when broadcasting a request to join received event', () => {
    let requestToJoinEvent: CommunityRequestToJoinReceivedEvent

    beforeEach(() => {
      requestToJoinEvent = {
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.REQUEST_TO_JOIN_RECEIVED,
        key: 'request-to-join-123',
        timestamp: Date.now(),
        metadata: {
          communityId: 'community-123',
          communityName: 'Test Community',
          memberAddress: '0x1234567890123456789012345678901234567890',
          memberName: 'Test User',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          addressesToNotify: []
        }
      }

      const mockModeratorsAndOwners = [
        {
          communityId: 'community-123',
          memberAddress: '0x111111111111111111111111111111111111111',
          role: CommunityRole.Owner,
          joinedAt: '2023-01-01T00:00:00Z'
        },
        {
          communityId: 'community-123',
          memberAddress: '0x222222222222222222222222222222222222222',
          role: CommunityRole.Moderator,
          joinedAt: '2023-01-01T00:00:00Z'
        }
      ]

      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockModeratorsAndOwners)
    })

    it('should publish to owners and moderators only', async () => {
      await broadcasterComponent.broadcast(requestToJoinEvent)

      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith('community-123', {
        pagination: {
          limit: 100,
          offset: 0
        },
        roles: [CommunityRole.Moderator, CommunityRole.Owner]
      })

      expect(mockSns.publishMessage).toHaveBeenCalledTimes(1)
      expect(mockSns.publishMessage).toHaveBeenCalledWith({
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.REQUEST_TO_JOIN_RECEIVED,
        key: 'request-to-join-123',
        timestamp: requestToJoinEvent.timestamp,
        metadata: {
          communityId: 'community-123',
          communityName: 'Test Community',
          memberAddress: '0x1234567890123456789012345678901234567890',
          memberName: 'Test User',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          addressesToNotify: ['0x111111111111111111111111111111111111111', '0x222222222222222222222222222222222222222']
        }
      })
    })
  })

  describe('when broadcasting a deleted content violation event', () => {
    let deletedContentViolationEvent: CommunityDeletedContentViolationEvent

    beforeEach(() => {
      deletedContentViolationEvent = {
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.DELETED_CONTENT_VIOLATION,
        key: 'content-violation-123',
        timestamp: Date.now(),
        metadata: {
          id: 'community-123',
          name: 'Test Community',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          ownerAddress: '0x0000000000000000000000000000000000000000'
        }
      }

      const mockMembers = Array.from({ length: 5 }, (_, i) => ({
        communityId: 'community-123',
        memberAddress: `0x${String(i)}`,
        role: i === 0 ? CommunityRole.Owner : CommunityRole.Member,
        joinedAt: '2023-01-01T00:00:00Z'
      }))

      // Mock getCommunityMembers to respect role filtering
      mockCommunitiesDB.getCommunityMembers.mockImplementation((communityId, options) => {
        const { roles } = options || {}
        if (roles) {
          return Promise.resolve(mockMembers.filter((member) => roles.includes(member.role)))
        }
        return Promise.resolve(mockMembers)
      })
    })

    it('should send two different notifications: one to owner and one to other members', async () => {
      await broadcasterComponent.broadcast(deletedContentViolationEvent)

      // Should notify the owner with the original content violation event
      expect(mockSns.publishMessage).toHaveBeenCalledTimes(1)
      expect(mockSns.publishMessage).toHaveBeenCalledWith(deletedContentViolationEvent)

      // Should notify other members with a community deleted event
      expect(mockSns.publishMessages).toHaveBeenCalledTimes(1)
      const batchCall = mockSns.publishMessages.mock.calls[0][0]
      expect(batchCall).toHaveLength(1) // 4 members (excluding owner) in 1 batch

      // Check that the event sent to members is a DELETED event, not DELETED_CONTENT_VIOLATION
      batchCall.forEach((batch, index) => {
        expect(batch).toMatchObject({
          type: Events.Type.COMMUNITY,
          subType: Events.SubType.Community.DELETED,
          key: `content-violation-123-batch-${index + 1}`,
          metadata: {
            id: 'community-123',
            name: 'Test Community',
            thumbnailUrl: 'https://example.com/thumbnail.jpg',
            memberAddresses: expect.arrayContaining([expect.any(String)])
          }
        })
      })

      // Verify that members don't include the owner
      const allMemberAddresses = batchCall.flatMap((batch) => (batch.metadata as any).memberAddresses)
      expect(allMemberAddresses).not.toContain('0x0') // Owner address
      expect(allMemberAddresses).toHaveLength(4) // Total members minus owner
    })

    it('should fetch only moderators and members (excluding owner) for the community deleted notification', async () => {
      await broadcasterComponent.broadcast(deletedContentViolationEvent)

      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith('community-123', {
        pagination: {
          limit: 100,
          offset: 0
        },
        roles: [CommunityRole.Moderator, CommunityRole.Member]
      })
    })
  })

  describe('when broadcasting a post added event', () => {
    let postAddedEvent: CommunityPostAddedEvent

    beforeEach(() => {
      postAddedEvent = {
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.POST_ADDED,
        key: 'post-123',
        timestamp: Date.now(),
        metadata: {
          postId: 'post-123',
          communityId: 'community-123',
          communityName: 'Test Community',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          authorAddress: '0x0000000000000000000000000000000000000000',
          addressesToNotify: []
        }
      }

      // Mock community members - create 5 members including the author at index 0
      const mockMembers = [
        {
          communityId: 'community-123',
          memberAddress: '0x0000000000000000000000000000000000000000', // Author
          role: CommunityRole.Member,
          joinedAt: '2023-01-01T00:00:00Z'
        },
        ...Array.from({ length: 4 }, (_, i) => ({
          communityId: 'community-123',
          memberAddress: `0x${String(i + 1).padStart(40, '0')}`,
          role: CommunityRole.Member,
          joinedAt: '2023-01-01T00:00:00Z'
        }))
      ]

      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockMembers)
    })

    it('should publish to all members except the author', async () => {
      await broadcasterComponent.broadcast(postAddedEvent)

      expect(mockCommunitiesDB.getCommunityMembers).toHaveBeenCalledWith('community-123', {
        pagination: {
          limit: 100,
          offset: 0
        }
      })

      expect(mockSns.publishMessages).toHaveBeenCalledTimes(1)
      const batchCall = mockSns.publishMessages.mock.calls[0][0]
      expect(batchCall).toHaveLength(1)

      // Check that the author is not included
      const allNotifiedAddresses = batchCall.flatMap((batch) => (batch.metadata as any).addressesToNotify)
      expect(allNotifiedAddresses).not.toContain('0x0000000000000000000000000000000000000000')
      expect(allNotifiedAddresses).toHaveLength(4) // 5 members minus 1 author

      // Check the batch structure
      expect(batchCall[0]).toMatchObject({
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.POST_ADDED,
        key: 'post-123-batch-1',
        metadata: {
          postId: 'post-123',
          communityId: 'community-123',
          communityName: 'Test Community',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          authorAddress: '0x0000000000000000000000000000000000000000',
          addressesToNotify: expect.arrayContaining([expect.any(String)])
        }
      })
    })
  })

  describe('when broadcasting other community events', () => {
    let memberRemovedEvent: any

    beforeEach(() => {
      memberRemovedEvent = {
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.MEMBER_REMOVED,
        key: 'member-removed-123',
        timestamp: Date.now(),
        metadata: {
          communityId: 'community-123',
          memberAddress: '0x1234567890123456789012345678901234567890'
        }
      }
    })

    it('should publish directly without batching for non-batch events', async () => {
      await broadcasterComponent.broadcast(memberRemovedEvent)

      expect(mockSns.publishMessage).toHaveBeenCalledTimes(1)
      expect(mockSns.publishMessage).toHaveBeenCalledWith(memberRemovedEvent)
      expect(mockSns.publishMessages).not.toHaveBeenCalled()
      expect(mockCommunitiesDB.getCommunityMembers).not.toHaveBeenCalled()
    })
  })

  describe('when handling edge cases', () => {
    it('should handle empty community member lists', async () => {
      const communityDeletedEvent: CommunityDeletedEvent = {
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.DELETED,
        key: 'community-deleted-empty',
        timestamp: Date.now(),
        metadata: {
          id: 'empty-community',
          name: 'Empty Community',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          memberAddresses: []
        }
      }

      mockCommunitiesDB.getCommunityMembers.mockResolvedValue([])

      await broadcasterComponent.broadcast(communityDeletedEvent)

      expect(mockSns.publishMessages).toHaveBeenCalledTimes(1)
      const batchCall = mockSns.publishMessages.mock.calls[0][0]
      expect(batchCall).toHaveLength(0) // No batches for empty member list
    })

    it('should handle exactly one batch worth of members', async () => {
      const communityDeletedEvent: CommunityDeletedEvent = {
        type: Events.Type.COMMUNITY,
        subType: Events.SubType.Community.DELETED,
        key: 'community-deleted-exact-batch',
        timestamp: Date.now(),
        metadata: {
          id: 'exact-batch-community',
          name: 'Exact Batch Community',
          thumbnailUrl: 'https://example.com/thumbnail.jpg',
          memberAddresses: []
        }
      }

      // Exactly 3 members (one batch)
      const mockMembers = Array.from({ length: 3 }, (_, i) => ({
        communityId: 'exact-batch-community',
        memberAddress: `0x${String(i)}`,
        role: CommunityRole.Member,
        joinedAt: '2023-01-01T00:00:00Z'
      }))

      mockCommunitiesDB.getCommunityMembers.mockResolvedValue(mockMembers)

      await broadcasterComponent.broadcast(communityDeletedEvent)

      expect(mockSns.publishMessages).toHaveBeenCalledTimes(1)
      const batchCall = mockSns.publishMessages.mock.calls[0][0]
      expect(batchCall).toHaveLength(1)
      expect((batchCall[0].metadata as any).memberAddresses).toHaveLength(3)
    })
  })
})
