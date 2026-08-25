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

    // Refused by the gate rather than left to the signature. Re-spelling the key costs a client
    // nothing as long as it signs it that way, so the chain verifies cleanly and the signature has
    // nothing to object to — the gate is the only thing standing, and it has to answer. From
    // @dcl/crypto-middleware 6.3.0 a key that case-folds to `signer` without being spelled exactly
    // that is a rejection rather than an absence, so metadata naming the very signer this gate
    // exists to refuse no longer reads as "no signer here". Nothing is folded and no value is
    // rewritten — see the integration coverage in `canonical-signer.spec.ts`.
    it('should reject the request instead of reading the signer as absent', () => {
      expect(accepted).toBe(false)
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
