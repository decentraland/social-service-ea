import { test } from '../components'

test('status handler', function ({ components }) {
  it('GET /status returns 200', async () => {
    const { localUwsFetch } = components

    const response = await localUwsFetch.fetch('/status')

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      version: expect.any(String),
      currentTime: expect.any(Number),
      commitHash: expect.any(String)
    })
  })
})
