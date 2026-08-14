import { AUTH_METADATA_HEADER } from '@dcl/crypto-middleware'
import { test } from '../components'
import { createAuthHeaders, createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

const PATH = '/v1/mutes'
const SIGNED_METADATA = { signer: 'decentraland-kernel-scene' }
const DELIVERED_METADATA = JSON.stringify({ signer: 'Decentraland-Kernel-Scene' })

test('Canonical Signer', function ({ components }) {
  const makeRequest = makeAuthenticatedRequest(components)

  let identity: Identity

  beforeEach(async () => {
    identity = await createTestIdentity()
  })

  describe('when the canonical signer was signed but a mixed-case spelling is delivered', () => {
    it('should reject the request at the auth-chain layer', async () => {
      // The canonical payload is lowercased before signing, so a metadata value differing only in
      // case shares the signature. Overwriting the header after signing leaves the request genuinely
      // authentic while reading differently to any case-sensitive comparison downstream. This is the
      // attack, not a mock: nothing here weakens the signature.
      //
      // `isSceneSigner` already normalizes casing, so this service was never bypassable here — it
      // rejected the same request one layer later with `Invalid metadata content`. The assertion
      // pins the rejection to the auth-chain layer, which runs before signature verification and
      // before any consumer metadataValidator.
      const headers = createAuthHeaders('GET', PATH, SIGNED_METADATA, identity)
      headers[AUTH_METADATA_HEADER] = DELIVERED_METADATA

      const response = await components.localHttpFetch.fetch(PATH, { method: 'GET', headers })
      const body = await response.json()

      expect(response.status).toBe(400)
      // The raw metadata is echoed back truncated at 64 characters, so match the prefix.
      expect(body.error).toMatch(/^Invalid chain metadata: /)
    })
  })

  describe('when the canonical signer is delivered exactly as signed', () => {
    it('should reject it as a scene request', async () => {
      const headers = createAuthHeaders('GET', PATH, SIGNED_METADATA, identity)

      const response = await components.localHttpFetch.fetch(PATH, { method: 'GET', headers })
      const body = await response.json()

      // The canonical spelling is already lowercase, so it passes the auth-chain guard and is
      // rejected one layer later by the route's own `!isSceneSigner(metadata)` validator.
      expect(response.status).toBe(400)
      expect(body.error).toMatch(/^Invalid metadata content: /)
    })
  })

  describe('when the request carries no signer at all', () => {
    it('should authenticate normally and reach the handler', async () => {
      const response = await makeRequest(identity, PATH)
      const body = await response.json()

      // Ordinary user traffic must be untouched by the guard: this gets all the way to the handler,
      // which reports no mutes for this freshly generated identity.
      expect(response.status).toBe(200)
      expect(body.data.results).toEqual([])
      expect(body.data.total).toBe(0)
    })
  })
})
