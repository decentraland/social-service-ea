import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'
import { randomUUID } from 'crypto'

test('Update Member Role Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when updating a member role in a community', () => {
    let identity: Identity
    let updaterAddress: string
    let communityId: string
    let targetMemberAddress: string
    let targetModeratorAddress: string
    let targetOwnerAddress: string
    let nonMemberAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      updaterAddress = identity.realAccount.address.toLowerCase()
      targetMemberAddress = '0x0000000000000000000000000000000000000001'
      targetModeratorAddress = '0x0000000000000000000000000000000000000002'
      targetOwnerAddress = '0x0000000000000000000000000000000000000003'
      nonMemberAddress = '0x0000000000000000000000000000000000000004'

      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
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
        updaterAddress,
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
        const response = await localHttpFetch.fetch(
          `/v1/communities/${communityId}/members/${targetMemberAddress}?role=${CommunityRole.Moderator}`,
          {
            method: 'PATCH'
          }
        )
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(
            identity,
            `/v1/communities/${nonExistentId}/members/${targetMemberAddress}?role=${CommunityRole.Moderator}`,
            'PATCH'
          )
          expect(response.status).toBe(404)
        })
      })

      describe('and the address is invalid', () => {
        it('should respond with a 400 status code when trying to update role with an invalid address', async () => {
          const response = await makeRequest(
            identity,
            `/v1/communities/${communityId}/members/invalid-address?role=${CommunityRole.Moderator}`,
            'PATCH'
          )
          expect(response.status).toBe(400)
        })
      })

      describe('and the role is invalid', () => {
        it('should respond with a 400 status code when trying to update to an invalid role', async () => {
          const response = await makeRequest(
            identity,
            `/v1/communities/${communityId}/members/${targetMemberAddress}?role=invalid-role`,
            'PATCH'
          )
          expect(response.status).toBe(400)
        })
      })

      describe('and the role is missing', () => {
        it('should respond with a 400 status code', async () => {
          const response = await makeRequest(
            identity,
            `/v1/communities/${communityId}/members/${targetMemberAddress}`,
            'PATCH'
          )
          expect(response.status).toBe(400)
        })
      })

      describe('and the community exists', () => {
        describe('and the updater is not a member of the community', () => {
          it('should respond with a 401 status code', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}?role=${CommunityRole.Moderator}`,
              'PATCH'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${updaterAddress} doesn't have permission to update ${targetMemberAddress}'s role in community ${communityId}`
            })
          })
        })

        describe('and the updater is a member of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: updaterAddress,
              role: CommunityRole.Member
            })
          })

          it('should respond with a 401 status code when trying to update another member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}?role=${CommunityRole.Moderator}`,
              'PATCH'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${updaterAddress} doesn't have permission to update ${targetMemberAddress}'s role in community ${communityId}`
            })
          })

          it('should respond with a 401 status code when trying to update own role', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${updaterAddress}?role=${CommunityRole.Moderator}`,
              'PATCH'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${updaterAddress} doesn't have permission to update ${updaterAddress}'s role in community ${communityId}`
            })
          })
        })

        describe('and the updater is a moderator of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: updaterAddress,
              role: CommunityRole.Moderator
            })
          })

          it('should respond with a 401 status code when trying to update another moderator', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetModeratorAddress}?role=${CommunityRole.Member}`,
              'PATCH'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${updaterAddress} doesn't have permission to update ${targetModeratorAddress}'s role in community ${communityId}`
            })
          })

          it('should respond with a 401 status code when trying to update an owner', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetOwnerAddress}?role=${CommunityRole.Member}`,
              'PATCH'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${updaterAddress} doesn't have permission to update ${targetOwnerAddress}'s role in community ${communityId}`
            })
          })
        })

        describe('and the updater is the owner of the community', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress: updaterAddress,
              role: CommunityRole.Owner
            })
          })

          it('should respond with a 204 status code when promoting a member to moderator', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}?role=${CommunityRole.Moderator}`,
              'PATCH'
            )
            expect(response.status).toBe(204)
          })

          it('should respond with a 204 status code when demoting a moderator to member', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetModeratorAddress}?role=${CommunityRole.Member}`,
              'PATCH'
            )
            expect(response.status).toBe(204)
          })

          it('should respond with a 401 status code when trying to update another owner', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetOwnerAddress}?role=${CommunityRole.Member}`,
              'PATCH'
            )
            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body).toEqual({
              error: 'Not Authorized',
              message: `The user ${updaterAddress} doesn't have permission to update ${targetOwnerAddress}'s role in community ${communityId}`
            })
          })
        })

        describe('and an error occurs', () => {
          beforeEach(() => {
            spyComponents.community.updateMemberRole.mockRejectedValue(new Error('Unable to update member role'))
          })

          it('should respond with a 500 status code', async () => {
            const response = await makeRequest(
              identity,
              `/v1/communities/${communityId}/members/${targetMemberAddress}?role=${CommunityRole.Moderator}`,
              'PATCH'
            )
            expect(response.status).toBe(500)
          })
        })
      })
    })
  })
})
