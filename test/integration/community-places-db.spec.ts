import { randomUUID } from 'crypto'
import { test } from '../components'
import { mockCommunity } from '../mocks/communities'
import { createCommunity } from './utils/communities'

test('Community Places DB', function ({ components }) {
  let communityId: string
  let keptA: string
  let keptB: string
  let removed: string

  beforeEach(async () => {
    communityId = await createCommunity(
      components.communitiesDb,
      mockCommunity({ name: `Places ${randomUUID()}`, owner_address: '0x0000000000000000000000000000000000000001' })
    )

    keptA = randomUUID()
    keptB = randomUUID()
    removed = randomUUID()

    await components.communitiesDb.addCommunityPlaces([
      { id: keptA, communityId, addedBy: '0x0000000000000000000000000000000000000001' },
      { id: keptB, communityId, addedBy: '0x0000000000000000000000000000000000000001' },
      { id: removed, communityId, addedBy: '0x0000000000000000000000000000000000000001' }
    ])
  })

  afterEach(async () => {
    await components.communitiesDbHelper.forceCommunityRemoval(communityId)
  })

  describe('when removing every place except a list of two', () => {
    let remaining: string[]

    beforeEach(async () => {
      await components.communitiesDb.removeCommunityPlacesWithExceptions(communityId, [keptA, keptB])

      const places = await components.communitiesDb.getCommunityPlaces(communityId)
      remaining = places.map((place) => place.id).sort()
    })

    it('should keep both of them', () => {
      expect(remaining).toEqual([keptA, keptB].sort())
    })
  })

  describe('when the exception list holds a single place', () => {
    let remaining: string[]

    beforeEach(async () => {
      await components.communitiesDb.removeCommunityPlacesWithExceptions(communityId, [keptA])

      const places = await components.communitiesDb.getCommunityPlaces(communityId)
      remaining = places.map((place) => place.id)
    })

    it('should keep it', () => {
      expect(remaining).toEqual([keptA])
    })
  })

  describe('when the exception list is empty', () => {
    let remaining: string[]

    beforeEach(async () => {
      await components.communitiesDb.removeCommunityPlacesWithExceptions(communityId, [])

      const places = await components.communitiesDb.getCommunityPlaces(communityId)
      remaining = places.map((place) => place.id)
    })

    it('should remove every place', () => {
      expect(remaining).toEqual([])
    })
  })
})
