import {
  BLOCKED_USERS_MAX_LIMIT,
  FRIENDS_DEFAULT_LIMIT,
  FRIENDS_MAX_LIMIT,
  FRIENDSHIP_REQUESTS_DEFAULT_LIMIT,
  FRIENDSHIP_REQUESTS_MAX_LIMIT,
  MAX_PAGINATION_OFFSET,
  normalizeBlockedUsersPagination,
  normalizeFriendsPagination,
  normalizeFriendshipRequestsPagination
} from '../../../src/utils/friendship-pagination'
import type { Pagination } from '../../../src/types'

describe('when normalizing friendship request pagination', () => {
  let pagination: Pagination | undefined
  let result: Pagination

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and pagination is omitted', () => {
    beforeEach(() => {
      pagination = undefined
      result = normalizeFriendshipRequestsPagination(pagination)
    })

    it('should return the bounded Unity-compatible default page', () => {
      expect(result).toEqual({ limit: FRIENDSHIP_REQUESTS_DEFAULT_LIMIT, offset: 0 })
    })
  })

  describe('and the requested limit exceeds the maximum', () => {
    beforeEach(() => {
      pagination = { limit: FRIENDSHIP_REQUESTS_MAX_LIMIT + 1, offset: 200 }
      result = normalizeFriendshipRequestsPagination(pagination)
    })

    it('should cap the limit and preserve the valid offset', () => {
      expect(result).toEqual({ limit: FRIENDSHIP_REQUESTS_MAX_LIMIT, offset: 200 })
    })
  })

  describe('and values are invalid', () => {
    beforeEach(() => {
      pagination = { limit: 0, offset: -1 }
      result = normalizeFriendshipRequestsPagination(pagination)
    })

    it('should replace them with safe defaults', () => {
      expect(result).toEqual({ limit: FRIENDSHIP_REQUESTS_DEFAULT_LIMIT, offset: 0 })
    })
  })

  describe('and values contain fractions', () => {
    beforeEach(() => {
      pagination = { limit: 10.9, offset: 20.9 }
      result = normalizeFriendshipRequestsPagination(pagination)
    })

    it('should normalize them to integers', () => {
      expect(result).toEqual({ limit: 10, offset: 20 })
    })
  })

  describe('and the requested limit is a fraction below one', () => {
    beforeEach(() => {
      pagination = { limit: 0.5, offset: 0 }
      result = normalizeFriendshipRequestsPagination(pagination)
    })

    it('should fall back to the default rather than asking for zero rows', () => {
      expect(result.limit).toBe(FRIENDSHIP_REQUESTS_DEFAULT_LIMIT)
    })
  })

  describe('and the requested offset exceeds the maximum', () => {
    beforeEach(() => {
      pagination = { limit: 10, offset: 2147483647 }
      result = normalizeFriendshipRequestsPagination(pagination)
    })

    it('should cap the offset', () => {
      expect(result).toEqual({ limit: 10, offset: MAX_PAGINATION_OFFSET })
    })
  })
})

describe('when normalizing friends pagination', () => {
  let pagination: Pagination | undefined
  let result: Pagination

  describe("and the caller requests Unity Explorer's 1000-item friends-cache prewarm", () => {
    beforeEach(() => {
      pagination = { limit: 1000, offset: 0 }
      result = normalizeFriendsPagination(pagination)
    })

    it('should pass the page through untouched, since capping it would truncate the cache', () => {
      expect(result).toEqual({ limit: 1000, offset: 0 })
    })
  })

  describe('and pagination is omitted', () => {
    beforeEach(() => {
      pagination = undefined
      result = normalizeFriendsPagination(pagination)
    })

    it('should bound an otherwise unlimited query', () => {
      expect(result).toEqual({ limit: FRIENDS_DEFAULT_LIMIT, offset: 0 })
    })
  })

  describe('and the requested limit exceeds the maximum', () => {
    beforeEach(() => {
      pagination = { limit: 2147483647, offset: 0 }
      result = normalizeFriendsPagination(pagination)
    })

    it('should cap the limit', () => {
      expect(result).toEqual({ limit: FRIENDS_MAX_LIMIT, offset: 0 })
    })
  })
})

describe('when normalizing blocked users pagination', () => {
  let pagination: Pagination | undefined
  let result: Pagination

  describe("and the caller requests Unity Explorer's 50-item page", () => {
    beforeEach(() => {
      pagination = { limit: 50, offset: 100 }
      result = normalizeBlockedUsersPagination(pagination)
    })

    it('should pass the page through untouched', () => {
      expect(result).toEqual({ limit: 50, offset: 100 })
    })
  })

  describe('and the requested limit exceeds the maximum', () => {
    beforeEach(() => {
      pagination = { limit: 2147483647, offset: 0 }
      result = normalizeBlockedUsersPagination(pagination)
    })

    it('should cap the limit', () => {
      expect(result).toEqual({ limit: BLOCKED_USERS_MAX_LIMIT, offset: 0 })
    })
  })
})
