import { test } from '../components'

test('status handler', function ({ components }) {
  it('GET /status returns 200', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/status')

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      version: expect.any(String),
      currentTime: expect.any(Number),
      commitHash: expect.any(String)
    })
  })
})
