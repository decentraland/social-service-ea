import { Entity } from '@dcl/schemas'
import { createCatalystClient } from '../../../src/adapters/catalyst-client'
import { ICatalystClient } from '../../../src/types'
import { ContentClient, createContentClient } from 'dcl-catalyst-client'
import { mockConfig, mockFetcher } from '../../mocks/components'

jest.mock('dcl-catalyst-client', () => ({
  ...jest.requireActual('dcl-catalyst-client'),
  createContentClient: jest.fn().mockReturnValue({
    fetchEntitiesByPointers: jest.fn()
  })
}))

jest.mock('dcl-catalyst-client/dist/contracts-snapshots', () => ({
  getCatalystServersFromCache: jest
    .fn()
    .mockReturnValue([
      { address: 'http://catalyst-server-1.com' },
      { address: 'http://catalyst-server-2.com' },
      { address: 'http://catalyst-server-3.com' }
    ])
}))

jest.mock('../../../src/utils/array', () => ({
  shuffleArray: jest.fn((array) => array) // for predictability
}))

jest.mock('../../../src/utils/timer', () => ({
  sleep: jest.fn()
}))

const LOAD_BALANCER_URL = 'http://catalyst-server.com'

describe('Catalyst client', () => {
  let catalystClient: ICatalystClient
  let contentClientMock: ContentClient

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(LOAD_BALANCER_URL)

    catalystClient = await createCatalystClient({
      fetcher: mockFetcher,
      config: mockConfig
    })
    contentClientMock = createContentClient({ fetcher: mockFetcher, url: LOAD_BALANCER_URL })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getEntitiesByPointers', () => {
    let pointers: string[]
    let entities: Pick<Entity, 'id'>[]
    let customContentServer: string

    beforeEach(() => {
      pointers = ['pointer1', 'pointer2']
      entities = [{ id: 'entity1' }, { id: 'entity2' }]
      customContentServer = 'http://custom-content-server.com'
    })

    it('should fetch entities by pointers with retries and default values', async () => {
      contentClientMock.fetchEntitiesByPointers = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockResolvedValueOnce(entities)

      const result = await catalystClient.getEntitiesByPointers(pointers)

      expect(contentClientMock.fetchEntitiesByPointers).toHaveBeenCalledTimes(2)
      expect(result).toEqual(entities)
    })

    it('should fetch entities by pointers with custom retries and wait time', async () => {
      contentClientMock.fetchEntitiesByPointers = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValueOnce(entities)

      const result = await catalystClient.getEntitiesByPointers(pointers, { retries: 5, waitTime: 500 })

      expect(contentClientMock.fetchEntitiesByPointers).toHaveBeenCalledTimes(2)
      expect(result).toEqual(entities)
    })

    it('should fetch entities by pointers from custom content server on the first attempt', async () => {
      contentClientMock.fetchEntitiesByPointers = jest.fn().mockResolvedValue(entities)

      const result = await catalystClient.getEntitiesByPointers(pointers, { contentServerUrl: customContentServer })

      expectContentClientToHaveBeenCalledWithUrl(customContentServer)
      expect(contentClientMock.fetchEntitiesByPointers).toHaveBeenCalledTimes(1)

      expect(result).toEqual(entities)
    })

    it('should rotate among catalyst server URLs on subsequent attempts', async () => {
      contentClientMock.fetchEntitiesByPointers = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockRejectedValueOnce(new Error('Failure on second attempt'))
        .mockResolvedValueOnce(entities)

      await catalystClient.getEntitiesByPointers(pointers)

      expectContentClientToHaveBeenCalledWithUrl(LOAD_BALANCER_URL)
      expectContentClientToHaveBeenCalledWithUrl('http://catalyst-server-3.com')
      expectContentClientToHaveBeenCalledWithUrl('http://catalyst-server-2.com')

      expect(contentClientMock.fetchEntitiesByPointers).toHaveBeenCalledTimes(3)
    })

    it('should not reuse the same catalyst server URL on different attempts', async () => {
      contentClientMock.fetchEntitiesByPointers = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure on first attempt'))
        .mockRejectedValueOnce(new Error('Failure on second attempt'))
        .mockRejectedValueOnce(new Error('Failure on third attempt'))

      await catalystClient.getEntitiesByPointers(pointers, { retries: 3 }).catch(() => {})

      const createContentClientMock = createContentClient as jest.Mock
      const currentCalls = createContentClientMock.mock.calls.slice(1) // Avoid the first call which is the one made in the beforeEach

      const urlsUsed = currentCalls.map((args) => args[0].url)
      const uniqueUrls = new Set(urlsUsed)

      expect(uniqueUrls.size).toBe(urlsUsed.length)
    })
  })

  describe('getEntityByPointer', () => {
    it('should throw an error if the entity is not found', async () => {
      contentClientMock.fetchEntitiesByPointers = jest.fn().mockResolvedValue([])
      await expect(catalystClient.getEntityByPointer('pointer')).rejects.toThrow('Entity not found for pointer pointer')
    })

    it('should return the entity if it is found', async () => {
      contentClientMock.fetchEntitiesByPointers = jest.fn().mockResolvedValue([{ id: 'entity1' }])

      const result = await catalystClient.getEntityByPointer('pointer')

      expect(result).toEqual({ id: 'entity1' })
    })
  })

  // Helpers
  function expectContentClientToHaveBeenCalledWithUrl(url: string) {
    expect(createContentClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url
      })
    )
  }
})
