import {
  getNewFriendshipStatus,
  isFriendshipActionValid,
  isUserActionValid,
  parseEmittedUpdateToFriendshipUpdate,
  parseUpsertFriendshipRequest,
  validateNewFriendshipAction
} from '../../src/logic/friendships'
import { Action, FriendshipStatus } from '../../src/types'

describe('isFriendshipActionValid()', () => {
  test('it should be valid if from is null and to is REQUEST ', () => {
    expect(isFriendshipActionValid(null, Action.REQUEST)).toBeTruthy()
  })

  test('it should be valid if from is REQUEST and to is CANCEL ', () => {
    expect(isFriendshipActionValid(Action.REQUEST, Action.CANCEL)).toBeTruthy()
  })

  test('it should be valid if from is REQUEST and to is ACCEPT ', () => {
    expect(isFriendshipActionValid(Action.REQUEST, Action.ACCEPT)).toBeTruthy()
  })

  test('it should be valid if from is REQUEST and to is REJECT ', () => {
    expect(isFriendshipActionValid(Action.REQUEST, Action.REJECT)).toBeTruthy()
  })

  test('it should be valid if from is REQUEST and to is DELETE ', () => {
    expect(isFriendshipActionValid(Action.REQUEST, Action.DELETE)).toBeFalsy()
  })

  test('it should NOT be valid if "from" is null and "to" is whatever except REQUEST ', () => {
    expect(isFriendshipActionValid(null, Action.ACCEPT)).toBeFalsy()
    expect(isFriendshipActionValid(null, Action.DELETE)).toBeFalsy()
    expect(isFriendshipActionValid(null, Action.REJECT)).toBeFalsy()
    expect(isFriendshipActionValid(null, Action.CANCEL)).toBeFalsy()
  })
})

describe('isUserActionValid()', () => {
  test('it should NOT be valid if acting user is the targeted user and is sending a REQUEST', () => {
    expect(isUserActionValid('0xA', { action: Action.REQUEST, user: '0xA' })).toBeFalsy()
  })

  test('it should be valid if acting user is different to the targeted user and is sending a REQUEST', () => {
    expect(isUserActionValid('0xA', { action: Action.REQUEST, user: '0xB' })).toBeTruthy()
  })

  test('it should NOT be valid if last acting user is sending either an ACCEPT or REJECT', () => {
    expect(
      isUserActionValid(
        '0xA',
        { action: Action.ACCEPT, user: '0xA' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeFalsy()
    expect(
      isUserActionValid(
        '0xA',
        { action: Action.REJECT, user: '0xA' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeFalsy()
  })

  test('it should NOT be valid if acting user is sending a CANCEL but didnt send the REQUEST', () => {
    expect(
      isUserActionValid(
        '0xB',
        { action: Action.CANCEL, user: '0xA' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeFalsy()
  })

  test('it should be valid if acting user is sending a CANCEL after sending a REQUEST', () => {
    expect(
      isUserActionValid(
        '0xA',
        { action: Action.CANCEL, user: '0xB' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeTruthy()
  })
})

describe('getNewFriendshipStatus()', () => {
  test('it should be FriendshipStatus.Requested', () => {
    expect(getNewFriendshipStatus(Action.REQUEST)).toBe(FriendshipStatus.Requested)
  })

  test('it should be FriendshipStatus.Friends', () => {
    expect(getNewFriendshipStatus(Action.ACCEPT)).toBe(FriendshipStatus.Friends)
  })

  test('it should be FriendshipStatus.NotFriends', () => {
    expect(getNewFriendshipStatus(Action.CANCEL)).toBe(FriendshipStatus.NotFriends)
    expect(getNewFriendshipStatus(Action.DELETE)).toBe(FriendshipStatus.NotFriends)
    expect(getNewFriendshipStatus(Action.REJECT)).toBe(FriendshipStatus.NotFriends)
  })
})

describe('validateNewFriendshipAction()', () => {
  test('it should be a valid friendship action', () => {
    expect(validateNewFriendshipAction('0xA', { action: Action.REQUEST, user: '0xB' })).toBeTruthy()
    expect(
      validateNewFriendshipAction(
        '0xB',
        { action: Action.ACCEPT, user: '0xA' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeTruthy()
    expect(
      validateNewFriendshipAction(
        '0xA',
        { action: Action.CANCEL, user: '0xB' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeTruthy()
    expect(
      validateNewFriendshipAction(
        '0xB',
        { action: Action.REJECT, user: '0xA' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeTruthy()
    expect(
      validateNewFriendshipAction(
        '0xA',
        { action: Action.DELETE, user: '0xB' },
        {
          id: '1111',
          acting_user: '0xB',
          action: Action.ACCEPT,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeTruthy()
  })

  test('it should NOT be a valid friendship action', () => {
    expect(validateNewFriendshipAction('0xA', { action: Action.REQUEST, user: '0xA' })).toBeFalsy()
    expect(
      validateNewFriendshipAction(
        '0xA',
        { action: Action.DELETE, user: '0xB' },
        {
          id: '1111',
          acting_user: '0xB',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeFalsy()
    expect(
      validateNewFriendshipAction(
        '0xB',
        { action: Action.CANCEL, user: '0xA' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeFalsy()
    expect(
      validateNewFriendshipAction(
        '0xA',
        { action: Action.REQUEST, user: '0xB' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.REQUEST,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeFalsy()
    expect(
      validateNewFriendshipAction(
        '0xA',
        { action: Action.REJECT, user: '0xB' },
        {
          id: '1111',
          acting_user: '0xA',
          action: Action.ACCEPT,
          friendship_id: '1111',
          timestamp: new Date().toISOString()
        }
      )
    ).toBeFalsy()
  })
})

describe('parseUpsertFriendshipRequest()', () => {
  test('it should parse ACCEPT request properly', () => {
    expect(
      parseUpsertFriendshipRequest({
        action: {
          $case: 'accept',
          accept: {
            user: {
              address: '0xA'
            }
          }
        }
      })
    ).toEqual({
      action: Action.ACCEPT,
      user: '0xa'
    })
  })

  test('it should parse CANCEL request properly', () => {
    expect(
      parseUpsertFriendshipRequest({
        action: {
          $case: 'cancel',
          cancel: {
            user: {
              address: '0xA'
            }
          }
        }
      })
    ).toEqual({
      action: Action.CANCEL,
      user: '0xa'
    })
  })

  test('it should parse DELETE request properly', () => {
    expect(
      parseUpsertFriendshipRequest({
        action: {
          $case: 'delete',
          delete: {
            user: {
              address: '0xA'
            }
          }
        }
      })
    ).toEqual({
      action: Action.DELETE,
      user: '0xa'
    })
  })

  test('it should parse REJECT request properly', () => {
    expect(
      parseUpsertFriendshipRequest({
        action: {
          $case: 'reject',
          reject: {
            user: {
              address: '0xA'
            }
          }
        }
      })
    ).toEqual({
      action: Action.REJECT,
      user: '0xa'
    })
  })

  test('it should parse REQUEST request properly', () => {
    expect(
      parseUpsertFriendshipRequest({
        action: {
          $case: 'request',
          request: {
            user: {
              address: '0xA'
            }
          }
        }
      })
    ).toEqual({
      action: Action.REQUEST,
      user: '0xa',
      metadata: null
    })

    expect(
      parseUpsertFriendshipRequest({
        action: {
          $case: 'request',
          request: {
            user: {
              address: '0xA'
            },
            message: 'Hi!'
          }
        }
      })
    ).toEqual({
      action: Action.REQUEST,
      user: '0xa',
      metadata: {
        message: 'Hi!'
      }
    })
  })

  test('it should return null', () => {
    expect(
      parseUpsertFriendshipRequest({
        action: {
          $case: 'whaterver' as any,
          request: {
            user: {
              address: '0xA'
            }
          }
        }
      })
    ).toBe(null)
  })
})

describe('parseEmittedUpdateToFriendshipUpdate()', () => {
  test('it should parse REQUEST update properly', () => {
    const now = Date.now()
    expect(
      parseEmittedUpdateToFriendshipUpdate({
        action: Action.REQUEST,
        timestamp: now,
        from: '0xA',
        to: '0xB'
      })
    ).toEqual({
      update: {
        $case: 'request',
        request: {
          createdAt: now,
          user: {
            address: '0xA'
          },
          message: undefined
        }
      }
    })

    expect(
      parseEmittedUpdateToFriendshipUpdate({
        action: Action.REQUEST,
        timestamp: now,
        from: '0xA',
        to: '0xB',
        metadata: {
          message: 'Hi!'
        }
      })
    ).toEqual({
      update: {
        $case: 'request',
        request: {
          createdAt: now,
          user: {
            address: '0xA'
          },
          message: 'Hi!'
        }
      }
    })
  })

  test('it should parse CANCEL update properly', () => {
    const now = Date.now()
    expect(
      parseEmittedUpdateToFriendshipUpdate({
        action: Action.CANCEL,
        timestamp: now,
        from: '0xA',
        to: '0xB'
      })
    ).toEqual({
      update: {
        $case: 'cancel',
        cancel: {
          user: {
            address: '0xA'
          }
        }
      }
    })
  })

  test('it should parse DELETE update properly', () => {
    const now = Date.now()
    expect(
      parseEmittedUpdateToFriendshipUpdate({
        action: Action.DELETE,
        timestamp: now,
        from: '0xA',
        to: '0xB'
      })
    ).toEqual({
      update: {
        $case: 'delete',
        delete: {
          user: {
            address: '0xA'
          }
        }
      }
    })
  })

  test('it should parse REJECT update properly', () => {
    const now = Date.now()
    expect(
      parseEmittedUpdateToFriendshipUpdate({
        action: Action.REJECT,
        timestamp: now,
        from: '0xA',
        to: '0xB'
      })
    ).toEqual({
      update: {
        $case: 'reject',
        reject: {
          user: {
            address: '0xA'
          }
        }
      }
    })
  })

  test('it should parse ACCEPT update properly', () => {
    const now = Date.now()
    expect(
      parseEmittedUpdateToFriendshipUpdate({
        action: Action.ACCEPT,
        timestamp: now,
        from: '0xA',
        to: '0xB'
      })
    ).toEqual({
      update: {
        $case: 'accept',
        accept: {
          user: {
            address: '0xA'
          }
        }
      }
    })
  })

  test('it should return null', () => {
    const now = Date.now()
    expect(
      parseEmittedUpdateToFriendshipUpdate({
        action: 'whaterver' as Action,
        timestamp: now,
        from: '0xA',
        to: '0xB'
      })
    ).toBe(null)
  })
})
