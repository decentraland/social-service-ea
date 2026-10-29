import type { IHttpServerComponent } from '@dcl/core-commons'
import { AppComponents, GlobalContext } from './system'
import { SubscriptionContext } from './subscriptions'
export * from './subscriptions'
export type RpcServerContext = SubscriptionContext
export type RPCServiceContext<ComponentNames extends keyof AppComponents> = {
  components: Pick<AppComponents, ComponentNames>
}
export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>
