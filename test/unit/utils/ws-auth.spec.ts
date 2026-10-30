import { RequestError } from '@dcl/crypto-middleware'
import { parseAuthChainHeaders } from '../../../src/utils/ws-auth'

describe('when parsing the auth chain frame', () => {
  describe('and the frame is a valid headers object', () => {
    it('should return the headers as sent', () => {
      const frame = { 'x-identity-auth-chain-0': '{}', 'x-identity-timestamp': '1', 'x-identity-metadata': '{}' }

      expect(parseAuthChainHeaders(JSON.stringify(frame))).toEqual(frame)
    })

    it('should accept header values given as arrays of strings', () => {
      const frame = { 'x-identity-auth-chain-0': ['a', 'b'] }

      expect(parseAuthChainHeaders(JSON.stringify(frame))).toEqual(frame)
    })

    it('should leave unrelated fields alone', () => {
      const frame = { 'x-identity-timestamp': '1', other: 5 }

      expect(parseAuthChainHeaders(JSON.stringify(frame))).toEqual(frame)
    })

    it('should validate the identity headers regardless of their casing', () => {
      expect(() => parseAuthChainHeaders(JSON.stringify({ 'X-Identity-Timestamp': 1 }))).toThrow(RequestError)
    })
  })

  describe.each([
    ['text that is not JSON', 'nope'],
    ['an empty string', ''],
    ['null', 'null'],
    ['an array', '[]'],
    ['a string', '"x"'],
    ['a number', '5'],
    ['a boolean', 'true'],
    ['a numeric identity header', '{"x-identity-timestamp":1}'],
    ['a null identity header', '{"x-identity-timestamp":null}'],
    ['an object identity header', '{"x-identity-timestamp":{}}'],
    ['an array with a non-string identity header', '{"x-identity-auth-chain-0":["a",1]}']
  ])('and the frame is %s', (_description, frame) => {
    it('should raise a 400 request error', () => {
      expect.assertions(2)
      try {
        parseAuthChainHeaders(frame)
      } catch (error: any) {
        expect(error).toBeInstanceOf(RequestError)
        expect(error.statusCode).toBe(400)
      }
    })

    it('should not echo the frame back in the message', () => {
      try {
        parseAuthChainHeaders(frame)
      } catch (error: any) {
        if (frame.length > 3) {
          expect(error.message).not.toContain(frame)
        }
      }
    })
  })
})
