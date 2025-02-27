import nock from 'nock'
import { test } from '../components'
import { ARCHIPELAGO_STATS_URL } from '../mocks/components'

test('status handler', function ({ components, spyComponents, beforeStart }) {
  beforeStart(async () => {
    nock(ARCHIPELAGO_STATS_URL)
      .get('/peers')
      .reply(200, {
        peers: [{ id: 'peer1' }, { id: 'peer2' }]
      })
  })

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
