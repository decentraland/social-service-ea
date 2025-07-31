import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { Emitter } from 'mitt'
import {
  CommunityVoiceChatUpdate,
  ConnectivityStatus
} from '@dcl/protocol/out-js/decentraland/social_service/v2/social_service_v2.gen'
import { AppComponents, GlobalContext } from './system'
import { Action } from './entities'
import { ISubscribersContext } from './components'
import { VoiceChatStatus } from '../logic/voice/types'
import { EthAddress } from '@dcl/schemas'

export type RPCServiceContext<ComponentNames extends keyof AppComponents> = {
  components: Pick<AppComponents, ComponentNames>
}

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>

export type SubscriptionEventsEmitter = {
  friendshipUpdate: {
    id: string
    to: string
    from: string
    action: Action
    timestamp: number
    metadata?: { message: string }
  }
  friendConnectivityUpdate: {
    address: string
    status: ConnectivityStatus
  }
  blockUpdate: {
    blockerAddress: string
    blockedAddress: string
    isBlocked: boolean
  }
  privateVoiceChatUpdate: {
    callId: string
    status: VoiceChatStatus
    callerAddress?: string
    calleeAddress?: string
    credentials?: {
      connectionUrl: string
    }
  }
  communityJoinUpdate: {
    communityId: string
    memberAddress: EthAddress
  }
  communityLeaveUpdate: {
    communityId: string
    memberAddress: EthAddress
    reason: CommunityLeaveReason
  }
  communityMemberConnectivityUpdate: {
    communityId: string
    memberAddress: EthAddress
    status: ConnectivityStatus
  }
  communityVoiceChatUpdate: CommunityVoiceChatUpdate
}

export enum CommunityLeaveReason {
  Kicked = 'kicked',
  Banned = 'banned',
  Left = 'left'
}

export type Subscribers = Record<string, Emitter<SubscriptionEventsEmitter>>

export type RpcServerContext = {
  address: string
  subscribersContext: ISubscribersContext
}
