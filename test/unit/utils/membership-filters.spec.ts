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

  describe('and one requested role is unrecognized alongside a valid one', () => {
    let result: ReturnType<typeof parseMembershipFilters>

    beforeEach(() => {
      result = parseMembershipFilters(new URLSearchParams('roles=owner&roles=onwer'), userAddress)
    })

    it('should keep the valid one, so the answer is narrower rather than wider', () => {
      expect(result.roles).toEqual([CommunityRole.Owner])
    })
  })

  describe('and every requested role is unrecognized', () => {
    let thrown: unknown

    beforeEach(() => {
      try {
        parseMembershipFilters(new URLSearchParams('roles=nonsense'), userAddress)
      } catch (error) {
        thrown = error
      }
    })

    it('should refuse rather than dropping the filter and widening the listing', () => {
      expect(thrown).toBeInstanceOf(InvalidRequestError)
    })

    it('should name the value it could not accept', () => {
      expect((thrown as Error).message).toContain('nonsense')
    })
  })

  describe('and the roles parameter is present but empty', () => {
    let result: ReturnType<typeof parseMembershipFilters>

    beforeEach(() => {
      // Clients serialize an unset field this way; it means no filter, not an invalid one.
      result = parseMembershipFilters(new URLSearchParams('roles=&roles='), undefined)
    })

    it('should treat it as no filter at all, even without an identity', () => {
      expect(result).toEqual({ onlyMemberOf: false, roles: undefined })
    })
  })
})
