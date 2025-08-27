import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Get Active Community Voice Chats Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting active community voice chats', () => {
    let identity: Identity
    let address: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/community-voice-chats/active')
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('when there are no active community voice chats', () => {
        beforeEach(async () => {
          spyComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockResolvedValue([])
        })

        it('should return empty results', async () => {
          const response = await makeRequest(identity, '/v1/community-voice-chats/active')
          expect(response.status).toBe(200)

          const data = await response.json()
          expect(data.data).toEqual({
            activeChats: [],
            total: 0
          })
        })
      })

      describe('when there are active community voice chats', () => {
        const mockActiveChats = [
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
            positions: ['10,20', '30,40', '50,60'],
            worlds: ['TestWorld'],
            participantCount: 3,
            moderatorCount: 2
          }
        ]

        beforeEach(async () => {
          spyComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockResolvedValue(mockActiveChats)
        })

        it('should return active community voice chats with membership and position info', async () => {
          const response = await makeRequest(identity, '/v1/community-voice-chats/active')
          expect(response.status).toBe(200)

          const data = await response.json()
          expect(data.data.activeChats).toHaveLength(2)
          expect(data.data.total).toBe(2)

          // Check community1 (user is member, no places)
          const community1Chat = data.data.activeChats.find((chat: any) => chat.communityId === 'community1')
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
          const community2Chat = data.data.activeChats.find((chat: any) => chat.communityId === 'community2')
          expect(community2Chat).toEqual({
            communityId: 'community2',
            communityName: 'Community 2',
            communityImage: 'image2.jpg',
            isMember: false,
            positions: ['10,20', '30,40', '50,60'],
            worlds: ['TestWorld'],
            participantCount: 3,
            moderatorCount: 2
          })
        })

        it('should call the community voice service with correct parameters', async () => {
          await makeRequest(identity, '/v1/community-voice-chats/active')

          expect(spyComponents.communityVoice.getActiveCommunityVoiceChatsForUser).toHaveBeenCalledWith(address)
        })
      })

      describe('when an error occurs in the community voice service', () => {
        beforeEach(async () => {
          spyComponents.communityVoice.getActiveCommunityVoiceChatsForUser.mockRejectedValue(
            new Error('Community voice service error')
          )
        })

        it('should return error response', async () => {
          const response = await makeRequest(identity, '/v1/community-voice-chats/active')
          expect(response.status).toBe(500)

          const data = await response.json()
          expect(data.message).toBe('Community voice service error')
        })
      })
    })
  })
})
