import { AUTH_METADATA_HEADER } from '@dcl/crypto-middleware'
import { test } from '../components'
import { createAuthHeaders, createTestIdentity, Identity, makeAuthenticatedRequest } from './utils/auth'

const PATH = '/v1/mutes'
const SIGNED_METADATA = { signer: 'decentraland-kernel-scene' }
const RECASED_VALUE = JSON.stringify({ signer: 'Decentraland-Kernel-Scene' })
const RECASED_KEY = JSON.stringify({ Signer: 'decentraland-kernel-scene' })

test('Canonical Signer', function ({ components }) {
  const makeRequest = makeAuthenticatedRequest(components)

  let identity: Identity

  beforeEach(async () => {
    identity = await createTestIdentity()
  })

  describe('when the canonical signer was signed but a re-cased value is delivered', () => {
    let headers: Record<string, string>

    beforeEach(async () => {
      // Nothing here weakens the signature: the headers are genuinely signed, and only the
      // delivered metadata is rewritten afterwards. Under the current payload format that rewrite
      // no longer keeps the signature valid, but the metadata gate answers first — it runs before
      // signature verification — and refuses the non-canonical value outright rather than folding
      // it into a comparison it would then pass.
      headers = createAuthHeaders('GET', PATH, SIGNED_METADATA, identity)
      headers[AUTH_METADATA_HEADER] = RECASED_VALUE
    })

    it('should refuse the request with a 400 from the metadata gate', async () => {
      const response = await components.localHttpFetch.fetch(PATH, { method: 'GET', headers })
      const body = await response.json()

      expect(response.status).toBe(400)
      // The metadata is echoed back truncated at 64 characters, so match the prefix.
      expect(body.error).toMatch(/^Invalid metadata content: /)
    })
  })

  describe('when the canonical signer was signed but the key is delivered under another spelling', () => {
    let headers: Record<string, string>

    beforeEach(async () => {
      // The gate reads `signer` and nothing else, so this metadata does not claim to be a scene and
      // passes it. What refuses the request is the signature: the metadata bytes are part of the
      // signed payload now, so `{"Signer":...}` no longer shares a signature with `{"signer":...}`
      // and cannot read as absent while staying authentic.
      headers = createAuthHeaders('GET', PATH, SIGNED_METADATA, identity)
      headers[AUTH_METADATA_HEADER] = RECASED_KEY
    })

    it('should refuse the request with a 401 because the key is covered by the signature', async () => {
      const response = await components.localHttpFetch.fetch(PATH, { method: 'GET', headers })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toMatch(/^Invalid signature/)
    })
  })

  describe('when a metadata field the service does not gate on is re-cased after signing', () => {
    let headers: Record<string, string>

    beforeEach(async () => {
      // Consumer-defined fields are bound too, not just the reserved ones. `sceneId` is not read
      // anywhere in this service, and re-casing it still invalidates the request.
      headers = createAuthHeaders('GET', PATH, { sceneId: 'bafkreiabcdef' }, identity)
      headers[AUTH_METADATA_HEADER] = JSON.stringify({ sceneId: 'BAFKREIABCDEF' })
    })

    it('should refuse the request with a 401', async () => {
      const response = await components.localHttpFetch.fetch(PATH, { method: 'GET', headers })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error).toMatch(/^Invalid signature/)
    })
  })

  describe('when the canonical signer is delivered exactly as signed', () => {
    let headers: Record<string, string>

    beforeEach(async () => {
      headers = createAuthHeaders('GET', PATH, SIGNED_METADATA, identity)
    })

    it('should refuse the request as a scene request', async () => {
      const response = await components.localHttpFetch.fetch(PATH, { method: 'GET', headers })
      const body = await response.json()

      // Authentic, and still not welcome on this surface: the route's metadata gate turns down any
      // chain signed on a scene's behalf.
      expect(response.status).toBe(400)
      expect(body.error).toMatch(/^Invalid metadata content: /)
    })
  })

  describe('when a signed metadata field carries upper case and is delivered untouched', () => {
    let headers: Record<string, string>

    beforeEach(async () => {
      // The signer and the verifier build the same bytes, so mixed-case metadata is ordinary
      // traffic — it is only a rewrite between signing and delivery that fails.
      headers = createAuthHeaders('GET', PATH, { sceneId: 'BafkreiAbcDef' }, identity)
    })

    it('should authenticate normally and reach the handler', async () => {
      const response = await components.localHttpFetch.fetch(PATH, { method: 'GET', headers })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.data.results).toEqual([])
    })
  })

  describe('when the request carries no signer at all', () => {
    it('should authenticate normally and reach the handler', async () => {
      const response = await makeRequest(identity, PATH)
      const body = await response.json()

      // Ordinary user traffic must be untouched by the gate: this gets all the way to the handler,
      // which reports no mutes for this freshly generated identity.
      expect(response.status).toBe(200)
      expect(body.data.results).toEqual([])
      expect(body.data.total).toBe(0)
    })
  })
})
