import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { randomUUID } from 'crypto'
import { Events } from '@dcl/schemas'

test('Remove Member from Community Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when removing a member from a community', () => {
    let identity: Identity
    let kickerAddress: string
    let communityId: string
    const communityName = 'Test Community'
    let targetMemberAddress: string
    let targetModeratorAddress: string
    let targetOwnerAddress: string
    let nonMemberAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      kickerAddress = identity.realAccount.address.toLowerCase()
      targetMemberAddress = '0x0000000000000000000000000000000000000001'
      targetModeratorAddress = '0x0000000000000000000000000000000000000002'
      targetOwnerAddress = '0x0000000000000000000000000000000000000003'
      nonMemberAddress = '0x0000000000000000000000000000000000000004'

      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: communityName,
          description: 'Test Description',
          owner_address: targetOwnerAddress
        })
      )
      communityId = result.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: targetOwnerAddress,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: targetModeratorAddress,
        role: CommunityRole.Moderator
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: targetMemberAddress,
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [
        kickerAddress,
        targetMemberAddress,
        targetModeratorAddress,
        targetOwnerAddress,
        nonMemberAddress
      ])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/members/${targetMemberAddress}`, {
          method: 'DELETE'
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(
            identity,
            `/v1/communities/${nonExistentId}/members/${targetMemberAddress}`,
            'DELETE'
          )
          expect(response.status).toBe(404)
        })
      })

      describe('and the address is invalid', () => {
        it('should respond with a 400 status code when trying to remove with an invalid address', async () => {
          const response = await makeRequest(
            identity,
            `/v1/communities/${communityId}/members/invalid-address`,
            'DELETE'
          )
          expect(response.status).toBe(400)
        })
      })

      describe('and the community exists', () => {
        describe('and the user is trying to leave', () => {
          let ownerAddress: string
          let ownerIdentity: Identity

          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: kickerAddress,
              role: CommunityRole.Member
            })

            ownerIdentity = await createTestIdentity()
            ownerAddress = ownerIdentity.realAccount.address.toLowerCase()

            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: ownerAddress,
              role: CommunityRole.Owner
            })
          })

          it('should allow a member to leave', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${kickerAddress}`,
              'DELETE'
            )
            expect(response.status).toBe(204)

            const isMember = await components.communitiesDb.isMemberOfCommunity(communityId, kickerAddress)
            expect(isMember).toBe(false)
          })

          it('should not allow an owner to leave', async () => {
            const response = await makeRequest(
              ownerIdentity,
              `/v1/communities/${communityId}/members/${ownerAddress}`,
              'DELETE'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The owner cannot leave the community ${communityId}`
            })
          })
        })

        describe('and the user is trying to kick someone else', () => {
          describe('and the kicker is not a member of the community', () => {
            it('should respond with a 401 status code', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${targetMemberAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(401)
              const body = await response.json()
              expect(body).toEqual({
                error: 'Not Authorized',
                message: `The user ${kickerAddress} doesn't have permission to kick ${targetMemberAddress} from community ${communityId}`
              })
            })
          })

          describe('and the target user is not a member of the community', () => {
            beforeEach(async () => {
              await components.communitiesDb.addCommunityMember({
                communityId,
                memberAddress: kickerAddress,
                role: CommunityRole.Moderator
              })
            })

            it('should respond with a 204 status code', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${nonMemberAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(204)
            })
          })

          describe('and the kicker is a member of the community', () => {
            beforeEach(async () => {
              await components.communitiesDb.addCommunityMember({
                communityId,
                memberAddress: kickerAddress,
                role: CommunityRole.Member
              })
            })

            it('should respond with a 401 status code when trying to kick another member', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${targetMemberAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(401)
              const body = await response.json()
              expect(body).toEqual({
                error: 'Not Authorized',
                message: `The user ${kickerAddress} doesn't have permission to kick ${targetMemberAddress} from community ${communityId}`
              })
            })
          })

          describe('and the kicker is a moderator of the community', () => {
            beforeEach(async () => {
              await components.communitiesDb.addCommunityMember({
                communityId,
                memberAddress: kickerAddress,
                role: CommunityRole.Moderator
              })
            })

            it('should respond with a 204 status code when kicking a member', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${targetMemberAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(204)
            })

            it('should publish event to notify member kick', async () => {
              await makeRequest(identity, `/v1/communities/${communityId}/members/${targetMemberAddress}`, 'DELETE')

              // Wait for any setImmediate callbacks to complete
              await new Promise((resolve) => setImmediate(resolve))

              expect(spyComponents.communityBroadcaster.broadcast).toHaveBeenCalledWith({
                type: Events.Type.COMMUNITY,
                subType: Events.SubType.Community.MEMBER_REMOVED,
                key: expect.stringContaining(`${communityId}-${targetMemberAddress}-`),
                timestamp: expect.any(Number),
                metadata: {
                  id: communityId,
                  name: communityName,
                  memberAddress: targetMemberAddress,
                  thumbnailUrl: expect.stringContaining(`/social/communities/${communityId}/raw-thumbnail.png`)
                }
              })
            })

            it('should respond with a 401 status code when trying to kick another moderator', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${targetModeratorAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(401)
              const body = await response.json()
              expect(body).toEqual({
                error: 'Not Authorized',
                message: `The user ${kickerAddress} doesn't have permission to kick ${targetModeratorAddress} from community ${communityId}`
              })
            })

            it('should respond with a 401 status code when trying to kick an owner', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${targetOwnerAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(401)
              const body = await response.json()
              expect(body).toEqual({
                error: 'Not Authorized',
                message: `The user ${kickerAddress} doesn't have permission to kick ${targetOwnerAddress} from community ${communityId}`
              })
            })
          })

          describe('and the kicker is the owner of the community', () => {
            beforeEach(async () => {
              await components.communitiesDb.addCommunityMember({
                communityId,
                memberAddress: kickerAddress,
                role: CommunityRole.Owner
              })
            })

            it('should respond with a 204 status code when kicking a member', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${targetMemberAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(204)
            })

            it('should publish event to notify member kick', async () => {
              await makeRequest(identity, `/v1/communities/${communityId}/members/${targetMemberAddress}`, 'DELETE')

              // Wait for any setImmediate callbacks to complete
              await new Promise((resolve) => setImmediate(resolve))

              expect(spyComponents.communityBroadcaster.broadcast).toHaveBeenCalledWith({
                type: Events.Type.COMMUNITY,
                subType: Events.SubType.Community.MEMBER_REMOVED,
                key: expect.stringContaining(`${communityId}-${targetMemberAddress}-`),
                timestamp: expect.any(Number),
                metadata: {
                  id: communityId,
                  name: communityName,
                  memberAddress: targetMemberAddress,
                  thumbnailUrl: expect.stringContaining(`/social/communities/${communityId}/raw-thumbnail.png`)
                }
              })
            })

            it('should respond with a 204 status code when kicking a moderator', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${targetModeratorAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(204)
            })

            it('should respond with a 401 status code when trying to kick another owner', async () => {
              const response = await makeRequest(
                identity,
                `/v1/communities/${communityId}/members/${targetOwnerAddress}`,
                'DELETE'
              )
              expect(response.status).toBe(401)
              const body = await response.json()
              expect(body).toEqual({
                error: 'Not Authorized',
                message: `The user ${kickerAddress} doesn't have permission to kick ${targetOwnerAddress} from community ${communityId}`
              })
            })
          })
        })

        describe('and the community is private and user is in voice chat', () => {
          beforeEach(async () => {
            // Make the community private
            await components.communitiesDb.updateCommunity(communityId, {
              private: true
            })

            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: kickerAddress,
              role: CommunityRole.Owner
            })

            // Mock commsGatekeeper to simulate successful voice chat kick
            spyComponents.commsGatekeeper.kickUserFromCommunityVoiceChat.mockResolvedValue(undefined)
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [kickerAddress])
          })

          it('should kick member from voice chat when removing from private community', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}`,
              'DELETE'
            )

            // Wait for any setImmediate callbacks to complete
            await new Promise((resolve) => setImmediate(resolve))

            expect(response.status).toBe(204)

            // Verify that kickUserFromCommunityVoiceChat was called
            expect(spyComponents.commsGatekeeper.kickUserFromCommunityVoiceChat).toHaveBeenCalledWith(
              communityId,
              targetMemberAddress
            )
          })

          it('should still succeed even if voice chat kick fails', async () => {
            // Mock voice chat kick to fail
            spyComponents.commsGatekeeper.kickUserFromCommunityVoiceChat.mockRejectedValue(
              new Error('Voice chat service unavailable')
            )

            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}`,
              'DELETE'
            )

            // Wait for any setImmediate callbacks to complete
            await new Promise((resolve) => setImmediate(resolve))

            // Should still succeed (voice chat kick failure doesn't fail the entire operation)
            expect(response.status).toBe(204)

            // Verify that kick was attempted
            expect(spyComponents.commsGatekeeper.kickUserFromCommunityVoiceChat).toHaveBeenCalledWith(
              communityId,
              targetMemberAddress
            )

            // Verify member was still removed from community
            const isMember = await components.communitiesDb.isMemberOfCommunity(communityId, targetMemberAddress)
            expect(isMember).toBe(false)
          })
        })

        describe('and the community is public', () => {
          beforeEach(async () => {
            // Ensure community is public (default)
            await components.communitiesDb.updateCommunity(communityId, {
              private: false
            })

            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: kickerAddress,
              role: CommunityRole.Owner
            })

            // Reset the mock to ensure clean state
            spyComponents.commsGatekeeper.kickUserFromCommunityVoiceChat.mockClear()
          })

          afterEach(async () => {
            await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [kickerAddress])
          })

          it('should NOT kick member from voice chat when removing from public community', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}`,
              'DELETE'
            )

            // Wait for any setImmediate callbacks to complete
            await new Promise((resolve) => setImmediate(resolve))

            expect(response.status).toBe(204)

            // Verify that kickUserFromCommunityVoiceChat was NOT called for public communities
            expect(spyComponents.commsGatekeeper.kickUserFromCommunityVoiceChat).not.toHaveBeenCalled()
          })
        })

        describe('and an error occurs', () => {
          const testTargetAddress = '0x0000000000000000000000000000000000000004'

          beforeEach(async () => {
            spyComponents.communityMembers.kickMember.mockRejectedValue(new Error('Unable to remove member'))
          })

          it('should respond with a 500 status code', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${testTargetAddress}`,
              'DELETE'
            )
            expect(response.status).toBe(500)
          })
        })
      })
    })
  })
})
