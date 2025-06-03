import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/community'
import { randomUUID } from 'crypto'

test('Join Community Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when joining a community', () => {
    let identity: Identity
    let memberAddress: string
    let communityId: string
    let ownerAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      memberAddress = identity.realAccount.address.toLowerCase()
      ownerAddress = '0x0000000000000000000000000000000000000001'

      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: ownerAddress
        })
      )
      communityId = result.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: ownerAddress,
        role: CommunityRole.Owner
      })
    })

    afterEach(async () => {
      components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [memberAddress, ownerAddress])
      components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/members`, {
          method: 'POST'
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentId = randomUUID()
          const response = await makeRequest(identity, `/v1/communities/${nonExistentId}/members`, 'POST')
          expect(response.status).toBe(404)
        })
      })

      describe('and the community exists', () => {
        describe('and the user is not a member', () => {
          it('should respond with a 204 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/members`, 'POST')
            expect(response.status).toBe(204)

            const isMember = await components.communitiesDb.isMemberOfCommunity(communityId, memberAddress)
            expect(isMember).toBe(true)
          })
        })

        describe('and the user is already a member', () => {
          beforeEach(async () => {
            await components.communitiesDb.addCommunityMember({
              communityId,
              memberAddress,
              role: CommunityRole.Member
            })
          })

          it('should respond with a 204 status code', async () => {
            const response = await makeRequest(identity, `/v1/communities/${communityId}/members`, 'POST')
            expect(response.status).toBe(204)
          })
        })
      })

      describe('and an error occurs', () => {
        beforeEach(async () => {
          spyComponents.community.joinCommunity.mockRejectedValue(new Error('Unable to join community'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/members`, 'POST')
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
