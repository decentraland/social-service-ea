import { InvalidRequestError, NotAuthorizedError } from '@dcl/http-commons'
import { parseMembershipFilters } from '../../../src/utils/membership-filters'
import { CommunityRole } from '../../../src/types/entities'

describe('when parsing the membership filters of a community listing request', () => {
  let userAddress: string

  beforeEach(() => {
    userAddress = '0x1234567890123456789012345678901234567890'
  })

  describe('and no membership filter is requested', () => {
    let result: ReturnType<typeof parseMembershipFilters>

    beforeEach(() => {
      result = parseMembershipFilters(new URLSearchParams('search=test'), undefined)
    })

    it('should leave both filters unset for an anonymous caller', () => {
      expect(result).toEqual({ onlyMemberOf: false, roles: undefined })
    })
  })

  describe('and roles are requested by an authenticated caller', () => {
    let result: ReturnType<typeof parseMembershipFilters>

    beforeEach(() => {
      result = parseMembershipFilters(new URLSearchParams('roles=owner&roles=moderator'), userAddress)
    })

    it('should pass every requested role through', () => {
      expect(result.roles).toEqual([CommunityRole.Owner, CommunityRole.Moderator])
    })
  })

  describe('and onlyMemberOf is requested by an authenticated caller', () => {
    let result: ReturnType<typeof parseMembershipFilters>

    beforeEach(() => {
      result = parseMembershipFilters(new URLSearchParams('onlyMemberOf=true'), userAddress)
    })

    it('should pass the filter through', () => {
      expect(result.onlyMemberOf).toBe(true)
    })
  })

  describe('and roles are requested without an identity', () => {
    let thrown: unknown

    beforeEach(() => {
      try {
        parseMembershipFilters(new URLSearchParams('roles=owner&roles=moderator'), undefined)
      } catch (error) {
        thrown = error
      }
    })

    it('should refuse rather than answer with an unfiltered listing', () => {
      expect(thrown).toBeInstanceOf(NotAuthorizedError)
    })
  })

  describe('and onlyMemberOf is requested without an identity', () => {
    let thrown: unknown

    beforeEach(() => {
      try {
        parseMembershipFilters(new URLSearchParams('onlyMemberOf=true'), undefined)
      } catch (error) {
        thrown = error
      }
    })

    it('should refuse rather than answer with an unfiltered listing', () => {
      expect(thrown).toBeInstanceOf(NotAuthorizedError)
    })
  })

  describe('and a requested role is not a community role', () => {
    let thrown: unknown

    beforeEach(() => {
      try {
        parseMembershipFilters(new URLSearchParams('roles=owner&roles=onwer'), userAddress)
      } catch (error) {
        thrown = error
      }
    })

    it('should refuse rather than silently drop it', () => {
      expect(thrown).toBeInstanceOf(InvalidRequestError)
    })

    it('should name the value it could not accept', () => {
      expect((thrown as Error).message).toContain('onwer')
    })
  })

  describe('and every requested role is invalid', () => {
    let thrown: unknown

    beforeEach(() => {
      try {
        parseMembershipFilters(new URLSearchParams('roles=nonsense'), userAddress)
      } catch (error) {
        thrown = error
      }
    })

    it('should refuse rather than falling back to no filter at all', () => {
      expect(thrown).toBeInstanceOf(InvalidRequestError)
    })
  })
})
