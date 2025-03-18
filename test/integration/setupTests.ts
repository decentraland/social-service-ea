import nock from 'nock'

nock.disableNetConnect()

// Allow localhost connections so we can test local routes and mock servers.
nock.enableNetConnect('127.0.0.1|localhost|0.0.0.0|archipelago-ea-stats.decentraland.zone|peer(-[a-zA-Z0-9-]+)?\.decentraland\.zone')

afterEach(() => {
  nock.cleanAll()
})
