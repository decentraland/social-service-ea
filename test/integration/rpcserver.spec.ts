import { test } from '../components'
import { AUTH_ADDRESS } from '../rpc'

test('RpcServer', ({ components }) => {
  it('should create a friendship', async () => {
    const { socialServiceClient } = components
    const response = await socialServiceClient.client.upsertFriendship({
      action: {
        $case: 'request',
        request: {
          user: {
            address: '0xA'
          }
        }
      }
    })
    console.log('response > ', response)
    expect(response?.response).not.toBe(undefined)
    expect(response?.response?.$case).toBe('accepted')
    console.log('expected all good')
    // const friendship = await components.db.getFriendship([AUTH_ADDRESS, '0xa'])
    // expect(friendship).not.toBe(undefined)
    // expect(friendship?.is_active).toBeFalsy()
    // expect(friendship?.address_requester).toBe(AUTH_ADDRESS)
    // expect(friendship?.address_requested).toBe('0xa')
  })
})
