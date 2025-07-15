import { randomUUID } from 'node:crypto'
import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest, createAuthHeaders } from './utils/auth'
import { mockCommunity } from '../mocks/communities'

test('Community Voice Chat Actions', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('Community Voice Chat Actions', () => {
    let communityId: string
    let ownerIdentity: Identity
    let memberIdentity: Identity
    let moderatorIdentity: Identity
    let nonMemberIdentity: Identity

    beforeEach(async () => {
      ownerIdentity = await createTestIdentity()
      memberIdentity = await createTestIdentity()
      moderatorIdentity = await createTestIdentity()
      nonMemberIdentity = await createTestIdentity()

      // Create a community
      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: ownerIdentity.realAccount.address.toLowerCase()
        })
      )
      communityId = result.id

      // Add owner as a member
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Owner
      })

      // Add a member
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: memberIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Member
      })

      // Add a moderator
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: moderatorIdentity.realAccount.address.toLowerCase(),
        role: CommunityRole.Moderator
      })

      // Mock voice chat as active
      spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue({
        isActive: true,
        participantCount: 3,
        moderatorCount: 1
      })

      // Mock the new specific methods
      spyComponents.commsGatekeeper.requestToSpeakInCommunityVoiceChat.mockResolvedValue(undefined)
      spyComponents.commsGatekeeper.promoteSpeakerInCommunityVoiceChat.mockResolvedValue(undefined)
      spyComponents.commsGatekeeper.demoteSpeakerInCommunityVoiceChat.mockResolvedValue(undefined)
      spyComponents.commsGatekeeper.kickUserFromCommunityVoiceChat.mockResolvedValue(undefined)
      spyComponents.commsGatekeeper.updateUserMetadataInCommunityVoiceChat.mockResolvedValue(undefined)
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
        ownerIdentity.realAccount.address.toLowerCase(),
        memberIdentity.realAccount.address.toLowerCase(),
        moderatorIdentity.realAccount.address.toLowerCase()
      ])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    describe('Request to Speak', () => {
      const endpoint = (id: string) => `/v1/communities/${id}/voice-chat/request-to-speak`

      it('should allow a member to request to speak', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(memberIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.message).toBe('Request to speak sent successfully')
        expect(spyComponents.commsGatekeeper.updateUserMetadataInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          memberIdentity.realAccount.address.toLowerCase(),
          { isRequestingToSpeak: true }
        )
      })

      it('should not allow a user to request to speak for another user', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(ownerIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(403)
        const body = await response.json()
        expect(body.message).toBe('You can only request to speak for yourself')
      })

      it('should not allow non-members to request to speak', async () => {
        const payload = {
          userAddress: nonMemberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(nonMemberIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(404)
        const body = await response.json()
        expect(body.message).toBe('Community not found')
      })

      it('should not allow request to speak when voice chat is not active', async () => {
        spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue(null)

        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(memberIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(404)
        const body = await response.json()
        expect(body.message).toBe('Community voice chat not found or not active')
      })

      it('should require userAddress in request body', async () => {
        const response = await makeRequest(memberIdentity, endpoint(communityId), 'POST', {})

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.message).toBe('User address is required')
      })
    })

    describe('Promote Speaker', () => {
      const endpoint = (id: string) => `/v1/communities/${id}/voice-chat/promote-speaker`

      it('should allow a moderator to promote a member to speaker', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(moderatorIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.message).toBe('User promoted to speaker successfully')
        expect(spyComponents.commsGatekeeper.updateUserMetadataInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          memberIdentity.realAccount.address.toLowerCase(),
          { 
            canPublishTracks: true,
            isRequestingToSpeak: false
          }
        )
      })

      it('should allow an owner to promote a member to speaker', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(ownerIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.message).toBe('User promoted to speaker successfully')
      })

      it('should not allow a regular member to promote speakers', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(memberIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(403)
        const body = await response.json()
        expect(body.message).toBe('You do not have permission to promote speakers')
      })

      it('should not allow promoting non-members', async () => {
        const payload = {
          userAddress: nonMemberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(moderatorIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(403)
        const body = await response.json()
        expect(body.message).toBe('Target user is not a member of the community')
      })

      it('should not allow promoting when voice chat is not active', async () => {
        spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue(null)

        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(moderatorIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(404)
        const body = await response.json()
        expect(body.message).toBe('Community voice chat not found or not active')
      })
    })

    describe('Demote Speaker', () => {
      const endpoint = (id: string) => `/v1/communities/${id}/voice-chat/demote-speaker`

      it('should allow a moderator to demote a speaker to listener', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(moderatorIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.message).toBe('User demoted to listener successfully')
        expect(spyComponents.commsGatekeeper.updateUserMetadataInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          memberIdentity.realAccount.address.toLowerCase(),
          { 
            canPublishTracks: false,
            isRequestingToSpeak: false
          }
        )
      })

      it('should allow an owner to demote a speaker to listener', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(ownerIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.message).toBe('User demoted to listener successfully')
      })

      it('should not allow a regular member to demote speakers', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(memberIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(403)
        const body = await response.json()
        expect(body.message).toBe('You do not have permission to demote speakers')
      })
    })

    describe('Kick Player', () => {
      const endpoint = (id: string) => `/v1/communities/${id}/voice-chat/kick-player`

      it('should allow a moderator to kick a player', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(moderatorIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.message).toBe('User kicked from voice chat successfully')
        expect(spyComponents.commsGatekeeper.kickUserFromCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          memberIdentity.realAccount.address.toLowerCase()
        )
      })

      it('should allow an owner to kick a player', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(ownerIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.message).toBe('User kicked from voice chat successfully')
      })

      it('should not allow a regular member to kick players', async () => {
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(memberIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(403)
        const body = await response.json()
        expect(body.message).toBe('You do not have permission to kick players')
      })

      it('should not allow kicking non-members', async () => {
        const payload = {
          userAddress: nonMemberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(moderatorIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(403)
        const body = await response.json()
        expect(body.message).toBe('Target user is not a member of the community')
      })

      it('should not allow kicking when voice chat is not active', async () => {
        spyComponents.commsGatekeeper.getCommunityVoiceChatStatus.mockResolvedValue(null)

        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(moderatorIdentity, endpoint(communityId), 'POST', payload)

        expect(response.status).toBe(404)
        const body = await response.json()
        expect(body.message).toBe('Community voice chat not found or not active')
      })
    })

    describe('Error Handling', () => {
      it('should handle invalid request bodies', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/voice-chat/request-to-speak`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...createAuthHeaders('POST', `/v1/communities/${communityId}/voice-chat/request-to-speak`, {}, memberIdentity)
          },
          body: '{"invalid": json}'
        })

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.message).toBe('Invalid request body')
      })

      it('should handle non-existent community', async () => {
        const nonExistentCommunity = randomUUID()
        const payload = {
          userAddress: memberIdentity.realAccount.address.toLowerCase()
        }

        const response = await makeRequest(memberIdentity, `/v1/communities/${nonExistentCommunity}/voice-chat/request-to-speak`, 'POST', payload)

        expect(response.status).toBe(404)
        const body = await response.json()
        expect(body.message).toBe('Community not found')
      })
    })
  })
}) 