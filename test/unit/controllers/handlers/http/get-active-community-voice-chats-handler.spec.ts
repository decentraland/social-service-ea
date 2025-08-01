import { getActiveCommunityVoiceChatsHandler } from '../../../../../src/controllers/handlers/http/get-active-community-voice-chats-handler'
import { CommunityRole } from '../../../../../src/types'

describe('getActiveCommunityVoiceChatsHandler', () => {
  let mockComponents: any
  let mockLogger: any
  let mockContext: any

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }

    mockComponents = {
      logs: {
        getLogger: jest.fn(() => mockLogger)
      },
      communitiesDb: {
        getCommunities: jest.fn(),
        getCommunityMemberRole: jest.fn(),
        getCommunityPlaces: jest.fn()
      },
      commsGatekeeper: {
        getCommunitiesVoiceChatStatus: jest.fn(),
        getAllActiveCommunityVoiceChats: jest.fn()
      },
      placesApi: {
        getPlaces: jest.fn()
      },
      communityThumbnail: {
        getThumbnail: jest.fn()
      }
    }

    mockContext = {
      components: mockComponents,
      verification: {
        auth: '0x1234567890abcdef'
      }
    }
  })

  describe('when there are no active community voice chats', () => {
    beforeEach(() => {
      mockComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValue([])
    })

    it('should return empty results', async () => {
      const result = await getActiveCommunityVoiceChatsHandler(mockContext)

      expect(result).toEqual({
        status: 200,
        body: {
          data: {
            activeChats: [],
            total: 0
          }
        }
      })
    })
  })

  describe('when there are active community voice chats with positions and worlds', () => {
    beforeEach(() => {
      // Mock direct response from comms-gatekeeper with active chats
      mockComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValue([
        { communityId: 'community1', participantCount: 5, moderatorCount: 1 },
        { communityId: 'community2', participantCount: 3, moderatorCount: 2 }
      ])

      // Mock getCommunities for active communities with membership info
      mockComponents.communitiesDb.getCommunities.mockResolvedValue([
        { id: 'community1', name: 'Community 1', role: CommunityRole.Member, privacy: 'public' },
        { id: 'community2', name: 'Community 2', role: CommunityRole.None, privacy: 'public' }
      ])

      // Mock places: community1 has no places, community2 has mixed positions and worlds
      mockComponents.communitiesDb.getCommunityPlaces.mockImplementation((communityId: string) => {
        if (communityId === 'community1') return Promise.resolve([])
        if (communityId === 'community2') return Promise.resolve([{ id: 'place1' }, { id: 'place2' }, { id: 'world1' }])
        return Promise.resolve([])
      })

      // Mock placesApi to return mixed positions and worlds
      mockComponents.placesApi.getPlaces.mockResolvedValue([
        { positions: ['10,20', '30,40'], world: false, world_name: '' }, // Normal place
        { positions: ['50,60'], world: false, world_name: '' }, // Normal place
        { positions: [], world: true, world_name: 'TestWorld' } // World
      ])

      mockComponents.communityThumbnail.getThumbnail.mockImplementation((communityId: string) => {
        if (communityId === 'community1') return Promise.resolve('image1.jpg')
        if (communityId === 'community2') return Promise.resolve('image2.jpg')
        return Promise.resolve(null)
      })
    })

    it('should separate positions and worlds correctly', async () => {
      const result = await getActiveCommunityVoiceChatsHandler(mockContext)

      expect(result.status).toBe(200)
      const responseData = result.body?.data as any
      expect(responseData?.activeChats).toHaveLength(2)

      // Check community1 (user is member, no places)
      const community1Chat = responseData?.activeChats.find((chat: any) => chat.communityId === 'community1')
      expect(community1Chat).toEqual({
        communityId: 'community1',
        communityName: 'Community 1',
        communityImage: 'image1.jpg',
        isMember: true,
        positions: [],
        worlds: [],
        participantCount: 5,
        moderatorCount: 1
      })

      // Check community2 (user is not member but has positions and worlds)
      const community2Chat = responseData?.activeChats.find((chat: any) => chat.communityId === 'community2')
      expect(community2Chat).toEqual({
        communityId: 'community2',
        communityName: 'Community 2',
        communityImage: 'image2.jpg',
        isMember: false,
        positions: ['10,20', '30,40', '50,60'], // Positions from normal places
        worlds: ['TestWorld'], // World names from world places
        participantCount: 3,
        moderatorCount: 2
      })

      expect(responseData?.total).toBe(2)
    })
  })

  describe('when there are active community voice chats', () => {
    beforeEach(() => {
      // Mock direct response from comms-gatekeeper with only active chats (more efficient!)
      mockComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValue([
        { communityId: 'community1', participantCount: 5, moderatorCount: 1 },
        { communityId: 'community3', participantCount: 3, moderatorCount: 2 }
      ])

      // Mock getCommunities for active communities with membership info
      mockComponents.communitiesDb.getCommunities.mockResolvedValue([
        { id: 'community1', name: 'Community 1', role: CommunityRole.Member, privacy: 'public' },
        { id: 'community3', name: 'Community 3', role: CommunityRole.None, privacy: 'public' }
      ])

      // Mock places for community3 (non-member)
      mockComponents.communitiesDb.getCommunityPlaces.mockImplementation((communityId: string) => {
        if (communityId === 'community1') return Promise.resolve([])
        if (communityId === 'community3') return Promise.resolve([{ id: 'place1' }, { id: 'place2' }])
        return Promise.resolve([])
      })

      mockComponents.placesApi.getPlaces.mockResolvedValue([
        { positions: ['10,20', '30,40'], world: false, world_name: '' },
        { positions: ['50,60'], world: false, world_name: '' }
      ])

      mockComponents.communityThumbnail.getThumbnail.mockImplementation((communityId: string) => {
        if (communityId === 'community1') return Promise.resolve('image1.jpg')
        if (communityId === 'community3') return Promise.resolve('image3.jpg')
        return Promise.resolve(null)
      })
    })

    it('should return active community voice chats with membership and position info', async () => {
      const result = await getActiveCommunityVoiceChatsHandler(mockContext)

      expect(result.status).toBe(200)
      const responseData = result.body?.data as any
      expect(responseData?.activeChats).toHaveLength(2)

      // Check community1 (user is member)
      const community1Chat = responseData?.activeChats.find((chat: any) => chat.communityId === 'community1')
      expect(community1Chat).toEqual({
        communityId: 'community1',
        communityName: 'Community 1',
        communityImage: 'image1.jpg',
        isMember: true,
        positions: [],
        worlds: [],
        participantCount: 5,
        moderatorCount: 1
      })

      // Check community3 (user is not member but has positions)
      const community3Chat = responseData?.activeChats.find((chat: any) => chat.communityId === 'community3')
      expect(community3Chat).toEqual({
        communityId: 'community3',
        communityName: 'Community 3',
        communityImage: 'image3.jpg',
        isMember: false,
        positions: ['10,20', '30,40', '50,60'],
        worlds: [],
        participantCount: 3,
        moderatorCount: 2
      })

      expect(responseData?.total).toBe(2)
    })

    it('should call the necessary services with correct parameters', async () => {
      await getActiveCommunityVoiceChatsHandler(mockContext)

      // New efficient approach: call comms-gatekeeper directly for all active chats
      expect(mockComponents.commsGatekeeper.getAllActiveCommunityVoiceChats).toHaveBeenCalledWith()

      // Only call getCommunities for active communities
      expect(mockComponents.communitiesDb.getCommunities).toHaveBeenCalledWith('0x1234567890abcdef', {
        pagination: { offset: 0, limit: 2 }, // Only active communities count
        search: undefined,
        onlyMemberOf: false,
        onlyWithActiveVoiceChat: false,
        roles: undefined,
        communityIds: ['community1', 'community3'] // Only active community IDs
      })

      expect(mockComponents.communitiesDb.getCommunityPlaces).toHaveBeenCalledTimes(2) // Only for active communities
    })
  })

  describe('when there are active voice chats but user is not member and communities have no places', () => {
    beforeEach(() => {
      // Mock direct response from comms-gatekeeper
      mockComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValue([
        { communityId: 'community1', participantCount: 5, moderatorCount: 1 }
      ])

      // Mock getCommunities: user is not a member and community is public
      mockComponents.communitiesDb.getCommunities.mockResolvedValue([
        { id: 'community1', name: 'Community 1', role: CommunityRole.None, privacy: 'public' }
      ])

      // Community has no places
      mockComponents.communitiesDb.getCommunityPlaces.mockResolvedValue([])
      mockComponents.communityThumbnail.getThumbnail.mockResolvedValue(null)
    })

    it('should filter out communities without positions for non-members', async () => {
      const result = await getActiveCommunityVoiceChatsHandler(mockContext)

      expect(result.status).toBe(200)
      const responseData = result.body?.data as any
      expect(responseData?.activeChats).toHaveLength(0)
      expect(responseData?.total).toBe(0)
    })
  })

  describe('when there are active voice chats but user is not member and communities are private', () => {
    beforeEach(() => {
      // Mock direct response from comms-gatekeeper
      mockComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockResolvedValue([
        { communityId: 'community1', participantCount: 5, moderatorCount: 1 }
      ])

      // Mock getCommunities: user is not a member and community is PRIVATE
      mockComponents.communitiesDb.getCommunities.mockResolvedValue([
        { id: 'community1', name: 'Community 1', role: CommunityRole.None, privacy: 'private' }
      ])

      // Community has places but is private
      mockComponents.communitiesDb.getCommunityPlaces.mockResolvedValue([{ id: 'place1' }])
      mockComponents.placesApi.getPlaces.mockResolvedValue([{ positions: ['10,20'], world: false, world_name: '' }])
      mockComponents.communityThumbnail.getThumbnail.mockResolvedValue('image.jpg')
    })

    it('should filter out private communities for non-members even if they have positions', async () => {
      const result = await getActiveCommunityVoiceChatsHandler(mockContext)

      expect(result.status).toBe(200)
      const responseData = result.body?.data as any
      expect(responseData?.activeChats).toHaveLength(0)
      expect(responseData?.total).toBe(0)
    })
  })

  describe('when an error occurs', () => {
    beforeEach(() => {
      // Mock error from the new efficient endpoint
      mockComponents.commsGatekeeper.getAllActiveCommunityVoiceChats.mockRejectedValue(
        new Error('Comms gatekeeper error')
      )
    })

    it('should return error response', async () => {
      const result = await getActiveCommunityVoiceChatsHandler(mockContext)

      expect(result).toEqual({
        status: 500,
        body: {
          message: 'Comms gatekeeper error'
        }
      })

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error getting active community voice chats: Comms gatekeeper error'
      )
    })
  })
})
