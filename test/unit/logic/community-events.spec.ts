import { createCommunityEventsComponent } from '../../../src/logic/community/events'
import { ICommunityEventsComponent } from '../../../src/logic/community/types'
import { mockConfig, mockLogs, mockFetcher, mockRedis } from '../../mocks/components'

describe('CommunityEventsComponent', () => {
  let communityEventsComponent: ICommunityEventsComponent
  let mockFetcherInstance: jest.Mocked<typeof mockFetcher>
  let mockRedisInstance: jest.Mocked<typeof mockRedis>

  beforeEach(() => {
    mockFetcherInstance = mockFetcher as jest.Mocked<typeof mockFetcher>
    mockRedisInstance = mockRedis as jest.Mocked<typeof mockRedis>

    mockConfig.requireString.mockResolvedValue('https://events.decentraland.zone')
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when checking if community is currently hosting events', () => {
    let communityId: string
    let cacheKey: string

    beforeEach(async () => {
      communityId = 'test-community-123'
      cacheKey = `community:${communityId}:live-event`

      // Setup logger mock before creating component
      mockLogs.getLogger.mockReturnValue({
        log: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
      })

      communityEventsComponent = await createCommunityEventsComponent({
        config: mockConfig,
        logs: mockLogs,
        fetcher: mockFetcherInstance,
        redis: mockRedisInstance
      })
    })

    describe('and cached value exists', () => {
      describe('and cached value is true', () => {
        beforeEach(() => {
          mockRedisInstance.get.mockResolvedValue('true')
        })

        it('should return true without making API call', async () => {
          const result = await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(result).toBe(true)
          expect(mockRedisInstance.get).toHaveBeenCalledWith(cacheKey)
          expect(mockFetcherInstance.fetch).not.toHaveBeenCalled()
        })
      })

      describe('and cached value is false', () => {
        beforeEach(() => {
          mockRedisInstance.get.mockResolvedValue('false')
        })

        it('should return false without making API call', async () => {
          const result = await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(result).toBe(false)
          expect(mockRedisInstance.get).toHaveBeenCalledWith(cacheKey)
          expect(mockFetcherInstance.fetch).not.toHaveBeenCalled()
        })
      })
    })

    describe('and no cached value exists', () => {
      beforeEach(() => {
        mockRedisInstance.get.mockResolvedValue(null)
      })

      describe('and API returns live events', () => {
        let mockLiveEventsResponse: any

        beforeEach(() => {
          mockLiveEventsResponse = {
            ok: true,
            data: {
              events: [
                {
                  id: 'live-event-1',
                  name: 'Live Event 1',
                  finish_at: new Date(Date.now() + 1800000).toISOString(), // 30 minutes from now
                  start_at: '2024-01-01T10:00:00Z',
                  user: '0x1234567890123456789012345678901234567890',
                  approved: true,
                  created_at: '2024-01-01T09:00:00Z',
                  updated_at: '2024-01-01T09:00:00Z',
                  total_attendees: 10,
                  latest_attendees: ['0x1234567890123456789012345678901234567890'],
                  rejected: false,
                  trending: false,
                  all_day: false,
                  recurrent: false,
                  duration: 7200,
                  recurrent_dates: [],
                  highlighted: false,
                  next_start_at: '2024-01-01T10:00:00Z',
                  next_finish_at: '2024-01-01T12:00:00Z',
                  live: false,
                  world: false
                },
                {
                  id: 'live-event-2',
                  name: 'Live Event 2',
                  finish_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
                  start_at: '2024-01-01T11:00:00Z',
                  user: '0x1234567890123456789012345678901234567890',
                  approved: true,
                  created_at: '2024-01-01T09:00:00Z',
                  updated_at: '2024-01-01T09:00:00Z',
                  total_attendees: 5,
                  latest_attendees: ['0x1234567890123456789012345678901234567890'],
                  rejected: false,
                  trending: false,
                  all_day: false,
                  recurrent: false,
                  duration: 7200,
                  recurrent_dates: [],
                  highlighted: false,
                  next_start_at: '2024-01-01T11:00:00Z',
                  next_finish_at: '2024-01-01T13:00:00Z',
                  live: false,
                  world: false
                }
              ]
            }
          }

          mockFetcherInstance.fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockLiveEventsResponse)
          } as any)
        })

        it('should fetch live events with correct URL', async () => {
          await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(mockFetcherInstance.fetch).toHaveBeenCalledWith(
            'https://events.decentraland.zone/api/events?community_id=test-community-123&list=live'
          )
        })

        it('should return true when live events exist', async () => {
          const result = await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(result).toBe(true)
        })

        it('should cache the result as true', async () => {
          await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(mockRedisInstance.put).toHaveBeenCalledWith(
            cacheKey,
            'true',
            { EX: expect.any(Number) }
          )
        })

        it('should use the event with the latest finish_at for TTL calculation', async () => {
          await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          // Should use the event that finishes later (1 hour from now) for TTL
          const putCall = mockRedisInstance.put.mock.calls[0]
          const ttl = putCall[2].EX
          
          // TTL should be approximately 3600 seconds (1 hour) minus a small buffer
          expect(ttl).toBeGreaterThan(3500)
          expect(ttl).toBeLessThanOrEqual(3600)
        })

        it('should cache the result only once', async () => {
          await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(mockRedisInstance.put).toHaveBeenCalledTimes(1)
        })
      })

      describe('and API returns no live events', () => {
        beforeEach(() => {
          const mockEmptyResponse = {
            ok: true,
            data: { events: [] }
          }

          mockFetcherInstance.fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockEmptyResponse)
          } as any)
        })

        it('should return false when no live events exist', async () => {
          const result = await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(result).toBe(false)
        })

        it('should cache the result as false with default TTL', async () => {
          await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(mockRedisInstance.put).toHaveBeenCalledWith(cacheKey, 'false', { EX: 600 })
        })
      })

      describe('and API call fails', () => {
        beforeEach(() => {
          mockFetcherInstance.fetch.mockResolvedValue({
            ok: false,
            status: 500
          } as any)
        })

        it('should return false when API call fails', async () => {
          const result = await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(result).toBe(false)
        })
      })

      describe('and network request throws an exception', () => {
        beforeEach(() => {
          mockFetcherInstance.fetch.mockRejectedValue(new Error('Network error'))
        })

        it('should return false when network request throws an exception', async () => {
          const result = await communityEventsComponent.isCurrentlyHostingEvents(communityId)

          expect(result).toBe(false)
        })
      })
    })

    describe('and Redis get operation throws an exception', () => {
      beforeEach(() => {
        mockRedisInstance.get.mockRejectedValue(new Error('Redis error'))
      })

      it('should continue with API call and return result', async () => {
        const mockLiveEventsResponse = {
          ok: true,
          data: { events: [{ id: 'live-event-1', finish_at: new Date(Date.now() + 3600000).toISOString() }] }
        }

        mockFetcherInstance.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(mockLiveEventsResponse)
        } as any)

        const result = await communityEventsComponent.isCurrentlyHostingEvents(communityId)

        expect(result).toBe(true)
        expect(mockFetcherInstance.fetch).toHaveBeenCalled()
      })
    })
  })
})
