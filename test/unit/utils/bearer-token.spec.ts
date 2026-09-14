import { matchesBearerToken } from '../../../src/utils/bearer-token'

// Required form: a namespace import would copy the module and the spy would not be observed.
import crypto = require('crypto')

describe('when matching a bearer token', () => {
  let expectedToken: string

  beforeEach(() => {
    expectedToken = 'example-token-123'
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the header presents the expected token', () => {
    let authorizationHeader: string

    beforeEach(() => {
      authorizationHeader = `Bearer ${expectedToken}`
    })

    it('should match', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(true)
    })
  })

  describe('and the header presents a different token of the same length', () => {
    let authorizationHeader: string

    beforeEach(() => {
      authorizationHeader = 'Bearer example-token-999'
    })

    it('should not match', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(false)
    })
  })

  describe('and the header presents a token of a different length', () => {
    let authorizationHeader: string

    beforeEach(() => {
      authorizationHeader = 'Bearer example'
    })

    it('should not match instead of throwing on the length mismatch', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(false)
    })
  })

  describe('and the header appends an extra segment after the expected token', () => {
    let authorizationHeader: string

    beforeEach(() => {
      authorizationHeader = `Bearer ${expectedToken} extra`
    })

    it('should not match, so a malformed header is rejected', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(false)
    })
  })

  describe('and the header pads the scheme and the expected token with extra whitespace', () => {
    let authorizationHeader: string

    beforeEach(() => {
      authorizationHeader = `Bearer  ${expectedToken}`
    })

    it('should not match, so only an exact header is accepted', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(false)
    })
  })

  describe('and the scheme is not Bearer', () => {
    let authorizationHeader: string

    beforeEach(() => {
      authorizationHeader = `Basic ${expectedToken}`
    })

    it('should not match', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(false)
    })
  })

  describe('and the header carries the scheme without a token', () => {
    let authorizationHeader: string

    beforeEach(() => {
      authorizationHeader = 'Bearer '
    })

    it('should not match', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(false)
    })
  })

  describe('and the header is an empty string', () => {
    let authorizationHeader: string

    beforeEach(() => {
      authorizationHeader = ''
    })

    it('should not match', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(false)
    })
  })

  describe('and the header is absent', () => {
    let authorizationHeader: null

    beforeEach(() => {
      authorizationHeader = null
    })

    it('should not match', () => {
      expect(matchesBearerToken(authorizationHeader, expectedToken)).toBe(false)
    })
  })

  describe('and no token is configured', () => {
    let unsetToken: string | undefined

    beforeEach(() => {
      unsetToken = undefined
    })

    describe('and the header presents a token', () => {
      let authorizationHeader: string

      beforeEach(() => {
        authorizationHeader = `Bearer ${expectedToken}`
      })

      it('should not match', () => {
        expect(matchesBearerToken(authorizationHeader, unsetToken)).toBe(false)
      })
    })

    describe('and the header presents an empty token', () => {
      let authorizationHeader: string

      beforeEach(() => {
        authorizationHeader = 'Bearer '
      })

      it('should not match, so an unset token never grants access', () => {
        expect(matchesBearerToken(authorizationHeader, unsetToken)).toBe(false)
      })
    })
  })

  describe('and the configured token is an empty string', () => {
    let authorizationHeader: string
    let emptyToken: string

    beforeEach(() => {
      authorizationHeader = 'Bearer '
      emptyToken = ''
    })

    it('should not match, so an empty token never grants access', () => {
      expect(matchesBearerToken(authorizationHeader, emptyToken)).toBe(false)
    })
  })

  describe('and the presented and expected tokens are compared', () => {
    let timingSafeEqualSpy: jest.SpyInstance
    let expectedTokenDigest: Buffer

    beforeEach(() => {
      expectedTokenDigest = crypto.createHash('sha256').update(expectedToken).digest()
      timingSafeEqualSpy = jest.spyOn(crypto, 'timingSafeEqual')
    })

    describe('and the header presents the expected token', () => {
      let authorizationHeader: string

      beforeEach(() => {
        authorizationHeader = `Bearer ${expectedToken}`
        matchesBearerToken(authorizationHeader, expectedToken)
      })

      it('should compare both fixed-length digests with the constant-time primitive', () => {
        expect(timingSafeEqualSpy).toHaveBeenCalledWith(expectedTokenDigest, expectedTokenDigest)
      })
    })

    describe('and the header presents a token of a different length', () => {
      let presentedToken: string
      let authorizationHeader: string
      let presentedTokenDigest: Buffer

      beforeEach(() => {
        presentedToken = 'example'
        authorizationHeader = `Bearer ${presentedToken}`
        presentedTokenDigest = crypto.createHash('sha256').update(presentedToken).digest()
        matchesBearerToken(authorizationHeader, expectedToken)
      })

      it('should still compare both fixed-length digests with the constant-time primitive', () => {
        expect(timingSafeEqualSpy).toHaveBeenCalledWith(presentedTokenDigest, expectedTokenDigest)
      })
    })
  })
})
