import { FriendshipRequests, PaginatedFriendshipRequestsResponse } from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { test } from '../components'
import { createMockProfile } from '../mocks/profile'
import { createOrUpsertActiveFriendship, createPendingFriendshipRequest, removeFriendship } from './utils/friendships'

test('RPC Server Controller', function ({ components, stubComponents }) {
  beforeAll(async () => {
    await components.rpcClient.connect()
    stubComponents.peersSynchronizer.syncPeers.resolves()
  })
  
  describe('GetFriends handler', function () {
    it('should return friends list successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mockFriendProfile = createMockProfile(friendAddress)
      const id = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, friendAddress])
      
      stubComponents.catalystClient.getProfiles.resolves([mockFriendProfile])
      
      const response = await rpcClient.client.getFriends({
        pagination: {
          limit: 10,
          offset: 0
        }
      })
      
      expect(response.friends.length).toEqual(1)
      expect(response.friends[0].address).toEqual(friendAddress)
      
      await removeFriendship(db, id, rpcClient.authAddress)
    })
    
    it('should return empty list when user has no friends', async () => {
      const { rpcClient } = components
      stubComponents.catalystClient.getProfiles.resolves([])
      
      const response = await rpcClient.client.getFriends({
        pagination: {
          limit: 10,
          offset: 0
        }
      })
      
      expect(response.friends).toHaveLength(0)
    })
  })
  
  describe('GetMutualFriends handler', function () {
    it('should return mutual friends successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mutualFriendAddress = '0x77c4c17331436d3b8798596e3d7c0d8e1b786aa4'
      const mockMutualFriendProfile = createMockProfile(mutualFriendAddress)
      
      stubComponents.catalystClient.getProfiles.resolves([mockMutualFriendProfile])
      
      const id1 = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, friendAddress])
      const id2 = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, mutualFriendAddress])
      const id3 = await createOrUpsertActiveFriendship(db, [friendAddress, mutualFriendAddress])
      
      const response = await rpcClient.client.getMutualFriends({
        user: {
          address: friendAddress
        },
        pagination: {
          limit: 10,
          offset: 0
        }
      })
      
      
      expect(response.friends).toHaveLength(1)
      expect(response.friends[0].address).toEqual(mutualFriendAddress)
      
      await removeFriendship(db, id1, rpcClient.authAddress)
      await removeFriendship(db, id2, rpcClient.authAddress)
      await removeFriendship(db, id3, friendAddress)
    })
    
    it('should return empty list when no mutual friends exist', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const id = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, friendAddress])
      
      stubComponents.catalystClient.getProfiles.resolves([])
      
      const response = await rpcClient.client.getMutualFriends({
        user: {
          address: friendAddress
        },
        pagination: {
          limit: 10,
          offset: 0
        }
      })
      
      expect(response.friends).toHaveLength(0)
      
      await removeFriendship(db, id, rpcClient.authAddress)
    })
  })

  describe('getPendingFriendshipRequests', function() {
    it('should return pending friendship requests successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mockFriendProfile = createMockProfile(friendAddress)

      const id = await createPendingFriendshipRequest(db, [friendAddress, rpcClient.authAddress])

      stubComponents.catalystClient.getProfiles.resolves([mockFriendProfile])

      const result = await rpcClient.client.getPendingFriendshipRequests({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      assertFriendshipRequests(result, (requests) => {
        expect(requests.length).toEqual(1)
        expect(requests[0].friend.address).toEqual(friendAddress)
      })

      await removeFriendship(db, id, friendAddress)
    })

    it('should return empty list when user has no pending friendship requests', async () => {
      const { rpcClient } = components
      stubComponents.catalystClient.getProfiles.resolves([])
      const result = await rpcClient.client.getPendingFriendshipRequests({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      assertFriendshipRequests(result, (requests) => {
        expect(requests.length).toEqual(0)
      })
    })

    it('should return pending requests paginated with most recent first', async () => {
      const { rpcClient, db } = components
      const friendAddresses = [
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd1',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd2',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd3'
      ]

      const mockProfiles = friendAddresses.map(addr => createMockProfile(addr))
      
      const requestIds = []
      for (const addr of friendAddresses) {
        const id = await createPendingFriendshipRequest(db, [addr, rpcClient.authAddress])
        requestIds.push(id)
      }
      
      stubComponents.catalystClient.getProfiles.resolves(mockProfiles)

      const firstPage = await rpcClient.client.getPendingFriendshipRequests({
        pagination: {
          limit: 2,
          offset: 0
        }
      })

      assertFriendshipRequests(firstPage, (requests) => {
        expect(requests.length).toEqual(2)
        expect(requests[0].friend.address).toEqual(friendAddresses[2])
        expect(requests[1].friend.address).toEqual(friendAddresses[1])
      })

      const secondPage = await rpcClient.client.getPendingFriendshipRequests({
        pagination: {
          limit: 2,
          offset: 2
        }
      })

      assertFriendshipRequests(secondPage, (requests) => {
        expect(requests.length).toEqual(1)
        expect(requests[0].friend.address).toEqual(friendAddresses[0])
      })

      await Promise.all(
        requestIds.map((id, index) => 
          removeFriendship(db, id, friendAddresses[index])
        )
      )
    })
  })

  describe('getSentFriendshipRequests', function() {
    it('should return sent friendship requests successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd2'
      const mockFriendProfile = createMockProfile(friendAddress)

      const id = await createPendingFriendshipRequest(db, [rpcClient.authAddress, friendAddress])

      stubComponents.catalystClient.getProfiles.resolves([mockFriendProfile])

      const result = await rpcClient.client.getSentFriendshipRequests({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      assertFriendshipRequests(result, (requests) => {
        expect(requests.length).toEqual(1)
        expect(requests[0].friend.address).toEqual(friendAddress)
      })

      await removeFriendship(db, id, rpcClient.authAddress)
    })

    it('should return empty list when user has no sent friendship requests', async () => {
      const { rpcClient } = components
      stubComponents.catalystClient.getProfiles.resolves([])
      const result = await rpcClient.client.getSentFriendshipRequests({
        pagination: {
          limit: 10,
          offset: 0
        }
      })

      assertFriendshipRequests(result, (requests) => {
        expect(requests.length).toEqual(0)
      })
    })

    it('should return sent requests paginated with most recent first', async () => {
      const { rpcClient, db } = components
      const friendAddresses = [
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd1',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd2',
        '0x07b7c9e6aef7f6b6c259831953309f63c59bcfd3'
      ]

      const mockProfiles = friendAddresses.map(addr => createMockProfile(addr))
      
      const requestIds = []
      for (const addr of friendAddresses) {
        const id = await createPendingFriendshipRequest(db, [rpcClient.authAddress, addr])
        requestIds.push(id)
      }

      stubComponents.catalystClient.getProfiles.resolves(mockProfiles)

      const firstPage = await rpcClient.client.getSentFriendshipRequests({
        pagination: {
          limit: 2,
          offset: 0
        }
      })

      assertFriendshipRequests(firstPage, (requests) => {
        expect(requests.length).toEqual(2)
        expect(requests[0].friend.address).toEqual(friendAddresses[2])
        expect(requests[1].friend.address).toEqual(friendAddresses[1])
      })

      const secondPage = await rpcClient.client.getSentFriendshipRequests({
        pagination: {
          limit: 2,
          offset: 2
        }
      })

      assertFriendshipRequests(secondPage, (requests) => {
        expect(requests.length).toEqual(1)
        expect(requests[0].friend.address).toEqual(friendAddresses[0])
      })

      await Promise.all(
        requestIds.map((id, index) => 
          removeFriendship(db, id, friendAddresses[index])
        )
      )
    })
  })

  // Helper functions
  function assertFriendshipRequests(
    result: PaginatedFriendshipRequestsResponse,
    assertions: (requests: FriendshipRequests['requests']) => void
  ) {
    const { response } = result

    expect(response.$case).toEqual('requests')

    if (response.$case === 'requests') {
      const {
        requests: { requests }
      } = response
      assertions(requests)
    }
  }
})