import { CommunityRole } from '../../src/types'
import { test } from '../components'
import { createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'
import { createMockProfile } from '../mocks/profile'
import { parseExpectedFriends } from '../mocks/friend'
import { mockCommunity } from '../mocks/communities'
import { createOrUpsertActiveFriendship, removeFriendship } from './utils/friendships'
import { CommunityOwnerNotFoundError } from '../../src/logic/community'

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

      spyComponents.catalystClient.getProfile.mockResolvedValue(createMockProfile(address))
      spyComponents.catalystClient.getProfiles.mockResolvedValue([
        createMockProfile(friendAddress1),
        createMockProfile(friendAddress2)
      ])
      
      // Mock the communityOwners.getOwnerName to return owner names
      spyComponents.communityOwners.getOwnerName.mockImplementation(async (ownerAddress: string) => {
        if (ownerAddress === address) {
          return 'Test Owner'
        }
        return `Owner ${ownerAddress}`
      })

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
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [friendAddress1, friendAddress2])
      await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId2, [friendAddress1])

      await components.communitiesDbHelper.forceCommunityRemoval(communityId1)
      await components.communitiesDbHelper.forceCommunityRemoval(communityId2)

      await removeFriendship(components.friendsDb, friendshipId1, address)
      await removeFriendship(components.friendsDb, friendshipId2, address)
    })

    describe('and the request is not signed', () => {
      it('should respond with a 200 status code and the public communities with owner names', async () => {
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
                ownerName: 'Test Owner',
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
                ownerName: 'Test Owner',
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
      describe('when getting all communities', () => {
        it('should return all communities with correct role, friends information, and owner names', async () => {
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
                  ownerName: 'Test Owner',
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
                  ownerName: 'Test Owner',
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
      })

      describe('when filtering by membership', () => {
        let communityId3: string

        beforeEach(async () => {
          const result3 = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Test Community 3',
              description: 'Test Description 3',
              owner_address: address
            })
          )
          communityId3 = result3.id

          await components.communitiesDb.addCommunityMember({
            communityId: communityId1,
            memberAddress: address,
            role: CommunityRole.Member
          })

          await components.communitiesDb.addCommunityMember({
            communityId: communityId3,
            memberAddress: address,
            role: CommunityRole.Moderator
          })
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId1, [address])
          await components.communitiesDbHelper.forceCommunityMemberRemoval(communityId3, [address])

          await components.communitiesDbHelper.forceCommunityRemoval(communityId3)
        })

        it('should return only member communities sorted by role with owner names when onlyMemberOf=true', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&onlyMemberOf=true')
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(2)
          expect(body.data.results[0]).toEqual(
            expect.objectContaining({
              id: communityId3,
              name: 'Test Community 3',
              ownerName: 'Test Owner',
              role: CommunityRole.Moderator
            })
          )
          expect(body.data.results[1]).toEqual(
            expect.objectContaining({
              id: communityId1,
              name: 'Test Community 1',
              ownerName: 'Test Owner',
              role: CommunityRole.Member
            })
          )
          expect(body.data.total).toBe(2)
        })

        it('should return all communities sorted by membersCount with owner names when onlyMemberOf=false', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0&onlyMemberOf=false')
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(3)
          expect(body.data.results.every(community => community.ownerName === 'Test Owner')).toBe(true)
          expect(body.data.total).toBe(3)
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

      describe('and communities have thumbnails', () => {
        beforeEach(async () => {
          await components.storage.storeFile(Buffer.from('test'), `communities/${communityId1}/raw-thumbnail.png`)
          await components.storage.storeFile(Buffer.from('test'), `communities/${communityId2}/raw-thumbnail.png`)
        })

        afterEach(async () => {
          await components.storageHelper.removeFile(`communities/${communityId1}/raw-thumbnail.png`)
          await components.storageHelper.removeFile(`communities/${communityId2}/raw-thumbnail.png`)
        })

        it('should return the thumbnail raw url and owner names in the response', async () => {
          const response = await makeRequest(identity, '/v1/communities')
          const body = await response.json()
          expect(body.data.results[0].thumbnails.raw).toBe(
            `http://0.0.0.0:4566/social-service-ea/social/communities/${communityId1}/raw-thumbnail.png`
          )
          expect(body.data.results[0].ownerName).toBe('Test Owner')
          expect(body.data.results[1].thumbnails.raw).toBe(
            `http://0.0.0.0:4566/social-service-ea/social/communities/${communityId2}/raw-thumbnail.png`
          )
          expect(body.data.results[1].ownerName).toBe('Test Owner')
        })
      })

      describe('and owner profile retrieval fails', () => {
        beforeEach(() => {
          spyComponents.communityOwners.getOwnerName.mockRejectedValue(
            new CommunityOwnerNotFoundError(communityId1, address)
          )
        })

        it('should respond with a 404 status code when owner profile is not found', async () => {
          const response = await makeRequest(identity, '/v1/communities')
          expect(response.status).toBe(404)
        })
      })

      describe('and different owners have different profile names', () => {
        const differentOwnerAddress = '0x9999999999999999999999999999999999999999'
        let communityId4: string

        beforeEach(async () => {
          // Mock different owner name for the new community
          spyComponents.communityOwners.getOwnerName.mockImplementation(async (ownerAddress: string) => {
            if (ownerAddress === address) {
              return 'Test Owner'
            }
            if (ownerAddress === differentOwnerAddress) {
              return 'Different Owner'
            }
            return `Owner ${ownerAddress}`
          })

          const result4 = await components.communitiesDb.createCommunity(
            mockCommunity({
              name: 'Test Community 4',
              description: 'Test Description 4',
              owner_address: differentOwnerAddress
            })
          )
          communityId4 = result4.id
        })

        afterEach(async () => {
          await components.communitiesDbHelper.forceCommunityRemoval(communityId4)
        })

        it('should return communities with correct owner names for each owner', async () => {
          const response = await makeRequest(identity, '/v1/communities?limit=10&offset=0')
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.data.results).toHaveLength(3)
          
          const originalOwnerCommunities = body.data.results.filter(
            (community: any) => community.ownerAddress === address
          )
          const differentOwnerCommunities = body.data.results.filter(
            (community: any) => community.ownerAddress === differentOwnerAddress
          )

          expect(originalOwnerCommunities.every((community: any) => community.ownerName === 'Test Owner')).toBe(true)
          expect(differentOwnerCommunities.every((community: any) => community.ownerName === 'Different Owner')).toBe(true)
        })
      })
    })
  })
})
