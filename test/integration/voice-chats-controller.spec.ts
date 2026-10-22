import { randomUUID } from 'crypto'
import { NotAuthorizedError } from '@dcl/http-commons'
import { CommunityRole } from '../../src/types'
import { CommunityVoiceChatAlreadyActiveError } from '../../src/logic/community-voice/errors'
import { test } from '../components'
import { mockCommunity } from '../mocks/communities'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Voice Chats Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  let identity: Identity
  let address: string
  let otherIdentity: Identity
  let otherAddress: string
  let gatekeeperSpies: jest.SpyInstance[]

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
    otherIdentity = await createTestIdentity()
    otherAddress = otherIdentity.realAccount.address.toLowerCase()
    gatekeeperSpies = []
  })

  afterEach(() => {
    gatekeeperSpies.forEach((spy) => spy.mockRestore())
  })

  function stubGatekeeper<K extends keyof typeof components.commsGatekeeper>(
    method: K,
    implementation: (...args: any[]) => Promise<any>
  ): jest.SpyInstance {
    const spy = jest.spyOn(components.commsGatekeeper, method as any).mockImplementation(implementation as any)
    gatekeeperSpies.push(spy)
    return spy
  }

  describe('when the request is not signed', () => {
    it('should respond with a 400 status code on every voice chat endpoint', async () => {
      const callId = randomUUID()
      const communityId = randomUUID()
      const routes: [string, string][] = [
        ['POST', '/v1/private-voice-chats'],
        ['GET', '/v1/private-voice-chats/incoming'],
        ['PATCH', `/v1/private-voice-chats/${callId}`],
        ['DELETE', `/v1/private-voice-chats/${callId}`],
        ['POST', '/v1/community-voice-chats'],
        ['DELETE', `/v1/community-voice-chats/${communityId}`],
        ['POST', `/v1/community-voice-chats/${communityId}/participants`],
        ['DELETE', `/v1/community-voice-chats/${communityId}/participants/${otherAddress}`],
        ['PUT', `/v1/community-voice-chats/${communityId}/speakers/${otherAddress}`],
        ['PATCH', `/v1/community-voice-chats/${communityId}/speakers/${otherAddress}`],
        ['DELETE', `/v1/community-voice-chats/${communityId}/speakers/${otherAddress}`],
        ['POST', `/v1/community-voice-chats/${communityId}/speak-requests`],
        ['DELETE', `/v1/community-voice-chats/${communityId}/speak-requests/${otherAddress}`]
      ]

      for (const [method, path] of routes) {
        const response = await components.localHttpFetch.fetch(path, { method })
        expect({ method, path, status: response.status }).toEqual({ method, path, status: 400 })
      }
    })
  })

  describe('when handling private voice chats', () => {
    beforeEach(() => {
      stubGatekeeper('isUserInCommunityVoiceChat', async () => false)
      stubGatekeeper('isUserInAVoiceChat', async () => false)
      stubGatekeeper('endPrivateVoiceChat', async () => undefined)
    })

    async function startCall(): Promise<string> {
      const response = await makeRequest(identity, '/v1/private-voice-chats', 'POST', { calleeAddress: otherAddress })
      expect(response.status).toBe(201)
      return (await response.json()).data.callId
    }

    describe('and the caller starts a call', () => {
      it('should show it as the incoming call of the callee', async () => {
        const callId = await startCall()

        const response = await makeRequest(otherIdentity, '/v1/private-voice-chats/incoming')

        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual({ callId, callerAddress: address })
      })
    })

    describe('and the callee accepts the call', () => {
      beforeEach(() => {
        stubGatekeeper('getPrivateVoiceChatCredentials', async () => ({
          [address]: { connectionUrl: 'livekit:caller' },
          [otherAddress]: { connectionUrl: 'livekit:callee' }
        }))
      })

      it('should respond with the credentials of the callee', async () => {
        const callId = await startCall()

        const response = await makeRequest(otherIdentity, `/v1/private-voice-chats/${callId}`, 'PATCH', {
          intention: 'accepted'
        })

        expect(response.status).toBe(200)
        expect((await response.json()).data).toEqual({ callId, connectionUrl: 'livekit:callee' })
      })
    })

    describe('and the caller tries to accept their own call', () => {
      it('should respond with a 403 status code', async () => {
        const callId = await startCall()

        const response = await makeRequest(identity, `/v1/private-voice-chats/${callId}`, 'PATCH', {
          intention: 'accepted'
        })

        expect(response.status).toBe(403)
      })
    })

    describe('and the callee rejects the call', () => {
      it('should respond with a 204 and leave no incoming call', async () => {
        const callId = await startCall()

        const response = await makeRequest(otherIdentity, `/v1/private-voice-chats/${callId}`, 'PATCH', {
          intention: 'rejected'
        })

        expect(response.status).toBe(204)
        const incoming = await makeRequest(otherIdentity, '/v1/private-voice-chats/incoming')
        expect(incoming.status).toBe(404)
      })
    })

    describe('and the caller ends the call', () => {
      it('should respond with a 204', async () => {
        const callId = await startCall()

        const response = await makeRequest(identity, `/v1/private-voice-chats/${callId}`, 'DELETE')

        expect(response.status).toBe(204)
      })
    })

    describe('and the callee is already being called', () => {
      it('should respond with a 409 status code', async () => {
        await startCall()
        const thirdIdentity = await createTestIdentity()

        const response = await makeRequest(thirdIdentity, '/v1/private-voice-chats', 'POST', {
          calleeAddress: otherAddress
        })

        expect(response.status).toBe(409)
      })
    })

    describe('and the callee is in a community voice chat', () => {
      beforeEach(() => {
        stubGatekeeper('isUserInCommunityVoiceChat', async (userAddress: string) => userAddress === otherAddress)
      })

      it('should respond with a 409 status code', async () => {
        const response = await makeRequest(identity, '/v1/private-voice-chats', 'POST', { calleeAddress: otherAddress })

        expect(response.status).toBe(409)
      })
    })

    describe('and the user has no incoming call', () => {
      it('should respond with a 404 status code', async () => {
        const response = await makeRequest(identity, '/v1/private-voice-chats/incoming')

        expect(response.status).toBe(404)
      })
    })

    describe('and the call does not exist', () => {
      it('should respond with a 404 status code', async () => {
        const response = await makeRequest(otherIdentity, `/v1/private-voice-chats/${randomUUID()}`, 'PATCH', {
          intention: 'accepted'
        })

        expect(response.status).toBe(404)
      })
    })

    describe('and the call id is not a UUID', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(identity, '/v1/private-voice-chats/not-a-call', 'DELETE')

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when handling community voice chats', () => {
    let communityId: string
    let memberAddress: string

    beforeEach(async () => {
      memberAddress = (await createTestIdentity()).realAccount.address.toLowerCase()
      const community = await components.communitiesDb.createCommunity(
        mockCommunity({ name: 'Voice Community', description: 'Voice', owner_address: address })
      )
      communityId = community.id
      await components.communitiesDb.addCommunityMember({ communityId, memberAddress: address, role: CommunityRole.Owner })
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: otherAddress,
        role: CommunityRole.Member
      })
      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress,
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [address, otherAddress, memberAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    describe('and the owner promotes a member (PUT /speakers/:address)', () => {
      let promoteSpy: jest.SpyInstance

      beforeEach(() => {
        promoteSpy = stubGatekeeper('promoteSpeakerInCommunityVoiceChat', async () => undefined)
      })

      it('should respond with a 204 and promote them in Gatekeeper', async () => {
        const response = await makeRequest(
          identity,
          `/v1/community-voice-chats/${communityId}/speakers/${otherAddress}`,
          'PUT'
        )

        expect(response.status).toBe(204)
        expect(promoteSpy).toHaveBeenCalledWith(communityId, otherAddress)
      })
    })

    describe('and a plain member tries to promote another member', () => {
      let promoteSpy: jest.SpyInstance

      beforeEach(() => {
        promoteSpy = stubGatekeeper('promoteSpeakerInCommunityVoiceChat', async () => undefined)
      })

      it('should respond with a 403 status code without promoting anyone', async () => {
        const response = await makeRequest(
          otherIdentity,
          `/v1/community-voice-chats/${communityId}/speakers/${memberAddress}`,
          'PUT'
        )

        expect(response.status).toBe(403)
        expect(promoteSpy).not.toHaveBeenCalled()
      })
    })

    describe('and a member demotes themselves (DELETE /speakers/:address)', () => {
      let demoteSpy: jest.SpyInstance

      beforeEach(() => {
        demoteSpy = stubGatekeeper('demoteSpeakerInCommunityVoiceChat', async () => undefined)
      })

      it('should respond with a 204', async () => {
        const response = await makeRequest(
          otherIdentity,
          `/v1/community-voice-chats/${communityId}/speakers/${otherAddress}`,
          'DELETE'
        )

        expect(response.status).toBe(204)
        expect(demoteSpy).toHaveBeenCalledWith(communityId, otherAddress)
      })
    })

    describe('and the owner kicks a participant (DELETE /participants/:address)', () => {
      let kickSpy: jest.SpyInstance

      beforeEach(() => {
        kickSpy = stubGatekeeper('kickUserFromCommunityVoiceChat', async () => undefined)
      })

      it('should respond with a 204 and kick them in Gatekeeper', async () => {
        const response = await makeRequest(
          identity,
          `/v1/community-voice-chats/${communityId}/participants/${otherAddress}`,
          'DELETE'
        )

        expect(response.status).toBe(204)
        expect(kickSpy).toHaveBeenCalledWith(communityId, otherAddress)
      })
    })

    describe('and a member tries to kick the owner', () => {
      it('should respond with a 403 status code', async () => {
        stubGatekeeper('kickUserFromCommunityVoiceChat', async () => undefined)

        const response = await makeRequest(
          otherIdentity,
          `/v1/community-voice-chats/${communityId}/participants/${address}`,
          'DELETE'
        )

        expect(response.status).toBe(403)
      })
    })

    describe('and the owner rejects the speak request of a member (DELETE /speak-requests/:address)', () => {
      let rejectSpy: jest.SpyInstance

      beforeEach(() => {
        rejectSpy = stubGatekeeper('rejectSpeakRequestInCommunityVoiceChat', async () => undefined)
      })

      it('should respond with a 204 and reject it in Gatekeeper', async () => {
        const response = await makeRequest(
          identity,
          `/v1/community-voice-chats/${communityId}/speak-requests/${otherAddress}`,
          'DELETE'
        )

        expect(response.status).toBe(204)
        expect(rejectSpy).toHaveBeenCalledWith(communityId, otherAddress)
      })
    })

    describe('and a member lowers their own hand', () => {
      beforeEach(() => {
        spyComponents.communityVoice.requestToSpeakInCommunityVoiceChat.mockResolvedValueOnce(undefined)
      })

      it('should respond with a 204 and lower the hand instead of rejecting', async () => {
        const response = await makeRequest(
          otherIdentity,
          `/v1/community-voice-chats/${communityId}/speak-requests/${otherAddress}`,
          'DELETE'
        )

        expect(response.status).toBe(204)
        expect(spyComponents.communityVoice.requestToSpeakInCommunityVoiceChat).toHaveBeenCalledWith(
          communityId,
          otherAddress,
          false
        )
      })
    })

    describe('and the voice chat is already active when starting it', () => {
      beforeEach(() => {
        spyComponents.communityVoice.startCommunityVoiceChat.mockRejectedValueOnce(
          new CommunityVoiceChatAlreadyActiveError(communityId)
        )
      })

      it('should respond with a 409 status code', async () => {
        const response = await makeRequest(identity, '/v1/community-voice-chats', 'POST', { communityId })

        expect(response.status).toBe(409)
      })
    })

    describe('and a banned user tries to join', () => {
      beforeEach(() => {
        spyComponents.communityVoice.joinCommunityVoiceChat.mockRejectedValueOnce(new NotAuthorizedError('banned'))
      })

      it('should respond with a 403 status code', async () => {
        const response = await makeRequest(otherIdentity, `/v1/community-voice-chats/${communityId}/participants`, 'POST')

        expect(response.status).toBe(403)
      })
    })

    describe('and the voice chat to end is not active', () => {
      beforeEach(() => {
        stubGatekeeper('getCommunityVoiceChatStatus', async () => ({
          isActive: false,
          participantCount: 0,
          moderatorCount: 0
        }))
      })

      it('should respond with a 404 status code', async () => {
        const response = await makeRequest(identity, `/v1/community-voice-chats/${communityId}`, 'DELETE')

        expect(response.status).toBe(404)
      })
    })

    describe('and the mute body is not valid', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(
          identity,
          `/v1/community-voice-chats/${communityId}/speakers/${otherAddress}`,
          'PATCH',
          { muted: 'yes' }
        )

        expect(response.status).toBe(400)
      })
    })

    describe('and the community id is not a UUID', () => {
      it('should respond with a 400 status code', async () => {
        const response = await makeRequest(
          identity,
          `/v1/community-voice-chats/active/speakers/${otherAddress}`,
          'PUT'
        )

        expect(response.status).toBe(400)
      })
    })
  })
})
