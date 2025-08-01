import { getActiveCommunityVoiceChatsHandler } from '../../../../../src/controllers/handlers/http/get-active-community-voice-chats-handler'

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
      communityVoice: {
        getActiveCommunityVoiceChatsForUser: jest.fn()
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
      mockComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockResolvedValue([])
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
      // Mock the final response from communityVoice.getActiveCommunityVoiceChatsForUser
      mockComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockResolvedValue([
        {
          communityId: 'community1',
          communityName: 'Community 1',
          communityImage: 'image1.jpg',
          isMember: true,
          positions: [],
          worlds: [],
          participantCount: 5,
          moderatorCount: 1
        },
        {
          communityId: 'community2',
          communityName: 'Community 2',
          communityImage: 'image2.jpg',
          isMember: false,
          positions: ['10,20', '30,40', '50,60'], // Positions from normal places
          worlds: ['TestWorld'], // World names from world places
          participantCount: 3,
          moderatorCount: 2
        }
      ])
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
      // Mock the final response from communityVoice.getActiveCommunityVoiceChatsForUser
      mockComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockResolvedValue([
        {
          communityId: 'community1',
          communityName: 'Community 1',
          communityImage: 'image1.jpg',
          isMember: true,
          positions: [],
          worlds: [],
          participantCount: 5,
          moderatorCount: 1
        },
        {
          communityId: 'community3',
          communityName: 'Community 3',
          communityImage: 'image3.jpg',
          isMember: false,
          positions: ['10,20', '30,40', '50,60'],
          worlds: [],
          participantCount: 3,
          moderatorCount: 2
        }
      ])
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

      // Verify that the communityVoice component is called with the correct user address
      expect(mockComponents.communityVoice.getActiveCommunityVoiceChatsForUser).toHaveBeenCalledWith(
        '0x1234567890abcdef'
      )
    })
  })

  describe('when there are active voice chats but user is not member and communities have no places', () => {
    beforeEach(() => {
      // Mock empty response - community with no places for non-member gets filtered out
      mockComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockResolvedValue([])
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
      // Mock empty response - private communities for non-members get filtered out
      mockComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockResolvedValue([])
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
      // Mock error from communityVoice component
      mockComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockRejectedValue(
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
        'Failed to get active community voice chats: Comms gatekeeper error'
      )
    })
  })
})
