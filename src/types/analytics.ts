export enum AnalyticsEvent {
  START_CALL = 'START_CALL',
  REJECT_CALL = 'REJECT_CALL',
  ACCEPT_CALL = 'ACCEPT_CALL',
  END_CALL = 'END_CALL',
  EXPIRE_CALL = 'EXPIRE_CALL',
  //Community related events
  JOIN_COMMUNITY = 'JOIN_COMMUNITY',
  LEAVE_COMMUNITY = 'LEAVE_COMMUNITY',
  KICK_MEMBER_FROM_COMMUNITY = 'KICK_MEMBER_FROM_COMMUNITY',
  BAN_MEMBER_FROM_COMMUNITY = 'BAN_MEMBER_FROM_COMMUNITY',
  ACCEPT_ALL_REQUESTS_TO_JOIN = 'ACCEPT_ALL_REQUESTS_TO_JOIN',
  REJECT_COMMUNITY_REQUEST = 'REJECT_COMMUNITY_REQUEST',
  CANCEL_COMMUNITY_REQUEST = 'CANCEL_COMMUNITY_REQUEST',

  START_COMMUNITY_CALL = 'START_COMMUNITY_CALL',
  JOIN_COMMUNITY_CALL = 'JOIN_COMMUNITY_CALL',
  MUTE_SPEAKER_IN_COMMUNITY_CALL = 'MUTE_SPEAKER_IN_COMMUNITY_CALL',
  END_COMMUNITY_CALL = 'END_COMMUNITY_CALL'
}

export type AnalyticsEventPayload = {
  [AnalyticsEvent.LEAVE_COMMUNITY]: {
    community_id: string
    user_id: string
  }
  [AnalyticsEvent.KICK_MEMBER_FROM_COMMUNITY]: {
    community_id: string
    kicker_user_id: string
    target_user_id: string
  }
  [AnalyticsEvent.BAN_MEMBER_FROM_COMMUNITY]: {
    community_id: string
    banner_user_id: string
    target_user_id: string
  }

  [AnalyticsEvent.JOIN_COMMUNITY]: {
    community_id: string
    user_id: string
    request_id?: string
  }

  [AnalyticsEvent.ACCEPT_ALL_REQUESTS_TO_JOIN]: {
    community_id: string
    requests_ids: string[]
  }

  [AnalyticsEvent.REJECT_COMMUNITY_REQUEST]: {
    request_id: string
    community_id: string
    type: string
    member_address: string
    caller_address: string
  }

  [AnalyticsEvent.CANCEL_COMMUNITY_REQUEST]: {
    request_id: string
    community_id: string
    type: string
    member_address: string
    caller_address: string
  }

  [AnalyticsEvent.START_CALL]: {
    call_id: string
    user_id: string
    receiver_id: string
  }
  [AnalyticsEvent.START_COMMUNITY_CALL]: {
    call_id: string
    user_id: string
  }
  [AnalyticsEvent.JOIN_COMMUNITY_CALL]: {
    call_id: string
    user_id: string
  }
  [AnalyticsEvent.MUTE_SPEAKER_IN_COMMUNITY_CALL]: {
    call_id: string
    user_id: string
    target_user_id: string
  }
  [AnalyticsEvent.END_COMMUNITY_CALL]: {
    call_id: string
    user_id: string
  }
  [AnalyticsEvent.END_CALL]: {
    call_id: string
    user_id: string
    receiver_id: string
  }
  [AnalyticsEvent.REJECT_CALL]: {
    call_id: string
  }
  [AnalyticsEvent.ACCEPT_CALL]: {
    call_id: string
  }
  [AnalyticsEvent.EXPIRE_CALL]: {
    call_id: string
  }
}
