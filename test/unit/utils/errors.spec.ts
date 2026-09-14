import { RequestError } from '@dcl/crypto-middleware'
import { isExpectedAuthRejection } from '../../../src/utils/errors'

describe('isExpectedAuthRejection', () => {
  describe('when the middleware rejects the credentials the client presented', () => {
    it('should classify an expired signature as expected', () => {
      const error = new RequestError(
        'Expired signature: signature timestamp: 1786442608311, timestamp expiration: 1786442908311, local timestamp: 1786453449707',
        401
      )

      expect(isExpectedAuthRejection(error)).toBe(true)
    })

    it('should classify an expired ephemeral key as expected', () => {
      const error = new RequestError(
        'Invalid signature: ERROR. Link type: ECDSA_EPHEMERAL. Ephemeral key expired. Expiration: 1785973689214. Test: 1785974339587.',
        401
      )

      expect(isExpectedAuthRejection(error)).toBe(true)
    })

    it('should classify a malformed auth chain as expected', () => {
      const error = new RequestError('Invalid Auth Chain', 400)

      expect(isExpectedAuthRejection(error)).toBe(true)
    })
  })

  describe('when the middleware cannot reach the catalyst', () => {
    it('should not classify a connection failure as expected, so the outage still reaches Sentry', () => {
      const error = new RequestError('Error connecting to catalyst "https://peer.decentraland.org": fetch failed', 503)

      expect(isExpectedAuthRejection(error)).toBe(false)
    })

    it('should not classify an unusable catalyst response as expected', () => {
      const error = new RequestError('Catalyst "https://peer.decentraland.org" returned HTTP 502', 503)

      expect(isExpectedAuthRejection(error)).toBe(false)
    })
  })

  describe('when the failure did not come from the middleware', () => {
    it('should not classify a malformed payload as expected', () => {
      expect(isExpectedAuthRejection(new SyntaxError(`Unexpected token '', "" is not valid JSON`))).toBe(false)
    })

    it('should not classify a plain error as expected', () => {
      expect(isExpectedAuthRejection(new Error('boom'))).toBe(false)
    })

    it('should not classify an error that only looks like one as expected', () => {
      expect(isExpectedAuthRejection(Object.assign(new Error('boom'), { name: 'RequestError' }))).toBe(false)
    })

    it('should not classify a non-error value as expected', () => {
      expect(isExpectedAuthRejection(undefined)).toBe(false)
      expect(isExpectedAuthRejection(null)).toBe(false)
      expect(isExpectedAuthRejection('Expired signature')).toBe(false)
    })
  })
})
