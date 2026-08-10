import { resolveClientIp } from '../../../src/utils/client-ip'

describe('when resolving a client IP from proxy headers', () => {
  let headers: Headers
  let result: string | null

  describe('and x-forwarded-for carries a single entry', () => {
    beforeEach(() => {
      headers = new Headers({ 'x-forwarded-for': '203.0.113.7' })
      result = resolveClientIp(headers)
    })

    it('should return that address', () => {
      expect(result).toBe('203.0.113.7')
    })
  })

  describe('and the client prepends forged entries to x-forwarded-for', () => {
    beforeEach(() => {
      headers = new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 198.51.100.42' })
      result = resolveClientIp(headers)
    })

    it('should return the rightmost entry, which the closest proxy appended', () => {
      expect(result).toBe('198.51.100.42')
    })
  })

  describe('and cf-connecting-ip is present alongside x-forwarded-for', () => {
    beforeEach(() => {
      headers = new Headers({
        'cf-connecting-ip': '198.51.100.7',
        'x-forwarded-for': '1.1.1.1'
      })
      result = resolveClientIp(headers)
    })

    it('should prefer the edge-overwritten cf-connecting-ip', () => {
      expect(result).toBe('198.51.100.7')
    })
  })

  describe('and only x-real-ip is present', () => {
    beforeEach(() => {
      headers = new Headers({ 'x-real-ip': '203.0.113.9' })
      result = resolveClientIp(headers)
    })

    it('should fall back to it', () => {
      expect(result).toBe('203.0.113.9')
    })
  })

  describe('and the forwarded value is not an IP address', () => {
    beforeEach(() => {
      headers = new Headers({ 'cf-connecting-ip': 'not-an-ip' })
      result = resolveClientIp(headers)
    })

    it('should reject the value', () => {
      expect(result).toBeNull()
    })
  })

  describe('and no forwarding header is present', () => {
    beforeEach(() => {
      headers = new Headers()
      result = resolveClientIp(headers)
    })

    it('should report that the address could not be determined', () => {
      expect(result).toBeNull()
    })
  })

  describe('and x-forwarded-for is present but empty', () => {
    beforeEach(() => {
      headers = new Headers({ 'x-forwarded-for': '  ,  ' })
      result = resolveClientIp(headers)
    })

    it('should report that the address could not be determined', () => {
      expect(result).toBeNull()
    })
  })
})
