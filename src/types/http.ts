import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { HttpRequest, HttpResponse } from '@well-known-components/uws-http-server'
import { AppComponents } from './system'
import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { FormDataContext } from '@well-known-components/multipart-wrapper'

export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }> &
    DecentralandSignatureContext<any>,
  Path
>

export type JsonBody = Record<string, any>
export type ResponseBody = JsonBody | string

export type IHandlerResult = {
  status?: number
  headers?: Record<string, string>
  body?: ResponseBody
}

export type IHandler = {
  path: string
  f: (res: HttpResponse, req: HttpRequest) => Promise<IHandlerResult>
}

export type HTTPResponse<T = undefined> = {
  status: number
  body?:
    | {
        message: string
        data?: object
      }
    | {
        data?: T
      }
}

export type FormHandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  FormDataContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>
