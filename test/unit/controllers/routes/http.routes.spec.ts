import { wellKnownComponents } from '@dcl/crypto-middleware'
import { setupHttpRoutes } from '../../../../src/controllers/routes/http.routes'
import { GlobalContext } from '../../../../src/types'

jest.mock('@dcl/crypto-middleware', () => ({
  wellKnownComponents: jest.fn(() => async () => ({ status: 200 })),
  bearerTokenMiddleware: jest.fn(() => async () => ({ status: 200 }))
}))

describe('when setting up the http routes', () => {
  let metadataValidators: Array<(metadata: Record<string, unknown> | undefined) => boolean>

  beforeEach(async () => {
    ;(wellKnownComponents as jest.Mock).mockClear()

    await setupHttpRoutes({
      components: {
        fetcher: { fetch: jest.fn() },
        config: { getString: jest.fn().mockResolvedValue(undefined) },
        schemaValidator: { withSchemaValidatorMiddleware: jest.fn(() => async () => ({ status: 200 })) }
      }
    } as unknown as GlobalContext)

    metadataValidators = (wellKnownComponents as jest.Mock).mock.calls.map((call) => call[0].metadataValidator)
  })

  it('should install the signed-fetch middleware on more than one route', () => {
    expect(metadataValidators.length).toBeGreaterThan(1)
  })

  it('should give every signed-fetch route a metadata validator', () => {
    expect(metadataValidators.every((validator) => typeof validator === 'function')).toBe(true)
  })

  it('should reject a chain declaring the scene signer on every signed-fetch route', () => {
    expect(metadataValidators.map((validator) => validator({ signer: 'decentraland-kernel-scene' }))).toEqual(
      metadataValidators.map(() => false)
    )
  })

  it('should reject the scene signer whatever casing it arrives in', () => {
    expect(metadataValidators.map((validator) => validator({ signer: 'Decentraland-Kernel-Scene' }))).toEqual(
      metadataValidators.map(() => false)
    )
  })

  it('should accept the empty metadata explorer clients send', () => {
    expect(metadataValidators.map((validator) => validator({}))).toEqual(metadataValidators.map(() => true))
  })

  it('should accept a chain signed by any other signer', () => {
    expect(metadataValidators.map((validator) => validator({ signer: 'dcl:explorer' }))).toEqual(
      metadataValidators.map(() => true)
    )
  })

  it('should accept absent metadata without throwing', () => {
    expect(metadataValidators.map((validator) => validator(undefined))).toEqual(metadataValidators.map(() => true))
  })
})
