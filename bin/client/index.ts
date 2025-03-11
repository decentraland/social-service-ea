import { RpcSocialClient } from './rpc'

const testFriendUpdates = async (rpcClient: RpcSocialClient) => {
  // Start the subscription in the background
  const connectivitySubscriptionPromise = rpcClient.subscribeToFriendConnectivityUpdates()
  const friendshipSubscriptionPromise = rpcClient.subscribeToFriendshipUpdates()
  const blockSubscriptionPromise = rpcClient.subscribeToBlockUpdates()

  // Wait a bit to ensure subscription is established
  await new Promise((resolve) => setTimeout(resolve, 1000))

  try {
    // Test scenario 1: Add a new friend
    // console.log('\nTesting: Adding a new friend...')
    // await rpcClient.upsertFriendship()

    // Wait to see updates
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // You could add more test scenarios here

    /* console.log('Upserting friendship...')
    const response = await rpcClient.upsertFriendship()
    console.log('Upserted friendship response:', JSON.stringify(response, null, 2)) */

    /* console.log('\nTesting: Getting friends...')
    const friends = await rpcClient.getFriends()
    console.log('Current friends:', JSON.stringify(friends, null, 2)) */

    /* console.log('\nTesting: Getting Mutual Friends...')
    const mutualFriends = await rpcClient.getMutualFriends()
    console.log('Mutual Friends:', JSON.stringify(mutualFriends, null, 2)) */

    /* console.log('\nTesting: Getting friendship status...')
    const status = await rpcClient.getFriendshipStatus()
    console.log('Current friendship status:', JSON.stringify(status, null, 2)) */

    /* console.log('\nTesting: Getting sent friendships...')
    const sentFriendships = await rpcClient.getSentFriendships()
    console.log('Sent friendships:', JSON.stringify(sentFriendships, null, 2)) */

    /* console.log('\nTesting: Getting received friendships...')
    const receivedFriendships = await rpcClient.getPendingFriendships()
    console.log('Received friendships:', JSON.stringify(receivedFriendships, null, 2)) */

    console.log('\nTesting: Blocking user...')
    const blockedUser = await rpcClient.blockUser()
    console.log('Blocked user:', JSON.stringify(blockedUser, null, 2))

    console.log('\nTesting: Unblocking user...')
    const unblockedUser = await rpcClient.unblockUser()
    console.log('Unblocked user:', JSON.stringify(unblockedUser, null, 2))

  } catch (error) {
    console.error('Error during test scenarios:', error)
  }

  // Keep subscription running
  await Promise.all([connectivitySubscriptionPromise, friendshipSubscriptionPromise, blockSubscriptionPromise])
}

const main = async () => {
  const serverUrl = 'ws://localhost:8085'

  const authChainArray = [
    {
      type: 'SIGNER',
      payload: '',
      signature: ''
    },
    {
      type: 'ECDSA_EPHEMERAL',
      payload:
        '',
      signature:
        ''
    },
    {
      type: 'ECDSA_SIGNED_ENTITY',
      payload: '',
      signature:
        ''
    }
  ]

  const timestamp = authChainArray
    .find(item => item.type === 'ECDSA_SIGNED_ENTITY')
    ?.payload.split(':')[2] || ''

  const authchain = {
    ...Object.fromEntries(
      authChainArray.map((item, index) => [`x-identity-auth-chain-${index}`, JSON.stringify(item)])
    ),
    'x-identity-timestamp': timestamp,
    'x-identity-metadata': '{}'
  }

  console.log('Connecting to RPC server...')

  const rpcClient = new RpcSocialClient(serverUrl, authchain)

  try {
    // Connect and authenticate
    await rpcClient.connect()
    console.log('Authenticated and connected to RPC server.')

    await testFriendUpdates(rpcClient)

    // Keep the connection alive
    process.on('SIGINT', () => {
      console.log('Closing connection...')
      rpcClient.close()
      process.exit(0)
    })
  } catch (error) {
    console.error('Error:', error)
    rpcClient.close()
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
