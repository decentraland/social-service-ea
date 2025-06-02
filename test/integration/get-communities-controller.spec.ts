import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createMockProfile } from '../mocks/profile'
import { parseExpectedFriends } from '../mocks/friend'
import { mockCommunity } from '../mocks/community'
import { createOrUpsertActiveFriendship, removeFriendship } from './utils/friendships'
import SQL from 'sql-template-strings'

test('Get Communities Controller', function ({ components, spyComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)
  const parseFriend = parseExpectedFriends()

  describe('when getting communities', () => {
    const friendAddress1 = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
    const friendAddress2 = '0x77c4c17331436d3b8798596e3d7c0d8e1b786aa4'

    let address: string
    let identity: Identity
    let communityId1: string
    let communityId2: string
    let friendshipId1: string
    let friendshipId2: string

    beforeEach(async () => {
      identity = await createTestIdentity()
      address = identity.realAccount.address.toLowerCase()

      spyComponents.catalystClient.getProfiles.mockResolvedValue([
        createMockProfile(friendAddress1),
        createMockProfile(friendAddress2)
      ])

      const result1 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community 1',
          description: 'Test Description 1',
          owner_address: address
        })
      )
      communityId1 = result1.id

      const result2 = await components.communitiesDb.createCommunity(
        mockCommunity({
          name: 'Test Community 2',
          description: 'Test Description 2',
          owner_address: address
        })
      )
      communityId2 = result2.id

      await Promise.all(
        [friendAddress1, friendAddress2].map(async (memberAddress) =>
          components.communitiesDb.addCommunityMember({
            communityId: communityId1,
            memberAddress,
            role: CommunityRole.Member
          })
        )
      )

      await components.communitiesDb.addCommunityMember({
        communityId: communityId2,
        memberAddress: friendAddress1,
        role: CommunityRole.Member
      })

      friendshipId1 = await createOrUpsertActiveFriendship(components.friendsDb, [address, friendAddress1])
      friendshipId2 = await createOrUpsertActiveFriendship(components.friendsDb, [address, friendAddress2])
    })

    afterEach(async () => {
      components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [friendAddress1, friendAddress2])
      components.communitiesDbHelper.forceCommunityMemberRemoval(communityId2, [friendAddress1])

      components.communitiesDbHelper.forceCommunityRemoval(communityId1)
      components.communitiesDbHelper.forceCommunityRemoval(communityId2)

      await removeFriendship(components.friendsDb, friendshipId1, address)
      await removeFriendship(components.friendsDb, friendshipId2, address)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 200 status code and the public communities', async () => {
        const { localHttpFetch } = components
        const response = await localHttpFetch.fetch('/v1/communities?limit=10&offset=0&search=test')
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: {
            results: expect.arrayContaining([
              expect.objectContaining({
                id: communityId1,
                name: 'Test Community 1',
                description: 'Test Description 1',
                ownerAddress: address,
                privacy: 'public',
                active: true,
                membersCount: 2,
                isLive: false
              }),
              expect.objectContaining({
                id: communityId2,
                name: 'Test Community 2',
                description: 'Test Description 2',
                ownerAddress: address,
                privacy: 'public',
                active: true,
                membersCount: 1,
                isLive: false
              })
            ]),
            total: 2,
            page: 1,
            pages: 1,
            limit: 10
          }
        })
      })
    })

    describe('and the request is signed', () => {
      it('should respond with a 200 status code and the communities', async () => {
        const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&search=test')
        const body = await response.json()

        const friend1Profile = createMockProfile(friendAddress1)
        const friend2Profile = createMockProfile(friendAddress2)

        expect(response.status).toBe(200)
        expect(body).toEqual({
          data: {
            results: expect.arrayContaining([
              expect.objectContaining({
                id: communityId1,
                name: 'Test Community 1',
                description: 'Test Description 1',
                ownerAddress: address,
                privacy: 'public',
                active: true,
                role: CommunityRole.None,
                membersCount: 2,
                friends: expect.arrayContaining([parseFriend(friend1Profile), parseFriend(friend2Profile)]),
                isLive: false
              }),
              expect.objectContaining({
                id: communityId2,
                name: 'Test Community 2',
                description: 'Test Description 2',
                ownerAddress: address,
                privacy: 'public',
                active: true,
                role: CommunityRole.None,
                membersCount: 1,
                friends: expect.arrayContaining([parseFriend(friend1Profile)]),
                isLive: false
              })
            ]),
            total: 2,
            page: 1,
            pages: 1,
            limit: 10
          }
        })
      })

      describe('and filtering by member role', () => {
        beforeEach(async () => {
          // Add the user as a member to one of the communities
          await components.pg.query(SQL`
            INSERT INTO community_members (community_id, member_address, role)
            VALUES (${communityId1}, ${address}, ${CommunityRole.Member})
          `)
        })

        afterEach(async () => {
          components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [address])
        })

        it('should return only communities where the user is a member when onlyMemberOf is true', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&onlyMemberOf=true')
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(1)
          expect(body.data.results[0]).toEqual(
            expect.objectContaining({
              id: communityId1,
              name: 'Test Community 1',
              role: CommunityRole.Member
            })
          )
          expect(body.data.total).toBe(1)
        })

        it('should return all communities when onlyMemberOf is false', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&onlyMemberOf=false')
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(2)
          expect(body.data.total).toBe(2)
        })

        it('should return all communities when onlyMemberOf is not specified', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0')
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(2)
          expect(body.data.total).toBe(2)
        })
      })

      describe('and the query fails', () => {
        beforeEach(() => {
          spyComponents.communitiesDb.getCommunities.mockRejectedValue(new Error('Unable to get communities'))
        })

        it('should respond with a 500 status code', async () => {
          const response = await makeRequest(identity, '/v1/communities')
          expect(response.status).toBe(500)
        })
      })
    })
  })
})
