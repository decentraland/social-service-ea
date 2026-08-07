import { isSceneSigner, SCENE_SIGNER } from '../../../src/utils/auth-metadata'

describe('isSceneSigner', () => {
  describe('when the metadata declares the scene signer in lowercase', () => {
    let result: boolean

    beforeEach(() => {
      result = isSceneSigner({ signer: SCENE_SIGNER })
    })

    it('should report the caller as a scene signer', () => {
      expect(result).toBe(true)
    })
  })

  describe('and the same signer is declared with different casing', () => {
    let results: boolean[]

    beforeEach(() => {
      results = ['Decentraland-Kernel-Scene', 'DECENTRALAND-KERNEL-SCENE', 'decentraland-Kernel-scene'].map((signer) =>
        isSceneSigner({ signer })
      )
    })

    it('should still report every variant as a scene signer', () => {
      expect(results).toEqual([true, true, true])
    })
  })

  describe('and the signer is padded with whitespace', () => {
    let result: boolean

    beforeEach(() => {
      result = isSceneSigner({ signer: `  ${SCENE_SIGNER}\t` })
    })

    it('should report the caller as a scene signer', () => {
      expect(result).toBe(true)
    })
  })

  describe('when the metadata declares a different signer', () => {
    let result: boolean

    beforeEach(() => {
      result = isSceneSigner({ signer: 'dcl:explorer' })
    })

    it('should not report the caller as a scene signer', () => {
      expect(result).toBe(false)
    })
  })

  describe('when the metadata has no usable signer', () => {
    let results: boolean[]

    beforeEach(() => {
      results = [
        isSceneSigner({}),
        isSceneSigner(undefined),
        isSceneSigner(null),
        isSceneSigner({ signer: 42 }),
        isSceneSigner({ signer: { toLowerCase: () => SCENE_SIGNER } })
      ]
    })

    it('should not report the caller as a scene signer', () => {
      expect(results).toEqual([false, false, false, false, false])
    })
  })
})
