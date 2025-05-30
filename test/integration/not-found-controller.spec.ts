import { test } from '../components'

test('not found handler', function ({ components }) {
  it.each(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])(`%s /not-existing-path returns 404`, async (method) => {
    const { localUwsFetch } = components

    const response = await localUwsFetch.fetch(`/not-existing-path`, { method })

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({ error: 'Not Found' })
  })
})
