import type { IHttpServerComponent } from '@dcl/core-commons'
import { AppComponents, GlobalContext } from './system'
export type RPCServiceContext<ComponentNames extends keyof AppComponents> = {
  components: Pick<AppComponents, ComponentNames>
}
export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>
