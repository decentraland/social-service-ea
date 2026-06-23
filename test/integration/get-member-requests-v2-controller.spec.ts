import { CommunityRequestType } from '../../src/logic/community'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { mockCommunity } from '../mocks/communities'
import { CommunityRole } from '../../src/types'
import { Response } from '@well-known-components/interfaces'

const PROFILE_FIELDS = ['ownerName', 'name']

test('Get Member Requests Controller v2', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  let identity: Identity
  let address: string
  let communityId: string

  beforeEach(async () => {
    identity = await createTestIdentity()
    address = identity.realAccount.address.toLowerCase()
  })

  describe('when requesting own requests (v2)', () => {
    let response: Response

    beforeEach(async () => {
      const result = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community',
          description: 'Test Description',
          owner_address: address,
          private: false
        })
      )
      communityId = result.id

      await components.communitiesDb.addCommunityMember({
        communityId,
        memberAddress: address,
        role: CommunityRole.Owner
      })

      await components.communitiesDb.createCommunityRequest(communityId, address, CommunityRequestType.Invite)

      spyComponents.registry.getProfiles.mockResolvedValue([])

      response = await makeRequest(identity, `/v2/members/${address}/requests?limit=10&offset=0`)
    })

    afterEach(async () => {
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId, [address])
      await components.communitiesDbHelper.forceCommunityRemoval(communityId)
    })

    it('should return the requests with the owner address and a 200 status code', async () => {
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.data.results).toEqual([
        expect.objectContaining({
          communityId,
          name: 'Test Community',
          ownerAddress: address,
          type: CommunityRequestType.Invite
        })
      ])
    })

    it('should not include the owner name in the requests', async () => {
      const result = await response.json()
      for (const request of result.data.results) {
        expect(request).not.toHaveProperty('ownerName')
      }
    })

    it('should return mutual friends as an array of addresses', async () => {
      const result = await response.json()
      for (const request of result.data.results) {
        expect(Array.isArray(request.friends)).toBe(true)
        for (const friend of request.friends) {
          expect(typeof friend).toBe('string')
        }
      }
    })

    it('should not call the registry to fetch profiles', async () => {
      expect(spyComponents.registry.getProfiles).not.toHaveBeenCalled()
    })
  })

  describe('when requesting another user\'s requests (v2)', () => {
    const unrelatedUserAddress = '0x9876543210987654321098765432109876543210'

    it('should respond with a 401 status code', async () => {
      const response = await makeRequest(identity, `/v2/members/${unrelatedUserAddress}/requests`)
      expect(response.status).toBe(401)
    })
  })

  describe('when the request is not signed', () => {
    it('should respond with a 400 status code', async () => {
      const { localHttpFetch } = components
      const response = await localHttpFetch.fetch(`/v2/members/${address}/requests`)
      expect(response.status).toBe(400)
    })
  })

  describe('when the underlying fetch fails', () => {
    beforeEach(() => {
      spyComponents.communityRequests.getMemberRequests.mockRejectedValue(new Error('Unable to get requests'))
    })

    it('should respond with a 500 status code', async () => {
      const response = await makeRequest(identity, `/v2/members/${address}/requests`)
      expect(response.status).toBe(500)
    })
  })
})
