import type { IHttpServerComponent } from '@dcl/core-commons'
import { HttpRequest, HttpResponse } from '@dcl/uws-http-server'
import { AppComponents } from './system'
import { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { FormDataContext } from '../utils/multipart'

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
