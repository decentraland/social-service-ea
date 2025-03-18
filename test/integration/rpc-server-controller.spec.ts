import { test } from '../components'
import { createOrUpsertActiveFriendship, removeFriendship } from './utils/friendships'

test('RPC Server Controller', function ({ components }) {
  beforeAll(async () => {
    await components.rpcClient.connect()
  })

  describe('GetFriends handler', function () {
    it('returns friends list successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      
      const id = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, friendAddress])
      
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
    
    it('returns empty list when user has no friends', async () => {
      const { rpcClient } = components
      
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
    it.skip('returns mutual friends successfully', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      const mutualFriendAddress = '0x77c4c17331436d3b8798596e3d7c0d8e1b786aa4'
      
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
    
    it.skip('returns empty list when no mutual friends exist', async () => {
      const { rpcClient, db } = components
      const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
      
      const id = await createOrUpsertActiveFriendship(db, [rpcClient.authAddress, friendAddress])
      
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
})