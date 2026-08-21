import { rejectSceneSigner, SCENE_SIGNER } from '../../../src/utils/auth-metadata'

describe('rejectSceneSigner', () => {
  describe('when the metadata declares the scene signer in its canonical spelling', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner({ signer: SCENE_SIGNER })
    })

    it('should reject the request', () => {
      expect(accepted).toBe(false)
    })
  })

  describe('when the metadata declares the scene signer with a re-cased value', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner({ signer: 'Decentraland-Kernel-Scene' })
    })

    // Refused rather than folded and compared. Folding would decide on a value the handler never
    // sees, and a plain comparison would read `Decentraland-Kernel-Scene` as "not a scene".
    it('should reject the request instead of reading it as a non-scene signer', () => {
      expect(accepted).toBe(false)
    })
  })

  describe('when the metadata declares the scene signer in upper case', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner({ signer: 'DECENTRALAND-KERNEL-SCENE' })
    })

    it('should reject the request', () => {
      expect(accepted).toBe(false)
    })
  })

  describe('when the signer is padded with whitespace', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner({ signer: `  ${SCENE_SIGNER}\t` })
    })

    it('should reject the request', () => {
      expect(accepted).toBe(false)
    })
  })

  describe('when the signer is present but is not a string', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner({ signer: 42 })
    })

    it('should reject the request', () => {
      expect(accepted).toBe(false)
    })
  })

  describe('when the metadata declares a different signer', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner({ signer: 'dcl:explorer' })
    })

    it('should accept the request', () => {
      expect(accepted).toBe(true)
    })
  })

  describe('when the metadata is the empty object explorer clients send', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner({})
    })

    it('should accept the request', () => {
      expect(accepted).toBe(true)
    })
  })

  describe('when the scene signer is spelled under a re-cased key', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner({ Signer: SCENE_SIGNER })
    })

    // The gate reads `signer` and nothing else, so this metadata does not claim to be a scene and
    // the predicate has no reason to refuse it. What makes that safe is the payload format rather
    // than the gate: the key is inside the signature now, so re-spelling it after signing fails
    // verification outright — see the integration coverage in `canonical-signer.spec.ts`.
    it('should accept the request, leaving the key spelling to the signature', () => {
      expect(accepted).toBe(true)
    })
  })

  describe('when the signer is only reachable through the prototype chain', () => {
    let accepted: boolean

    beforeEach(() => {
      accepted = rejectSceneSigner(Object.create({ signer: SCENE_SIGNER }))
    })

    // An inherited value is not something a client sent, so the gate must not read it. Asserting
    // acceptance is what makes this discriminating: a predicate walking the prototype chain would
    // find the scene signer here and refuse.
    it('should treat the signer as absent and accept the request', () => {
      expect(accepted).toBe(true)
    })
  })
})
