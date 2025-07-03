import { shuffleArray } from '../../../src/utils/array'

describe('shuffleArray', () => {
  it('should shuffle elements randomly (mocked Math.random)', () => {
    const originalArray = [1, 2, 3, 4, 5]

    // to control the shuffle
    jest
      .spyOn(global.Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.9)
      .mockReturnValueOnce(0.5)

    const shuffledArray = shuffleArray([...originalArray])

    expect(shuffledArray).not.toEqual(originalArray)
  })

  it('should not modify the original array', () => {
    const originalArray = [1, 2, 3, 4, 5]
    const arrayCopy = [...originalArray]

    shuffleArray(arrayCopy)

    expect(originalArray).toEqual([1, 2, 3, 4, 5])
  })

  it('should handle an empty array gracefully', () => {
    const emptyArray: number[] = []
    const shuffledArray = shuffleArray(emptyArray)

    expect(shuffledArray).toEqual([])
  })

  it('should handle an array with one element gracefully', () => {
    const singleElementArray = [1]
    const shuffledArray = shuffleArray(singleElementArray)

    expect(shuffledArray).toEqual([1])
  })
})
