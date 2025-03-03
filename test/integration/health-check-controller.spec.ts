import { test } from '../components'

test('health check handler', function ({ components }) {
  it('GET /health/live returns 200', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/health/live')

    expect(response.status).toEqual(200)
    expect(await response.text()).toEqual('alive')
  })
})
