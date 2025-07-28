import { AppComponents } from '../../types'
import { ICommunityEventsComponent } from './types'

type Event = {
  id: string
  name: string
  image?: string
  description?: string
  start_at: string
  finish_at: string
  coordinates?: string[]
  user: string
  approved: boolean
  created_at: string
  updated_at: string
  total_attendees: number
  latest_attendees: string[]
  url?: string
  scene_name?: string
  user_name?: string
  rejected: boolean
  trending: boolean
  server?: string
  estate_id?: string
  estate_name?: string
  x?: number
  y?: number
  all_day: boolean
  recurrent: boolean
  recurrent_frequency?: 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY' | null
  recurrent_weekday_mask?: number
  recurrent_month_mask?: number
  recurrent_interval?: number
  recurrent_count?: number | null
  recurrent_until?: string | null
  duration: number
  recurrent_dates: string[]
  recurrent_setpos?: number | null
  recurrent_monthday?: number | null
  highlighted: boolean
  next_start_at: string
  next_finish_at: string
  categories?: string[]
  schedules?: string[]
  approved_by?: string
  rejected_by?: string
  attending?: boolean
  notify?: boolean
  position?: string[]
  live: boolean
  world: boolean
  place_id?: string
}

type EventsResponse = {
  ok: boolean
  data: Event[]
  total?: number
}

const TEN_MINUTES_IN_SECONDS = 60 * 10

export async function createCommunityEventsComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'fetcher' | 'redis'>
): Promise<ICommunityEventsComponent> {
  const { config, logs, fetcher, redis } = components

  const EVENTS_API_URL = await config.requireString('EVENTS_API_URL')

  const logger = logs.getLogger('community-events-component')

  async function fetchLiveEvents(communityId: string): Promise<boolean> {
    try {
      const url = `${EVENTS_API_URL}/api/events?community_id=${communityId}&list=live`

      const response = await fetcher.fetch(url)

      if (!response.ok) {
        logger.error('Failed to check live events', { communityId, status: response.status })
        return false
      }

      const result: EventsResponse = await response.json()
      const hasLiveEvents = result.ok && result.data && result.data.length > 0

      let ttlInSeconds = TEN_MINUTES_IN_SECONDS // Default TTL: 10 minutes

      if (hasLiveEvents && result.data.length > 0) {
        // Find the event with the latest finish_at time
        const latestEvent = result.data.reduce((latest: Event, current: Event) => {
          const latestTime = new Date(latest.finish_at).getTime()
          const currentTime = new Date(current.finish_at).getTime()
          return currentTime > latestTime ? current : latest
        })

        const now = Date.now()
        const eventEndTime = new Date(latestEvent.finish_at).getTime()

        if (eventEndTime > now) {
          // Set TTL to when the latest event ends, with a minimum of 1 minute
          ttlInSeconds = Math.max(60, Math.floor((eventEndTime - now) / 1000))
        }
      }

      const cacheKey = `community:${communityId}:live-event`
      await redis.put(cacheKey, hasLiveEvents ? 'true' : 'false', { EX: ttlInSeconds })

      return hasLiveEvents
    } catch (error) {
      logger.error('Error fetching live events', { communityId, error: String(error) })
      return false
    }
  }

  async function isCurrentlyHostingEvents(communityId: string): Promise<boolean> {
    try {
      const cacheKey = `community:${communityId}:live-event`
      const cachedValue = await redis.get<string>(cacheKey)

      if (cachedValue) {
        return cachedValue === 'true'
      }

      return await fetchLiveEvents(communityId)
    } catch (error) {
      logger.error('Error checking if community is hosting events', { communityId, error: String(error) })
      // Continue with API call even if Redis fails
      return await fetchLiveEvents(communityId)
    }
  }

  return {
    isCurrentlyHostingEvents
  }
}
