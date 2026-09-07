import {
  DEFAULT_PRESENCE_SOURCE,
  getPresenceSource,
  parsePresenceSource,
  PEERS_CACHE_KEY,
  PEERS_CACHE_KEY_PULSE,
  PresenceSource,
  usesArchipelagoPresence,
  usesPulsePresence
} from '../../../src/utils/peers'
import { createMockConfigComponent } from '../../mocks/components'

describe('presence source', () => {
  it('should default to archipelago, today behaviour', () => {
    expect(DEFAULT_PRESENCE_SOURCE).toBe(PresenceSource.ARCHIPELAGO)
  })

  it('should use two distinct cache keys so the dual-source window can compare them', () => {
    expect(PEERS_CACHE_KEY).not.toBe(PEERS_CACHE_KEY_PULSE)
  })

  describe('when parsing the configured value', () => {
    it.each([
      ['archipelago', PresenceSource.ARCHIPELAGO],
      ['pulse', PresenceSource.PULSE],
      ['both', PresenceSource.BOTH],
      ['PULSE', PresenceSource.PULSE],
      ['  both  ', PresenceSource.BOTH]
    ])('should read %s as %s', (raw, expected) => {
      expect(parsePresenceSource(raw)).toBe(expected)
    })

    it.each([[undefined], [null], [''], ['livekit'], ['pulsee']])(
      'should fall back to the default for %s',
      (raw: string | null | undefined) => {
        expect(parsePresenceSource(raw)).toBe(DEFAULT_PRESENCE_SOURCE)
      }
    )
  })

  describe('when resolving the source from config', () => {
    it('should read PRESENCE_SOURCE', async () => {
      const config = createMockConfigComponent({
        getString: jest.fn(async (key: string) => (key === 'PRESENCE_SOURCE' ? 'pulse' : undefined))
      })

      await expect(getPresenceSource(config)).resolves.toBe(PresenceSource.PULSE)
      expect(config.getString).toHaveBeenCalledWith('PRESENCE_SOURCE')
    })

    it('should default to archipelago when the key is absent', async () => {
      const config = createMockConfigComponent({ getString: jest.fn(async (_key: string) => undefined) })

      await expect(getPresenceSource(config)).resolves.toBe(PresenceSource.ARCHIPELAGO)
    })
  })

  describe('when deciding which feed a mode runs', () => {
    it.each([
      [PresenceSource.ARCHIPELAGO, true, false],
      [PresenceSource.PULSE, false, true],
      [PresenceSource.BOTH, true, true]
    ])('should map %s to archipelago=%s pulse=%s', (source, archipelago, pulse) => {
      expect(usesArchipelagoPresence(source)).toBe(archipelago)
      expect(usesPulsePresence(source)).toBe(pulse)
    })
  })
})
