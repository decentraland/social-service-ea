import nock from 'nock'

nock.disableNetConnect()

// Allow localhost connections so we can test local routes and mock servers.
nock.enableNetConnect('127.0.0.1|localhost')

afterEach(() => {
  nock.cleanAll()
})
