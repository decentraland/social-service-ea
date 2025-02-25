import { IUWsComponent } from '@well-known-components/uws-http-server'
import * as uws from 'uWebSockets.js'

export const mockUWs: jest.Mocked<IUWsComponent> = {
  start: jest.fn(),
  app: {
    listen: jest.fn(),
    listen_unix: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    options: jest.fn(),
    del: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    head: jest.fn(),
    connect: jest.fn(),
    trace: jest.fn(),
    any: jest.fn(),
    ws: jest.fn(),
    publish: jest.fn(),
    numSubscribers: jest.fn(),
    addServerName: jest.fn(),
    domain: jest.fn(),
    removeServerName: jest.fn(),
    missingServerName: jest.fn(),
    filter: jest.fn(),
    close: jest.fn()
  } as unknown as jest.Mocked<uws.TemplatedApp>
}
