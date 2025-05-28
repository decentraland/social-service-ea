import { test } from '../components'

test('health check handler', function ({ components }) {
  it('GET /health/live returns 200', async () => {
    const { localUwsFetch } = components

    const response = await localUwsFetch.fetch('/health/live')

    expect(response.status).toEqual(200)
    expect(await response.text()).toEqual('alive')
  })
})
