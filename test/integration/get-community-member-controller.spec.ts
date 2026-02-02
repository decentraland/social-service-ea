import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'

test('Get Community Member Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting a member of a community', () => {
    let identity: Identity
    let address: string
    let communityId: string
    let memberAddress: string
    let nonMemberAddress: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()

      const memberIdentity = await createTestIdentity()
      memberAddress = memberIdentity.realAccount.address.toLowerCase()

      const nonMemberIdentity = await createTestIdentity()
      nonMemberAddress = nonMemberIdentity.realAccount.address.toLowerCase()

      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: address
        })
      )
      communityId = result.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: address,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress,
        role: CommunityRole.Member
      })
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [address, memberAddress])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch(`/v1/communities/${communityId}/members/${memberAddress}`)

        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the user is a member of the community', () => {
        it('should respond with a 204 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/members/${memberAddress}`)

          expect(response.status).toBe(204)
        })
      })

      describe('and the user is the owner of the community', () => {
        it('should respond with a 204 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/members/${address}`)

          expect(response.status).toBe(204)
        })
      })

      describe('and the user is not a member of the community', () => {
        it('should respond with a 404 status code', async () => {
          const response = await makeRequest(identity, `/v1/communities/${communityId}/members/${nonMemberAddress}`)

          expect(response.status).toBe(404)
          const body = await response.json()
          expect(body.message).toBe('Member not found in community')
        })
      })

      describe('and the community does not exist', () => {
        it('should respond with a 404 status code', async () => {
          const nonExistentCommunityId = '00000000-0000-0000-0000-000000000000'
          const response = await makeRequest(
            identity,
            `/v1/communities/${nonExistentCommunityId}/members/${memberAddress}`
          )

          expect(response.status).toBe(404)
        })
      })
    })

    describe('and the database query fails', () => {
      beforeEach(() => {
        spyComponents.communitiesDb.isMemberOfCommunity.mockRejectedValue(new Error('Database error'))
      })

      it('should respond with a 500 status code and the error message', async () => {
        const response = await makeRequest(identity, `/v1/communities/${communityId}/members/${memberAddress}`)

        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body.message).toBe('Database error')
      })
    })
  })
})
