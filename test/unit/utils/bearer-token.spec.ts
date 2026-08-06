import { matchesBearerToken } from '../../../src/utils/bearer-token'

describe('when matching a bearer token', () => {
  let expectedToken: string

  beforeEach(() => {
    expectedToken = 'sk-example123'
  })

  describe('and the header presents the expected token', () => {
    it('should match', () => {
      expect(matchesBearerToken(`Bearer ${expectedToken}`, expectedToken)).toBe(true)
    })
  })

  describe('and the header presents a different token of the same length', () => {
    it('should not match', () => {
      expect(matchesBearerToken('Bearer sk-example999', expectedToken)).toBe(false)
    })
  })

  describe('and the header presents a token of a different length', () => {
    it('should not match rather than throw', () => {
      expect(matchesBearerToken('Bearer short', expectedToken)).toBe(false)
    })
  })

  describe('and the scheme is not Bearer', () => {
    it('should not match', () => {
      expect(matchesBearerToken(`Basic ${expectedToken}`, expectedToken)).toBe(false)
    })
  })

  describe('and the header is absent', () => {
    it('should not match', () => {
      expect(matchesBearerToken(null, expectedToken)).toBe(false)
    })
  })

  describe('and no token is configured', () => {
    it('should not match, so an unset token never grants access', () => {
      expect(matchesBearerToken('Bearer anything', undefined)).toBe(false)
    })
  })

  describe('and neither the header nor the token is set', () => {
    it('should not match', () => {
      expect(matchesBearerToken(undefined, undefined)).toBe(false)
    })
  })
})
