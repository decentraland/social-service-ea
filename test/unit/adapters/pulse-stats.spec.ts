import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createPulseStatsComponent } from '../../../src/adapters/pulse-stats'
import { IPulseStatsComponent } from '../../../src/types'
import { createMockConfigComponent, mockFetcher, mockLogs, mockRedis } from '../../mocks/components'
import { PEERS_CACHE_KEY } from '../../../src/utils/peers'

const PULSE_URL = 'https://pulse.example.com'

const peersAllGolden = JSON.parse(
  readFileSync(resolve(__dirname, '../../fixtures/iteration-2/http/peers-all.json'), 'utf8')
)

describe('PulseStatsComponent', () => {
  let pulseStats: IPulseStatsComponent

  beforeEach(async () => {
    jest.clearAllMocks()
    pulseStats = await createPulseStatsComponent({
      logs: mockLogs,
      redis: mockRedis,
      config: createMockConfigComponent({
        requireString: jest.fn(async (key: string) => (key === 'PULSE_URL' ? PULSE_URL : undefined))
      }),
      fetcher: mockFetcher
    })
  })

  describe('when the component is created', () => {
    function buildComponent(requireString: jest.Mock) {
      return createPulseStatsComponent({
        logs: mockLogs,
        redis: mockRedis,
        config: createMockConfigComponent({ requireString: requireString as any }),
        fetcher: mockFetcher
      })
    }

    // A2: Pulse is the only presence source, so a missing URL is a total presence outage whose only
    // symptom used to be a fetch error every 5 s. It has to be a loud boot failure instead, always —
    // there is no other mode where the requirement is relaxed.
    it('should fail to start when PULSE_URL is missing', async () => {
      const requireString = jest.fn(async (key: string) => {
        throw new Error(`Configuration: string ${key} is required`)
      })

      await expect(buildComponent(requireString)).rejects.toThrow('PULSE_URL')
      expect(requireString).toHaveBeenCalledWith('PULSE_URL')
    })

    it('should use the required PULSE_URL to fetch peers', async () => {
      const requireString = jest.fn(async (_key: string) => PULSE_URL)

      const component = await buildComponent(requireString)
      mockFetcher.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ ok: true, peers: [] })
      } as any)
      await component.fetchPeers()

      expect(mockFetcher.fetch).toHaveBeenCalledWith(`${PULSE_URL}/peers?all=true`)
    })

    // R2-F1: a `requireString` that throws only proves the adapter asks. `.env.default` is a *live*
    // config source inside the deployed image (`src/components.ts` loads `['.env.default', '.env']`,
    // the Dockerfile copies the file into the process's cwd), so a placeholder in it would satisfy
    // `requireString` and A2's loud boot failure would never happen where it matters. These resolve
    // `PULSE_URL` exactly as the container does.
    describe('and the config is the real dotenv component reading the committed .env.default', () => {
      const ENV_DEFAULT_PATH = resolve(__dirname, '../../../.env.default')

      let envSnapshot: NodeJS.ProcessEnv

      beforeEach(() => {
        envSnapshot = { ...process.env }
        delete process.env.PULSE_URL
      })

      afterEach(() => {
        for (const key of Object.keys(process.env)) {
          if (!(key in envSnapshot)) {
            delete process.env[key]
          }
        }
        Object.assign(process.env, envSnapshot)
      })

      async function buildWithRealConfig() {
        const config = await createDotEnvConfigComponent({ path: [ENV_DEFAULT_PATH] })

        return createPulseStatsComponent({ logs: mockLogs, redis: mockRedis, config, fetcher: mockFetcher })
      }

      it('should fail to start when .env.default is the only source of PULSE_URL', async () => {
        await expect(buildWithRealConfig()).rejects.toThrow('PULSE_URL')
      })

      it('should start when PULSE_URL resolves to an absolute http(s) URL', async () => {
        process.env.PULSE_URL = 'http://pulse.example.com'

        await expect(buildWithRealConfig()).resolves.toBeDefined()
      })

      it.each(['<URL>', '', 'pulse.example.com', 'ftp://pulse.example.com'])(
        'should fail to start when PULSE_URL resolves to %p',
        async (value) => {
          process.env.PULSE_URL = value

          await expect(buildWithRealConfig()).rejects.toThrow('PULSE_URL')
        }
      )
    })
  })

  describe('when fetching peers', () => {
    describe('and Pulse answers the all-realms golden body', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(peersAllGolden.body)
        } as any)
      })

      it('should call GET /peers?all=true so every realm is reconciled', async () => {
        await pulseStats.fetchPeers()

        expect(mockFetcher.fetch).toHaveBeenCalledWith(`${PULSE_URL}/peers?all=true`)
      })

      it('should return the ids of every peer in the body, including world peers', async () => {
        const result = await pulseStats.fetchPeers()

        expect(result).toEqual(peersAllGolden.body.peers.map((peer: { id: string }) => peer.id))
        expect(result).toContain('0x0000000000000000000000000000000000000003') // cozyfarm.dcl.eth
      })
    })

    describe('and Pulse answers with mixed-case ids', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ ok: true, peers: [{ id: '0x00000000000000000000000000000000000000AB' }] })
        } as any)
      })

      it('should lowercase them', async () => {
        await expect(pulseStats.fetchPeers()).resolves.toEqual(['0x00000000000000000000000000000000000000ab'])
      })
    })

    describe('and the response is not ok', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockResolvedValue({ ok: false, statusText: 'Not Found' } as any)
      })

      it('should throw', async () => {
        await expect(pulseStats.fetchPeers()).rejects.toThrow('Error fetching peers: Not Found')
      })
    })

    it('should cancel an unsuccessful response body before rejecting', async () => {
      const cancel = jest.fn().mockResolvedValue(undefined)
      mockFetcher.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Service Unavailable',
        bodyUsed: false,
        body: { cancel }
      } as any)
      await expect(pulseStats.fetchPeers()).rejects.toThrow('Error fetching peers: Service Unavailable')
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    describe('and the fetch fails', () => {
      beforeEach(() => {
        mockFetcher.fetch.mockRejectedValue(new Error('Fetch failed'))
      })

      it('should throw', async () => {
        await expect(pulseStats.fetchPeers()).rejects.toThrow('Fetch failed')
      })
    })
  })

  describe('when getting peers from the cache', () => {
    it('should read the shared reconciled-peers cache key', async () => {
      mockRedis.get.mockResolvedValue(['0x123'])

      await expect(pulseStats.getPeers()).resolves.toEqual(['0x123'])
      expect(mockRedis.get).toHaveBeenCalledWith(PEERS_CACHE_KEY)
    })

    it('should return an empty array when nothing is cached', async () => {
      mockRedis.get.mockResolvedValue(null)

      await expect(pulseStats.getPeers()).resolves.toEqual([])
    })
  })
})
