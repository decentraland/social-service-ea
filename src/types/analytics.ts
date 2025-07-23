export enum AnalyticsEvent {
  START_CALL = 'START_CALL',
  REJECT_CALL = 'REJECT_CALL',
  ACCEPT_CALL = 'ACCEPT_CALL',
  END_CALL = 'END_CALL',
  EXPIRE_CALL = 'EXPIRE_CALL',
  START_COMMUNITY_CALL = 'START_COMMUNITY_CALL'
}

export type AnalyticsEventPayload = {
  [AnalyticsEvent.START_CALL]: {
    call_id: string
    user_id: string
    receiver_id: string
  }
  [AnalyticsEvent.START_COMMUNITY_CALL]: {
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
