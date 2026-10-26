import { connectAuthenticatedRpcClient } from './utils/rpc-client'
import { randomUUID } from 'crypto'
import { NotAuthorizedError } from '@dcl/http-commons'
import { CommunityRole, PrivateMessagesPrivacy } from '../../src/types'
import { CommunityVoiceChatAlreadyActiveError, CommunityVoiceChatResourceNotFoundError } from '../../src/logic/community-voice/errors'
import { test } from '../components'
import { mockCommunity } from '../mocks/communities'
import { createAuthHeaders, createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

test('Voice Chats Controller', function ({ components, spyComponents, stubComponents }) {
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

  describe.each(['unsigned', 'scene'] as const)('when the request is %s', (signer) => {
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
        const response = await components.localHttpFetch.fetch(path, {
          method,
          headers: signer === 'scene' ? createAuthHeaders(method, path, { signer: 'decentraland-kernel-scene' }, identity) : {}
        })
        await response.text()
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

    describe.each(['HTTP', 'RPC'] as const)('and a forbidden caller probes presence using %s', (transport) => {
      let connection: Awaited<ReturnType<typeof connectAuthenticatedRpcClient>> | undefined
      let presenceSpy: jest.SpyInstance
      let status: number

      afterEach(() => {
        connection?.close()
        connection = undefined
      })

      describe.each(['blocked', 'blocked-by', 'callee-private', 'caller-private'] as const)(
        'and authorization fails because of %s',
        (reason) => {
          beforeEach(async () => {
            presenceSpy = stubGatekeeper('isUserInCommunityVoiceChat', async () => true)
            if (reason === 'blocked') await components.friendsDb.blockUser(address, otherAddress)
            if (reason === 'blocked-by') await components.friendsDb.blockUser(otherAddress, address)
            if (reason === 'callee-private' || reason === 'caller-private') {
              await components.friendsDb.upsertSocialSettings(reason === 'callee-private' ? otherAddress : address, {
                private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS
              })
            }
            if (transport === 'HTTP') {
              const response = await makeRequest(identity, '/v1/private-voice-chats', 'POST', { calleeAddress: otherAddress })
              await response.text()
              status = response.status
            } else {
              connection = await connectAuthenticatedRpcClient(components, identity)
              const result = await connection.client.startPrivateVoiceChat({ callee: { address: otherAddress } })
              expect(result.response?.$case).toBe('forbiddenError')
              status = 403
            }
          })

          it('should reject before looking up presence or recording a call', async () => {
            expect(status).toBe(403)
            expect(presenceSpy).not.toHaveBeenCalled()
            expect(await components.voiceDb.getPrivateVoiceChatForCalleeAddress(otherAddress)).toBeNull()
          })
        }
      )
    })

    describe.each(['HTTP', 'RPC'] as const)('and an authorized caller checks presence using %s', (transport) => {
      let connection: Awaited<ReturnType<typeof connectAuthenticatedRpcClient>> | undefined
      let presenceSpy: jest.SpyInstance

      afterEach(() => {
        connection?.close()
        connection = undefined
      })

      describe.each(['caller', 'callee'] as const)('and the %s is in a community call', (participant) => {
        beforeEach(() => {
          presenceSpy = stubGatekeeper('isUserInCommunityVoiceChat', async (user) =>
            user === (participant === 'caller' ? address : otherAddress)
          )
        })

        it('should report a conflict without creating a private call', async () => {
          if (transport === 'HTTP') {
            const response = await makeRequest(identity, '/v1/private-voice-chats', 'POST', { calleeAddress: otherAddress })
            await response.text()
            expect(response.status).toBe(409)
          } else {
            connection = await connectAuthenticatedRpcClient(components, identity)
            expect((await connection.client.startPrivateVoiceChat({ callee: { address: otherAddress } })).response?.$case).toBe('conflictingError')
          }
          expect(presenceSpy).toHaveBeenCalled()
          expect(await components.voiceDb.getPrivateVoiceChatForCalleeAddress(otherAddress)).toBeNull()
        })
      })
    })

    describe.each(['accepted', 'rejected', 'ended'] as const)('and an outsider tries to mark a call as %s', (intention) => {
      let outsider: Identity
      let callId: string

      beforeEach(async () => {
        outsider = await createTestIdentity()
        callId = await startCall()
      })

      it('should reject access without removing the pending call', async () => {
        const response = await makeRequest(
          outsider,
          `/v1/private-voice-chats/${callId}`,
          intention === 'ended' ? 'DELETE' : 'PATCH',
          intention === 'ended' ? undefined : { intention }
        )
        await response.text()
        expect(response.status).toBe(intention === 'accepted' ? 403 : 404)
        expect(await components.voiceDb.getPrivateVoiceChatForCalleeAddress(otherAddress)).toEqual(expect.objectContaining({ id: callId }))
      })
    })

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

    describe('and HTTP starts a room without profile enrichment', () => {
      beforeEach(() => {
        stubGatekeeper('getCommunityVoiceChatStatus', async () => null)
        stubGatekeeper('createCommunityVoiceChatRoom', async () => ({ connectionUrl: 'livekit:owner' }))
        stubComponents.registry.getProfile.mockRejectedValue(new Error('Profiles unavailable'))
      })

      it('should return credentials without fetching the owner profile', async () => {
        const response = await makeRequest(identity, '/v1/community-voice-chats', 'POST', { communityId })
        expect((await response.json()).data).toEqual({ connectionUrl: 'livekit:owner' })
        expect(response.status).toBe(201)
        expect(stubComponents.registry.getProfile).not.toHaveBeenCalled()
      })
    })

    describe('and HTTP joins a room without profile enrichment', () => {
      beforeEach(() => {
        stubGatekeeper('getCommunityVoiceChatStatus', async () => ({ isActive: true, participantCount: 1, moderatorCount: 1 }))
        stubGatekeeper('getCommunityVoiceChatCredentials', async () => ({ connectionUrl: 'livekit:member' }))
        stubComponents.registry.getProfile.mockRejectedValue(new Error('Profiles unavailable'))
      })

      it('should return credentials without fetching the member profile', async () => {
        const response = await makeRequest(otherIdentity, `/v1/community-voice-chats/${communityId}/participants`, 'POST')
        expect((await response.json()).data).toEqual({ connectionUrl: 'livekit:member' })
        expect(response.status).toBe(201)
        expect(stubComponents.registry.getProfile).not.toHaveBeenCalled()
      })
    })

    describe('and an authorized promotion targets a participant who left', () => {
      beforeEach(() => {
        stubGatekeeper('promoteSpeakerInCommunityVoiceChat', async () => {
          throw new CommunityVoiceChatResourceNotFoundError(communityId)
        })
      })

      it('should respond with a 404 instead of a server error', async () => {
        const response = await makeRequest(identity, `/v1/community-voice-chats/${communityId}/speakers/${otherAddress}`, 'PUT')
        await response.text()
        expect(response.status).toBe(404)
      })
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
