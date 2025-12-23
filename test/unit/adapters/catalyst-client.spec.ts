import { createCatalystClient } from '../../../src/adapters/catalyst-client'
import { ICatalystClientComponent } from '../../../src/types'
import { createLambdasClient, LambdasClient } from 'dcl-catalyst-client'
import { mockConfig, mockFetcher } from '../../mocks/components'
import { GetNamesParams, Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

jest.mock('dcl-catalyst-client', () => ({
  ...jest.requireActual('dcl-catalyst-client'),
  createLambdasClient: jest.fn().mockReturnValue({
    getNames: jest.fn()
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

const CATALYST_LAMBDAS_LOAD_BALANCER_URL = 'http://catalyst-server.com/lambdas'

describe('catalyst-client', () => {
  let catalystClient: ICatalystClientComponent
  let lambdasClientMock: LambdasClient

  beforeEach(async () => {
    mockConfig.requireString.mockResolvedValue(CATALYST_LAMBDAS_LOAD_BALANCER_URL)
    mockConfig.getString.mockResolvedValue('test') // ENV

    catalystClient = await createCatalystClient({
      fetcher: mockFetcher,
      config: mockConfig
    })
    lambdasClientMock = createLambdasClient({ fetcher: mockFetcher, url: CATALYST_LAMBDAS_LOAD_BALANCER_URL })

    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  describe('when getting owned names', () => {
    const address = '0x1234567890123456789012345678901234567890'
    const mockNamesResponse = {
      elements: [
        { tokenId: '1', name: 'test.dcl.eth', contractAddress: '0xcontract' },
        { tokenId: '2', name: 'example.dcl.eth', contractAddress: '0xcontract' }
      ]
    }

    beforeEach(() => {
      lambdasClientMock.getNames = jest.fn().mockResolvedValue(mockNamesResponse)
    })

    describe('and the request succeeds', () => {
      it('should return formatted owned names', async () => {
        const result = await catalystClient.getOwnedNames(address)

        expect(lambdasClientMock.getNames).toHaveBeenCalledWith(address, undefined)
        expect(result).toEqual([
          {
            id: '1',
            name: 'test.dcl.eth',
            contractAddress: '0xcontract',
            tokenId: '1'
          },
          {
            id: '2',
            name: 'example.dcl.eth',
            contractAddress: '0xcontract',
            tokenId: '2'
          }
        ])
      })

      it('should pass optional parameters to the server', async () => {
        const params: GetNamesParams = { pageSize: '10', pageNum: '0' }
        await catalystClient.getOwnedNames(address, params)

        expect(lambdasClientMock.getNames).toHaveBeenCalledWith(address, params)
      })
    })

    describe('and the catalyst server fails', () => {
      beforeEach(() => {
        lambdasClientMock.getNames = jest
          .fn()
          .mockRejectedValueOnce(new Error('Server error'))
          .mockResolvedValueOnce(mockNamesResponse)
      })

      it('should retry the request', async () => {
        const result = await catalystClient.getOwnedNames(address)

        expect(lambdasClientMock.getNames).toHaveBeenCalledTimes(2)
        expect(result).toEqual([
          {
            id: '1',
            name: 'test.dcl.eth',
            contractAddress: '0xcontract',
            tokenId: '1'
          },
          {
            id: '2',
            name: 'example.dcl.eth',
            contractAddress: '0xcontract',
            tokenId: '2'
          }
        ])
      })
    })
  })
})
