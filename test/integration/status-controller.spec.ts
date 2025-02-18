import nock from 'nock'
import { test } from '../components'
import { ARCHIPELAGO_STATS_URL } from '../mocks/components'

test('integration sanity tests using a real server backend', function ({ components, spyComponents, beforeStart }) {
  beforeStart(async () => {
    nock(ARCHIPELAGO_STATS_URL)
      .get('/peers')
      .reply(200, {
        peers: [{ id: 'peer1' }, { id: 'peer2' }]
      })
  })

  it('responds /status', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/status')

    expect(response.status).toEqual(200)
    // expect(await response.text()).toEqual('/status')
  })

  /* it('calling /ping increments a metric', async () => {
    const { localFetch } = components

    // create the spy
    spyComponents.metrics.increment

    const r = await localFetch.fetch('/ping')

    expect(r.status).toEqual(200)
    expect(await r.text()).toEqual('/ping')

    expect(spyComponents.metrics.increment).toBeCalledWith('test_ping_counter', { pathname: '/ping' })
  })

  it('random url responds 404', async () => {
    const { localFetch } = components

    // TODO: handle the following eslint-disable statement
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    const r = await localFetch.fetch('/ping' + Math.random())

    expect(r.status).toEqual(404)
  }) */
})
