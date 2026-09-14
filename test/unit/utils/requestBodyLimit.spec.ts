import {
  DEFAULT_MAX_REQUEST_BODY_BYTES,
  MAX_ALLOWED_REQUEST_BODY_BYTES,
  resolveMaxRequestBodyBytes
} from '../../../src/utils/requestBodyLimit'

describe('when resolving the request body cap', () => {
  describe('and nothing is configured', () => {
    it('should fall back to 1 MiB', () => {
      expect(resolveMaxRequestBodyBytes(undefined)).toBe(DEFAULT_MAX_REQUEST_BODY_BYTES)
    })
  })

  describe('and a usable value is configured', () => {
    it('should take it as given', () => {
      expect(resolveMaxRequestBodyBytes(2048)).toBe(2048)
    })

    it('should allow exactly the ceiling', () => {
      expect(resolveMaxRequestBodyBytes(MAX_ALLOWED_REQUEST_BODY_BYTES)).toBe(MAX_ALLOWED_REQUEST_BODY_BYTES)
    })
  })

  describe.each([
    ['zero, which would reject every request', 0],
    ['a negative number', -1],
    ['a fraction', 1024.5],
    ['NaN, which is what a non-numeric setting parses to', NaN],
    ['a value past the ceiling, which would bound nothing', MAX_ALLOWED_REQUEST_BODY_BYTES + 1]
  ])('and the configured value is %s', (_case: string, configured: number) => {
    it('should throw rather than let the service start', () => {
      expect(() => resolveMaxRequestBodyBytes(configured)).toThrow('Invalid HTTP_MAX_REQUEST_BODY_BYTES')
    })
  })
})
