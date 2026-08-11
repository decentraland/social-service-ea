import { wellKnownComponents } from '@dcl/crypto-middleware'
import { setupHttpRoutes } from '../../../../src/controllers/routes/http.routes'
import { GlobalContext } from '../../../../src/types'

jest.mock('@dcl/crypto-middleware', () => ({
  wellKnownComponents: jest.fn(() => async () => ({ status: 200 })),
  bearerTokenMiddleware: jest.fn(() => async () => ({ status: 200 }))
}))

type MetadataValidator = (metadata: Record<string, unknown> | undefined) => boolean

describe('when setting up the http routes', () => {
  let metadataValidators: MetadataValidator[]

  beforeEach(async () => {
    await setupHttpRoutes({
      components: {
        fetcher: { fetch: jest.fn() },
        config: { getString: jest.fn().mockResolvedValue(undefined) },
        schemaValidator: { withSchemaValidatorMiddleware: jest.fn(() => async () => ({ status: 200 })) }
      }
    } as unknown as GlobalContext)

    metadataValidators = (wellKnownComponents as jest.Mock).mock.calls.map((call) => call[0].metadataValidator)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should install the signed-fetch middleware on more than one route', () => {
    expect(metadataValidators.length).toBeGreaterThan(1)
  })

  it('should give every signed-fetch route a metadata validator', () => {
    expect(metadataValidators.every((validator) => typeof validator === 'function')).toBe(true)
  })

  describe('and a chain declares the scene signer', () => {
    let results: boolean[]
    let rejectedByEveryRoute: boolean[]

    beforeEach(() => {
      results = metadataValidators.map((validator) => validator({ signer: 'decentraland-kernel-scene' }))
      rejectedByEveryRoute = metadataValidators.map(() => false)
    })

    it('should reject it on every signed-fetch route', () => {
      expect(results).toEqual(rejectedByEveryRoute)
    })
  })

  describe('and the scene signer arrives with different casing', () => {
    let results: boolean[]
    let rejectedByEveryRoute: boolean[]

    beforeEach(() => {
      results = metadataValidators.map((validator) => validator({ signer: 'Decentraland-Kernel-Scene' }))
      rejectedByEveryRoute = metadataValidators.map(() => false)
    })

    it('should reject it on every signed-fetch route', () => {
      expect(results).toEqual(rejectedByEveryRoute)
    })
  })

  describe('and the metadata is the empty object explorer clients send', () => {
    let results: boolean[]
    let acceptedByEveryRoute: boolean[]

    beforeEach(() => {
      results = metadataValidators.map((validator) => validator({}))
      acceptedByEveryRoute = metadataValidators.map(() => true)
    })

    it('should accept it on every signed-fetch route', () => {
      expect(results).toEqual(acceptedByEveryRoute)
    })
  })

  describe('and the chain is signed by another signer', () => {
    let results: boolean[]
    let acceptedByEveryRoute: boolean[]

    beforeEach(() => {
      results = metadataValidators.map((validator) => validator({ signer: 'dcl:explorer' }))
      acceptedByEveryRoute = metadataValidators.map(() => true)
    })

    it('should accept it on every signed-fetch route', () => {
      expect(results).toEqual(acceptedByEveryRoute)
    })
  })

  describe('and no metadata is supplied at all', () => {
    let results: boolean[]
    let acceptedByEveryRoute: boolean[]

    beforeEach(() => {
      results = metadataValidators.map((validator) => validator(undefined))
      acceptedByEveryRoute = metadataValidators.map(() => true)
    })

    it('should accept it on every signed-fetch route', () => {
      expect(results).toEqual(acceptedByEveryRoute)
    })
  })
})
