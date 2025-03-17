import { test } from '../components'
import { createActiveFriendship, removeFriendship } from './utils/friendships'

test('GetFriends handler', function ({ components }) {
  it('returns friends list successfully', async () => {
    const { rpcClient, db } = components
    const friendAddress = '0x06b7c9e6aef7f6b6c259831953309f63c59bcfd1'
    
    const id = await createActiveFriendship(db, [rpcClient.authAddress, friendAddress])
    
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