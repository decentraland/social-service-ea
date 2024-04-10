/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";
import { Empty } from "./google/protobuf/empty";

export const protobufPackage = "decentraland.social.friendships_ea";

/** This message is a response that is sent from the server to the client */
export interface FriendshipEventResponse {
  request?: RequestResponse | undefined;
  accept?: AcceptResponse | undefined;
  reject?: RejectResponse | undefined;
  delete?: DeleteResponse | undefined;
  cancel?: CancelResponse | undefined;
}

export interface FriendshipEventResponses {
  responses: FriendshipEventResponse[];
}

export interface FriendshipEventPayload {
  request?: RequestPayload | undefined;
  accept?: AcceptPayload | undefined;
  reject?: RejectPayload | undefined;
  delete?: DeletePayload | undefined;
  cancel?: CancelPayload | undefined;
}

export interface User {
  address: string;
}

export interface Users {
  users: User[];
}

export interface RequestResponse {
  user: User | undefined;
  createdAt: number;
  message?: string | undefined;
}

export interface RequestPayload {
  user: User | undefined;
  message?: string | undefined;
}

export interface Requests {
  /** Total amount of friendship requests */
  total: number;
  items: RequestResponse[];
}

export interface RequestEvents {
  /** Requests the authed user have sent to users */
  outgoing:
    | Requests
    | undefined;
  /** Requests the authed user have received from users */
  incoming: Requests | undefined;
}

export interface AcceptResponse {
  user: User | undefined;
}

export interface AcceptPayload {
  user: User | undefined;
}

export interface RejectResponse {
  user: User | undefined;
}

export interface RejectPayload {
  user: User | undefined;
}

export interface DeleteResponse {
  user: User | undefined;
}

export interface DeletePayload {
  user: User | undefined;
}

export interface CancelResponse {
  user: User | undefined;
}

export interface CancelPayload {
  user: User | undefined;
}

export interface UpdateFriendshipPayload {
  event: FriendshipEventPayload | undefined;
}

export interface MutualFriendsPayload {
  user: User | undefined;
}

export interface BadRequestError {
  message: string;
}

export interface UnauthorizedError {
  message: string;
}

export interface ForbiddenError {
  message: string;
}

export interface TooManyRequestsError {
  message: string;
}

export interface InternalServerError {
  message: string;
}

export interface UsersResponse {
  users?: Users | undefined;
  internalServerError?: InternalServerError | undefined;
  unauthorizedError?: UnauthorizedError | undefined;
  forbiddenError?: ForbiddenError | undefined;
  tooManyRequestsError?: TooManyRequestsError | undefined;
  badRequestError?: BadRequestError | undefined;
}

export interface RequestEventsResponse {
  events?: RequestEvents | undefined;
  internalServerError?: InternalServerError | undefined;
  unauthorizedError?: UnauthorizedError | undefined;
  forbiddenError?: ForbiddenError | undefined;
  tooManyRequestsError?: TooManyRequestsError | undefined;
}

export interface UpdateFriendshipResponse {
  event?: FriendshipEventResponse | undefined;
  internalServerError?: InternalServerError | undefined;
  unauthorizedError?: UnauthorizedError | undefined;
  forbiddenError?: ForbiddenError | undefined;
  tooManyRequestsError?: TooManyRequestsError | undefined;
  badRequestError?: BadRequestError | undefined;
}

export interface SubscribeFriendshipEventsUpdatesResponse {
  events?: FriendshipEventResponses | undefined;
  internalServerError?: InternalServerError | undefined;
  unauthorizedError?: UnauthorizedError | undefined;
  forbiddenError?: ForbiddenError | undefined;
  tooManyRequestsError?: TooManyRequestsError | undefined;
}

function createBaseFriendshipEventResponse(): FriendshipEventResponse {
  return { request: undefined, accept: undefined, reject: undefined, delete: undefined, cancel: undefined };
}

export const FriendshipEventResponse = {
  encode(message: FriendshipEventResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.request !== undefined) {
      RequestResponse.encode(message.request, writer.uint32(10).fork()).ldelim();
    }
    if (message.accept !== undefined) {
      AcceptResponse.encode(message.accept, writer.uint32(18).fork()).ldelim();
    }
    if (message.reject !== undefined) {
      RejectResponse.encode(message.reject, writer.uint32(34).fork()).ldelim();
    }
    if (message.delete !== undefined) {
      DeleteResponse.encode(message.delete, writer.uint32(42).fork()).ldelim();
    }
    if (message.cancel !== undefined) {
      CancelResponse.encode(message.cancel, writer.uint32(50).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): FriendshipEventResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseFriendshipEventResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.request = RequestResponse.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.accept = AcceptResponse.decode(reader, reader.uint32());
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.reject = RejectResponse.decode(reader, reader.uint32());
          continue;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.delete = DeleteResponse.decode(reader, reader.uint32());
          continue;
        case 6:
          if (tag !== 50) {
            break;
          }

          message.cancel = CancelResponse.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): FriendshipEventResponse {
    return {
      request: isSet(object.request) ? RequestResponse.fromJSON(object.request) : undefined,
      accept: isSet(object.accept) ? AcceptResponse.fromJSON(object.accept) : undefined,
      reject: isSet(object.reject) ? RejectResponse.fromJSON(object.reject) : undefined,
      delete: isSet(object.delete) ? DeleteResponse.fromJSON(object.delete) : undefined,
      cancel: isSet(object.cancel) ? CancelResponse.fromJSON(object.cancel) : undefined,
    };
  },

  toJSON(message: FriendshipEventResponse): unknown {
    const obj: any = {};
    if (message.request !== undefined) {
      obj.request = RequestResponse.toJSON(message.request);
    }
    if (message.accept !== undefined) {
      obj.accept = AcceptResponse.toJSON(message.accept);
    }
    if (message.reject !== undefined) {
      obj.reject = RejectResponse.toJSON(message.reject);
    }
    if (message.delete !== undefined) {
      obj.delete = DeleteResponse.toJSON(message.delete);
    }
    if (message.cancel !== undefined) {
      obj.cancel = CancelResponse.toJSON(message.cancel);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<FriendshipEventResponse>, I>>(base?: I): FriendshipEventResponse {
    return FriendshipEventResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<FriendshipEventResponse>, I>>(object: I): FriendshipEventResponse {
    const message = createBaseFriendshipEventResponse();
    message.request = (object.request !== undefined && object.request !== null)
      ? RequestResponse.fromPartial(object.request)
      : undefined;
    message.accept = (object.accept !== undefined && object.accept !== null)
      ? AcceptResponse.fromPartial(object.accept)
      : undefined;
    message.reject = (object.reject !== undefined && object.reject !== null)
      ? RejectResponse.fromPartial(object.reject)
      : undefined;
    message.delete = (object.delete !== undefined && object.delete !== null)
      ? DeleteResponse.fromPartial(object.delete)
      : undefined;
    message.cancel = (object.cancel !== undefined && object.cancel !== null)
      ? CancelResponse.fromPartial(object.cancel)
      : undefined;
    return message;
  },
};

function createBaseFriendshipEventResponses(): FriendshipEventResponses {
  return { responses: [] };
}

export const FriendshipEventResponses = {
  encode(message: FriendshipEventResponses, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    for (const v of message.responses) {
      FriendshipEventResponse.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): FriendshipEventResponses {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseFriendshipEventResponses();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.responses.push(FriendshipEventResponse.decode(reader, reader.uint32()));
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): FriendshipEventResponses {
    return {
      responses: globalThis.Array.isArray(object?.responses)
        ? object.responses.map((e: any) => FriendshipEventResponse.fromJSON(e))
        : [],
    };
  },

  toJSON(message: FriendshipEventResponses): unknown {
    const obj: any = {};
    if (message.responses?.length) {
      obj.responses = message.responses.map((e) => FriendshipEventResponse.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<FriendshipEventResponses>, I>>(base?: I): FriendshipEventResponses {
    return FriendshipEventResponses.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<FriendshipEventResponses>, I>>(object: I): FriendshipEventResponses {
    const message = createBaseFriendshipEventResponses();
    message.responses = object.responses?.map((e) => FriendshipEventResponse.fromPartial(e)) || [];
    return message;
  },
};

function createBaseFriendshipEventPayload(): FriendshipEventPayload {
  return { request: undefined, accept: undefined, reject: undefined, delete: undefined, cancel: undefined };
}

export const FriendshipEventPayload = {
  encode(message: FriendshipEventPayload, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.request !== undefined) {
      RequestPayload.encode(message.request, writer.uint32(10).fork()).ldelim();
    }
    if (message.accept !== undefined) {
      AcceptPayload.encode(message.accept, writer.uint32(18).fork()).ldelim();
    }
    if (message.reject !== undefined) {
      RejectPayload.encode(message.reject, writer.uint32(34).fork()).ldelim();
    }
    if (message.delete !== undefined) {
      DeletePayload.encode(message.delete, writer.uint32(42).fork()).ldelim();
    }
    if (message.cancel !== undefined) {
      CancelPayload.encode(message.cancel, writer.uint32(50).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): FriendshipEventPayload {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseFriendshipEventPayload();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.request = RequestPayload.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.accept = AcceptPayload.decode(reader, reader.uint32());
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.reject = RejectPayload.decode(reader, reader.uint32());
          continue;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.delete = DeletePayload.decode(reader, reader.uint32());
          continue;
        case 6:
          if (tag !== 50) {
            break;
          }

          message.cancel = CancelPayload.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): FriendshipEventPayload {
    return {
      request: isSet(object.request) ? RequestPayload.fromJSON(object.request) : undefined,
      accept: isSet(object.accept) ? AcceptPayload.fromJSON(object.accept) : undefined,
      reject: isSet(object.reject) ? RejectPayload.fromJSON(object.reject) : undefined,
      delete: isSet(object.delete) ? DeletePayload.fromJSON(object.delete) : undefined,
      cancel: isSet(object.cancel) ? CancelPayload.fromJSON(object.cancel) : undefined,
    };
  },

  toJSON(message: FriendshipEventPayload): unknown {
    const obj: any = {};
    if (message.request !== undefined) {
      obj.request = RequestPayload.toJSON(message.request);
    }
    if (message.accept !== undefined) {
      obj.accept = AcceptPayload.toJSON(message.accept);
    }
    if (message.reject !== undefined) {
      obj.reject = RejectPayload.toJSON(message.reject);
    }
    if (message.delete !== undefined) {
      obj.delete = DeletePayload.toJSON(message.delete);
    }
    if (message.cancel !== undefined) {
      obj.cancel = CancelPayload.toJSON(message.cancel);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<FriendshipEventPayload>, I>>(base?: I): FriendshipEventPayload {
    return FriendshipEventPayload.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<FriendshipEventPayload>, I>>(object: I): FriendshipEventPayload {
    const message = createBaseFriendshipEventPayload();
    message.request = (object.request !== undefined && object.request !== null)
      ? RequestPayload.fromPartial(object.request)
      : undefined;
    message.accept = (object.accept !== undefined && object.accept !== null)
      ? AcceptPayload.fromPartial(object.accept)
      : undefined;
    message.reject = (object.reject !== undefined && object.reject !== null)
      ? RejectPayload.fromPartial(object.reject)
      : undefined;
    message.delete = (object.delete !== undefined && object.delete !== null)
      ? DeletePayload.fromPartial(object.delete)
      : undefined;
    message.cancel = (object.cancel !== undefined && object.cancel !== null)
      ? CancelPayload.fromPartial(object.cancel)
      : undefined;
    return message;
  },
};

function createBaseUser(): User {
  return { address: "" };
}

export const User = {
  encode(message: User, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.address !== "") {
      writer.uint32(10).string(message.address);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): User {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseUser();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.address = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): User {
    return { address: isSet(object.address) ? globalThis.String(object.address) : "" };
  },

  toJSON(message: User): unknown {
    const obj: any = {};
    if (message.address !== "") {
      obj.address = message.address;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<User>, I>>(base?: I): User {
    return User.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<User>, I>>(object: I): User {
    const message = createBaseUser();
    message.address = object.address ?? "";
    return message;
  },
};

function createBaseUsers(): Users {
  return { users: [] };
}

export const Users = {
  encode(message: Users, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    for (const v of message.users) {
      User.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Users {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseUsers();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.users.push(User.decode(reader, reader.uint32()));
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): Users {
    return { users: globalThis.Array.isArray(object?.users) ? object.users.map((e: any) => User.fromJSON(e)) : [] };
  },

  toJSON(message: Users): unknown {
    const obj: any = {};
    if (message.users?.length) {
      obj.users = message.users.map((e) => User.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<Users>, I>>(base?: I): Users {
    return Users.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<Users>, I>>(object: I): Users {
    const message = createBaseUsers();
    message.users = object.users?.map((e) => User.fromPartial(e)) || [];
    return message;
  },
};

function createBaseRequestResponse(): RequestResponse {
  return { user: undefined, createdAt: 0, message: undefined };
}

export const RequestResponse = {
  encode(message: RequestResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    if (message.createdAt !== 0) {
      writer.uint32(16).int64(message.createdAt);
    }
    if (message.message !== undefined) {
      writer.uint32(26).string(message.message);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RequestResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRequestResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 16) {
            break;
          }

          message.createdAt = longToNumber(reader.int64() as Long);
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.message = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): RequestResponse {
    return {
      user: isSet(object.user) ? User.fromJSON(object.user) : undefined,
      createdAt: isSet(object.createdAt) ? globalThis.Number(object.createdAt) : 0,
      message: isSet(object.message) ? globalThis.String(object.message) : undefined,
    };
  },

  toJSON(message: RequestResponse): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    if (message.createdAt !== 0) {
      obj.createdAt = Math.round(message.createdAt);
    }
    if (message.message !== undefined) {
      obj.message = message.message;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<RequestResponse>, I>>(base?: I): RequestResponse {
    return RequestResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<RequestResponse>, I>>(object: I): RequestResponse {
    const message = createBaseRequestResponse();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    message.createdAt = object.createdAt ?? 0;
    message.message = object.message ?? undefined;
    return message;
  },
};

function createBaseRequestPayload(): RequestPayload {
  return { user: undefined, message: undefined };
}

export const RequestPayload = {
  encode(message: RequestPayload, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    if (message.message !== undefined) {
      writer.uint32(26).string(message.message);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RequestPayload {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRequestPayload();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.message = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): RequestPayload {
    return {
      user: isSet(object.user) ? User.fromJSON(object.user) : undefined,
      message: isSet(object.message) ? globalThis.String(object.message) : undefined,
    };
  },

  toJSON(message: RequestPayload): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    if (message.message !== undefined) {
      obj.message = message.message;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<RequestPayload>, I>>(base?: I): RequestPayload {
    return RequestPayload.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<RequestPayload>, I>>(object: I): RequestPayload {
    const message = createBaseRequestPayload();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    message.message = object.message ?? undefined;
    return message;
  },
};

function createBaseRequests(): Requests {
  return { total: 0, items: [] };
}

export const Requests = {
  encode(message: Requests, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.total !== 0) {
      writer.uint32(8).int64(message.total);
    }
    for (const v of message.items) {
      RequestResponse.encode(v!, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Requests {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRequests();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.total = longToNumber(reader.int64() as Long);
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.items.push(RequestResponse.decode(reader, reader.uint32()));
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): Requests {
    return {
      total: isSet(object.total) ? globalThis.Number(object.total) : 0,
      items: globalThis.Array.isArray(object?.items) ? object.items.map((e: any) => RequestResponse.fromJSON(e)) : [],
    };
  },

  toJSON(message: Requests): unknown {
    const obj: any = {};
    if (message.total !== 0) {
      obj.total = Math.round(message.total);
    }
    if (message.items?.length) {
      obj.items = message.items.map((e) => RequestResponse.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<Requests>, I>>(base?: I): Requests {
    return Requests.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<Requests>, I>>(object: I): Requests {
    const message = createBaseRequests();
    message.total = object.total ?? 0;
    message.items = object.items?.map((e) => RequestResponse.fromPartial(e)) || [];
    return message;
  },
};

function createBaseRequestEvents(): RequestEvents {
  return { outgoing: undefined, incoming: undefined };
}

export const RequestEvents = {
  encode(message: RequestEvents, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.outgoing !== undefined) {
      Requests.encode(message.outgoing, writer.uint32(10).fork()).ldelim();
    }
    if (message.incoming !== undefined) {
      Requests.encode(message.incoming, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RequestEvents {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRequestEvents();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.outgoing = Requests.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.incoming = Requests.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): RequestEvents {
    return {
      outgoing: isSet(object.outgoing) ? Requests.fromJSON(object.outgoing) : undefined,
      incoming: isSet(object.incoming) ? Requests.fromJSON(object.incoming) : undefined,
    };
  },

  toJSON(message: RequestEvents): unknown {
    const obj: any = {};
    if (message.outgoing !== undefined) {
      obj.outgoing = Requests.toJSON(message.outgoing);
    }
    if (message.incoming !== undefined) {
      obj.incoming = Requests.toJSON(message.incoming);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<RequestEvents>, I>>(base?: I): RequestEvents {
    return RequestEvents.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<RequestEvents>, I>>(object: I): RequestEvents {
    const message = createBaseRequestEvents();
    message.outgoing = (object.outgoing !== undefined && object.outgoing !== null)
      ? Requests.fromPartial(object.outgoing)
      : undefined;
    message.incoming = (object.incoming !== undefined && object.incoming !== null)
      ? Requests.fromPartial(object.incoming)
      : undefined;
    return message;
  },
};

function createBaseAcceptResponse(): AcceptResponse {
  return { user: undefined };
}

export const AcceptResponse = {
  encode(message: AcceptResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): AcceptResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseAcceptResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): AcceptResponse {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: AcceptResponse): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<AcceptResponse>, I>>(base?: I): AcceptResponse {
    return AcceptResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<AcceptResponse>, I>>(object: I): AcceptResponse {
    const message = createBaseAcceptResponse();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseAcceptPayload(): AcceptPayload {
  return { user: undefined };
}

export const AcceptPayload = {
  encode(message: AcceptPayload, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): AcceptPayload {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseAcceptPayload();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): AcceptPayload {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: AcceptPayload): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<AcceptPayload>, I>>(base?: I): AcceptPayload {
    return AcceptPayload.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<AcceptPayload>, I>>(object: I): AcceptPayload {
    const message = createBaseAcceptPayload();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseRejectResponse(): RejectResponse {
  return { user: undefined };
}

export const RejectResponse = {
  encode(message: RejectResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RejectResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRejectResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): RejectResponse {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: RejectResponse): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<RejectResponse>, I>>(base?: I): RejectResponse {
    return RejectResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<RejectResponse>, I>>(object: I): RejectResponse {
    const message = createBaseRejectResponse();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseRejectPayload(): RejectPayload {
  return { user: undefined };
}

export const RejectPayload = {
  encode(message: RejectPayload, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RejectPayload {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRejectPayload();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): RejectPayload {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: RejectPayload): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<RejectPayload>, I>>(base?: I): RejectPayload {
    return RejectPayload.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<RejectPayload>, I>>(object: I): RejectPayload {
    const message = createBaseRejectPayload();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseDeleteResponse(): DeleteResponse {
  return { user: undefined };
}

export const DeleteResponse = {
  encode(message: DeleteResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): DeleteResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseDeleteResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): DeleteResponse {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: DeleteResponse): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<DeleteResponse>, I>>(base?: I): DeleteResponse {
    return DeleteResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<DeleteResponse>, I>>(object: I): DeleteResponse {
    const message = createBaseDeleteResponse();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseDeletePayload(): DeletePayload {
  return { user: undefined };
}

export const DeletePayload = {
  encode(message: DeletePayload, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): DeletePayload {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseDeletePayload();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): DeletePayload {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: DeletePayload): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<DeletePayload>, I>>(base?: I): DeletePayload {
    return DeletePayload.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<DeletePayload>, I>>(object: I): DeletePayload {
    const message = createBaseDeletePayload();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseCancelResponse(): CancelResponse {
  return { user: undefined };
}

export const CancelResponse = {
  encode(message: CancelResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): CancelResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseCancelResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): CancelResponse {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: CancelResponse): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<CancelResponse>, I>>(base?: I): CancelResponse {
    return CancelResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<CancelResponse>, I>>(object: I): CancelResponse {
    const message = createBaseCancelResponse();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseCancelPayload(): CancelPayload {
  return { user: undefined };
}

export const CancelPayload = {
  encode(message: CancelPayload, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): CancelPayload {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseCancelPayload();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): CancelPayload {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: CancelPayload): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<CancelPayload>, I>>(base?: I): CancelPayload {
    return CancelPayload.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<CancelPayload>, I>>(object: I): CancelPayload {
    const message = createBaseCancelPayload();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseUpdateFriendshipPayload(): UpdateFriendshipPayload {
  return { event: undefined };
}

export const UpdateFriendshipPayload = {
  encode(message: UpdateFriendshipPayload, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.event !== undefined) {
      FriendshipEventPayload.encode(message.event, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UpdateFriendshipPayload {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseUpdateFriendshipPayload();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.event = FriendshipEventPayload.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): UpdateFriendshipPayload {
    return { event: isSet(object.event) ? FriendshipEventPayload.fromJSON(object.event) : undefined };
  },

  toJSON(message: UpdateFriendshipPayload): unknown {
    const obj: any = {};
    if (message.event !== undefined) {
      obj.event = FriendshipEventPayload.toJSON(message.event);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<UpdateFriendshipPayload>, I>>(base?: I): UpdateFriendshipPayload {
    return UpdateFriendshipPayload.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<UpdateFriendshipPayload>, I>>(object: I): UpdateFriendshipPayload {
    const message = createBaseUpdateFriendshipPayload();
    message.event = (object.event !== undefined && object.event !== null)
      ? FriendshipEventPayload.fromPartial(object.event)
      : undefined;
    return message;
  },
};

function createBaseMutualFriendsPayload(): MutualFriendsPayload {
  return { user: undefined };
}

export const MutualFriendsPayload = {
  encode(message: MutualFriendsPayload, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.user !== undefined) {
      User.encode(message.user, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MutualFriendsPayload {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseMutualFriendsPayload();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.user = User.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): MutualFriendsPayload {
    return { user: isSet(object.user) ? User.fromJSON(object.user) : undefined };
  },

  toJSON(message: MutualFriendsPayload): unknown {
    const obj: any = {};
    if (message.user !== undefined) {
      obj.user = User.toJSON(message.user);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<MutualFriendsPayload>, I>>(base?: I): MutualFriendsPayload {
    return MutualFriendsPayload.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<MutualFriendsPayload>, I>>(object: I): MutualFriendsPayload {
    const message = createBaseMutualFriendsPayload();
    message.user = (object.user !== undefined && object.user !== null) ? User.fromPartial(object.user) : undefined;
    return message;
  },
};

function createBaseBadRequestError(): BadRequestError {
  return { message: "" };
}

export const BadRequestError = {
  encode(message: BadRequestError, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.message !== "") {
      writer.uint32(10).string(message.message);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): BadRequestError {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseBadRequestError();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.message = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): BadRequestError {
    return { message: isSet(object.message) ? globalThis.String(object.message) : "" };
  },

  toJSON(message: BadRequestError): unknown {
    const obj: any = {};
    if (message.message !== "") {
      obj.message = message.message;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<BadRequestError>, I>>(base?: I): BadRequestError {
    return BadRequestError.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<BadRequestError>, I>>(object: I): BadRequestError {
    const message = createBaseBadRequestError();
    message.message = object.message ?? "";
    return message;
  },
};

function createBaseUnauthorizedError(): UnauthorizedError {
  return { message: "" };
}

export const UnauthorizedError = {
  encode(message: UnauthorizedError, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.message !== "") {
      writer.uint32(10).string(message.message);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UnauthorizedError {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseUnauthorizedError();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.message = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): UnauthorizedError {
    return { message: isSet(object.message) ? globalThis.String(object.message) : "" };
  },

  toJSON(message: UnauthorizedError): unknown {
    const obj: any = {};
    if (message.message !== "") {
      obj.message = message.message;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<UnauthorizedError>, I>>(base?: I): UnauthorizedError {
    return UnauthorizedError.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<UnauthorizedError>, I>>(object: I): UnauthorizedError {
    const message = createBaseUnauthorizedError();
    message.message = object.message ?? "";
    return message;
  },
};

function createBaseForbiddenError(): ForbiddenError {
  return { message: "" };
}

export const ForbiddenError = {
  encode(message: ForbiddenError, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.message !== "") {
      writer.uint32(10).string(message.message);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ForbiddenError {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseForbiddenError();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.message = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): ForbiddenError {
    return { message: isSet(object.message) ? globalThis.String(object.message) : "" };
  },

  toJSON(message: ForbiddenError): unknown {
    const obj: any = {};
    if (message.message !== "") {
      obj.message = message.message;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<ForbiddenError>, I>>(base?: I): ForbiddenError {
    return ForbiddenError.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<ForbiddenError>, I>>(object: I): ForbiddenError {
    const message = createBaseForbiddenError();
    message.message = object.message ?? "";
    return message;
  },
};

function createBaseTooManyRequestsError(): TooManyRequestsError {
  return { message: "" };
}

export const TooManyRequestsError = {
  encode(message: TooManyRequestsError, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.message !== "") {
      writer.uint32(10).string(message.message);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TooManyRequestsError {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseTooManyRequestsError();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.message = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): TooManyRequestsError {
    return { message: isSet(object.message) ? globalThis.String(object.message) : "" };
  },

  toJSON(message: TooManyRequestsError): unknown {
    const obj: any = {};
    if (message.message !== "") {
      obj.message = message.message;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<TooManyRequestsError>, I>>(base?: I): TooManyRequestsError {
    return TooManyRequestsError.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<TooManyRequestsError>, I>>(object: I): TooManyRequestsError {
    const message = createBaseTooManyRequestsError();
    message.message = object.message ?? "";
    return message;
  },
};

function createBaseInternalServerError(): InternalServerError {
  return { message: "" };
}

export const InternalServerError = {
  encode(message: InternalServerError, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.message !== "") {
      writer.uint32(10).string(message.message);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): InternalServerError {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseInternalServerError();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.message = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): InternalServerError {
    return { message: isSet(object.message) ? globalThis.String(object.message) : "" };
  },

  toJSON(message: InternalServerError): unknown {
    const obj: any = {};
    if (message.message !== "") {
      obj.message = message.message;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<InternalServerError>, I>>(base?: I): InternalServerError {
    return InternalServerError.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<InternalServerError>, I>>(object: I): InternalServerError {
    const message = createBaseInternalServerError();
    message.message = object.message ?? "";
    return message;
  },
};

function createBaseUsersResponse(): UsersResponse {
  return {
    users: undefined,
    internalServerError: undefined,
    unauthorizedError: undefined,
    forbiddenError: undefined,
    tooManyRequestsError: undefined,
    badRequestError: undefined,
  };
}

export const UsersResponse = {
  encode(message: UsersResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.users !== undefined) {
      Users.encode(message.users, writer.uint32(10).fork()).ldelim();
    }
    if (message.internalServerError !== undefined) {
      InternalServerError.encode(message.internalServerError, writer.uint32(18).fork()).ldelim();
    }
    if (message.unauthorizedError !== undefined) {
      UnauthorizedError.encode(message.unauthorizedError, writer.uint32(26).fork()).ldelim();
    }
    if (message.forbiddenError !== undefined) {
      ForbiddenError.encode(message.forbiddenError, writer.uint32(34).fork()).ldelim();
    }
    if (message.tooManyRequestsError !== undefined) {
      TooManyRequestsError.encode(message.tooManyRequestsError, writer.uint32(42).fork()).ldelim();
    }
    if (message.badRequestError !== undefined) {
      BadRequestError.encode(message.badRequestError, writer.uint32(50).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UsersResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseUsersResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.users = Users.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.internalServerError = InternalServerError.decode(reader, reader.uint32());
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.unauthorizedError = UnauthorizedError.decode(reader, reader.uint32());
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.forbiddenError = ForbiddenError.decode(reader, reader.uint32());
          continue;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.tooManyRequestsError = TooManyRequestsError.decode(reader, reader.uint32());
          continue;
        case 6:
          if (tag !== 50) {
            break;
          }

          message.badRequestError = BadRequestError.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): UsersResponse {
    return {
      users: isSet(object.users) ? Users.fromJSON(object.users) : undefined,
      internalServerError: isSet(object.internalServerError)
        ? InternalServerError.fromJSON(object.internalServerError)
        : undefined,
      unauthorizedError: isSet(object.unauthorizedError)
        ? UnauthorizedError.fromJSON(object.unauthorizedError)
        : undefined,
      forbiddenError: isSet(object.forbiddenError) ? ForbiddenError.fromJSON(object.forbiddenError) : undefined,
      tooManyRequestsError: isSet(object.tooManyRequestsError)
        ? TooManyRequestsError.fromJSON(object.tooManyRequestsError)
        : undefined,
      badRequestError: isSet(object.badRequestError) ? BadRequestError.fromJSON(object.badRequestError) : undefined,
    };
  },

  toJSON(message: UsersResponse): unknown {
    const obj: any = {};
    if (message.users !== undefined) {
      obj.users = Users.toJSON(message.users);
    }
    if (message.internalServerError !== undefined) {
      obj.internalServerError = InternalServerError.toJSON(message.internalServerError);
    }
    if (message.unauthorizedError !== undefined) {
      obj.unauthorizedError = UnauthorizedError.toJSON(message.unauthorizedError);
    }
    if (message.forbiddenError !== undefined) {
      obj.forbiddenError = ForbiddenError.toJSON(message.forbiddenError);
    }
    if (message.tooManyRequestsError !== undefined) {
      obj.tooManyRequestsError = TooManyRequestsError.toJSON(message.tooManyRequestsError);
    }
    if (message.badRequestError !== undefined) {
      obj.badRequestError = BadRequestError.toJSON(message.badRequestError);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<UsersResponse>, I>>(base?: I): UsersResponse {
    return UsersResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<UsersResponse>, I>>(object: I): UsersResponse {
    const message = createBaseUsersResponse();
    message.users = (object.users !== undefined && object.users !== null) ? Users.fromPartial(object.users) : undefined;
    message.internalServerError = (object.internalServerError !== undefined && object.internalServerError !== null)
      ? InternalServerError.fromPartial(object.internalServerError)
      : undefined;
    message.unauthorizedError = (object.unauthorizedError !== undefined && object.unauthorizedError !== null)
      ? UnauthorizedError.fromPartial(object.unauthorizedError)
      : undefined;
    message.forbiddenError = (object.forbiddenError !== undefined && object.forbiddenError !== null)
      ? ForbiddenError.fromPartial(object.forbiddenError)
      : undefined;
    message.tooManyRequestsError = (object.tooManyRequestsError !== undefined && object.tooManyRequestsError !== null)
      ? TooManyRequestsError.fromPartial(object.tooManyRequestsError)
      : undefined;
    message.badRequestError = (object.badRequestError !== undefined && object.badRequestError !== null)
      ? BadRequestError.fromPartial(object.badRequestError)
      : undefined;
    return message;
  },
};

function createBaseRequestEventsResponse(): RequestEventsResponse {
  return {
    events: undefined,
    internalServerError: undefined,
    unauthorizedError: undefined,
    forbiddenError: undefined,
    tooManyRequestsError: undefined,
  };
}

export const RequestEventsResponse = {
  encode(message: RequestEventsResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.events !== undefined) {
      RequestEvents.encode(message.events, writer.uint32(10).fork()).ldelim();
    }
    if (message.internalServerError !== undefined) {
      InternalServerError.encode(message.internalServerError, writer.uint32(18).fork()).ldelim();
    }
    if (message.unauthorizedError !== undefined) {
      UnauthorizedError.encode(message.unauthorizedError, writer.uint32(26).fork()).ldelim();
    }
    if (message.forbiddenError !== undefined) {
      ForbiddenError.encode(message.forbiddenError, writer.uint32(34).fork()).ldelim();
    }
    if (message.tooManyRequestsError !== undefined) {
      TooManyRequestsError.encode(message.tooManyRequestsError, writer.uint32(42).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RequestEventsResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRequestEventsResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.events = RequestEvents.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.internalServerError = InternalServerError.decode(reader, reader.uint32());
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.unauthorizedError = UnauthorizedError.decode(reader, reader.uint32());
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.forbiddenError = ForbiddenError.decode(reader, reader.uint32());
          continue;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.tooManyRequestsError = TooManyRequestsError.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): RequestEventsResponse {
    return {
      events: isSet(object.events) ? RequestEvents.fromJSON(object.events) : undefined,
      internalServerError: isSet(object.internalServerError)
        ? InternalServerError.fromJSON(object.internalServerError)
        : undefined,
      unauthorizedError: isSet(object.unauthorizedError)
        ? UnauthorizedError.fromJSON(object.unauthorizedError)
        : undefined,
      forbiddenError: isSet(object.forbiddenError) ? ForbiddenError.fromJSON(object.forbiddenError) : undefined,
      tooManyRequestsError: isSet(object.tooManyRequestsError)
        ? TooManyRequestsError.fromJSON(object.tooManyRequestsError)
        : undefined,
    };
  },

  toJSON(message: RequestEventsResponse): unknown {
    const obj: any = {};
    if (message.events !== undefined) {
      obj.events = RequestEvents.toJSON(message.events);
    }
    if (message.internalServerError !== undefined) {
      obj.internalServerError = InternalServerError.toJSON(message.internalServerError);
    }
    if (message.unauthorizedError !== undefined) {
      obj.unauthorizedError = UnauthorizedError.toJSON(message.unauthorizedError);
    }
    if (message.forbiddenError !== undefined) {
      obj.forbiddenError = ForbiddenError.toJSON(message.forbiddenError);
    }
    if (message.tooManyRequestsError !== undefined) {
      obj.tooManyRequestsError = TooManyRequestsError.toJSON(message.tooManyRequestsError);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<RequestEventsResponse>, I>>(base?: I): RequestEventsResponse {
    return RequestEventsResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<RequestEventsResponse>, I>>(object: I): RequestEventsResponse {
    const message = createBaseRequestEventsResponse();
    message.events = (object.events !== undefined && object.events !== null)
      ? RequestEvents.fromPartial(object.events)
      : undefined;
    message.internalServerError = (object.internalServerError !== undefined && object.internalServerError !== null)
      ? InternalServerError.fromPartial(object.internalServerError)
      : undefined;
    message.unauthorizedError = (object.unauthorizedError !== undefined && object.unauthorizedError !== null)
      ? UnauthorizedError.fromPartial(object.unauthorizedError)
      : undefined;
    message.forbiddenError = (object.forbiddenError !== undefined && object.forbiddenError !== null)
      ? ForbiddenError.fromPartial(object.forbiddenError)
      : undefined;
    message.tooManyRequestsError = (object.tooManyRequestsError !== undefined && object.tooManyRequestsError !== null)
      ? TooManyRequestsError.fromPartial(object.tooManyRequestsError)
      : undefined;
    return message;
  },
};

function createBaseUpdateFriendshipResponse(): UpdateFriendshipResponse {
  return {
    event: undefined,
    internalServerError: undefined,
    unauthorizedError: undefined,
    forbiddenError: undefined,
    tooManyRequestsError: undefined,
    badRequestError: undefined,
  };
}

export const UpdateFriendshipResponse = {
  encode(message: UpdateFriendshipResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.event !== undefined) {
      FriendshipEventResponse.encode(message.event, writer.uint32(10).fork()).ldelim();
    }
    if (message.internalServerError !== undefined) {
      InternalServerError.encode(message.internalServerError, writer.uint32(18).fork()).ldelim();
    }
    if (message.unauthorizedError !== undefined) {
      UnauthorizedError.encode(message.unauthorizedError, writer.uint32(26).fork()).ldelim();
    }
    if (message.forbiddenError !== undefined) {
      ForbiddenError.encode(message.forbiddenError, writer.uint32(34).fork()).ldelim();
    }
    if (message.tooManyRequestsError !== undefined) {
      TooManyRequestsError.encode(message.tooManyRequestsError, writer.uint32(42).fork()).ldelim();
    }
    if (message.badRequestError !== undefined) {
      BadRequestError.encode(message.badRequestError, writer.uint32(50).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UpdateFriendshipResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseUpdateFriendshipResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.event = FriendshipEventResponse.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.internalServerError = InternalServerError.decode(reader, reader.uint32());
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.unauthorizedError = UnauthorizedError.decode(reader, reader.uint32());
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.forbiddenError = ForbiddenError.decode(reader, reader.uint32());
          continue;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.tooManyRequestsError = TooManyRequestsError.decode(reader, reader.uint32());
          continue;
        case 6:
          if (tag !== 50) {
            break;
          }

          message.badRequestError = BadRequestError.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): UpdateFriendshipResponse {
    return {
      event: isSet(object.event) ? FriendshipEventResponse.fromJSON(object.event) : undefined,
      internalServerError: isSet(object.internalServerError)
        ? InternalServerError.fromJSON(object.internalServerError)
        : undefined,
      unauthorizedError: isSet(object.unauthorizedError)
        ? UnauthorizedError.fromJSON(object.unauthorizedError)
        : undefined,
      forbiddenError: isSet(object.forbiddenError) ? ForbiddenError.fromJSON(object.forbiddenError) : undefined,
      tooManyRequestsError: isSet(object.tooManyRequestsError)
        ? TooManyRequestsError.fromJSON(object.tooManyRequestsError)
        : undefined,
      badRequestError: isSet(object.badRequestError) ? BadRequestError.fromJSON(object.badRequestError) : undefined,
    };
  },

  toJSON(message: UpdateFriendshipResponse): unknown {
    const obj: any = {};
    if (message.event !== undefined) {
      obj.event = FriendshipEventResponse.toJSON(message.event);
    }
    if (message.internalServerError !== undefined) {
      obj.internalServerError = InternalServerError.toJSON(message.internalServerError);
    }
    if (message.unauthorizedError !== undefined) {
      obj.unauthorizedError = UnauthorizedError.toJSON(message.unauthorizedError);
    }
    if (message.forbiddenError !== undefined) {
      obj.forbiddenError = ForbiddenError.toJSON(message.forbiddenError);
    }
    if (message.tooManyRequestsError !== undefined) {
      obj.tooManyRequestsError = TooManyRequestsError.toJSON(message.tooManyRequestsError);
    }
    if (message.badRequestError !== undefined) {
      obj.badRequestError = BadRequestError.toJSON(message.badRequestError);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<UpdateFriendshipResponse>, I>>(base?: I): UpdateFriendshipResponse {
    return UpdateFriendshipResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<UpdateFriendshipResponse>, I>>(object: I): UpdateFriendshipResponse {
    const message = createBaseUpdateFriendshipResponse();
    message.event = (object.event !== undefined && object.event !== null)
      ? FriendshipEventResponse.fromPartial(object.event)
      : undefined;
    message.internalServerError = (object.internalServerError !== undefined && object.internalServerError !== null)
      ? InternalServerError.fromPartial(object.internalServerError)
      : undefined;
    message.unauthorizedError = (object.unauthorizedError !== undefined && object.unauthorizedError !== null)
      ? UnauthorizedError.fromPartial(object.unauthorizedError)
      : undefined;
    message.forbiddenError = (object.forbiddenError !== undefined && object.forbiddenError !== null)
      ? ForbiddenError.fromPartial(object.forbiddenError)
      : undefined;
    message.tooManyRequestsError = (object.tooManyRequestsError !== undefined && object.tooManyRequestsError !== null)
      ? TooManyRequestsError.fromPartial(object.tooManyRequestsError)
      : undefined;
    message.badRequestError = (object.badRequestError !== undefined && object.badRequestError !== null)
      ? BadRequestError.fromPartial(object.badRequestError)
      : undefined;
    return message;
  },
};

function createBaseSubscribeFriendshipEventsUpdatesResponse(): SubscribeFriendshipEventsUpdatesResponse {
  return {
    events: undefined,
    internalServerError: undefined,
    unauthorizedError: undefined,
    forbiddenError: undefined,
    tooManyRequestsError: undefined,
  };
}

export const SubscribeFriendshipEventsUpdatesResponse = {
  encode(message: SubscribeFriendshipEventsUpdatesResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.events !== undefined) {
      FriendshipEventResponses.encode(message.events, writer.uint32(10).fork()).ldelim();
    }
    if (message.internalServerError !== undefined) {
      InternalServerError.encode(message.internalServerError, writer.uint32(18).fork()).ldelim();
    }
    if (message.unauthorizedError !== undefined) {
      UnauthorizedError.encode(message.unauthorizedError, writer.uint32(26).fork()).ldelim();
    }
    if (message.forbiddenError !== undefined) {
      ForbiddenError.encode(message.forbiddenError, writer.uint32(34).fork()).ldelim();
    }
    if (message.tooManyRequestsError !== undefined) {
      TooManyRequestsError.encode(message.tooManyRequestsError, writer.uint32(42).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SubscribeFriendshipEventsUpdatesResponse {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseSubscribeFriendshipEventsUpdatesResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.events = FriendshipEventResponses.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.internalServerError = InternalServerError.decode(reader, reader.uint32());
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.unauthorizedError = UnauthorizedError.decode(reader, reader.uint32());
          continue;
        case 4:
          if (tag !== 34) {
            break;
          }

          message.forbiddenError = ForbiddenError.decode(reader, reader.uint32());
          continue;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.tooManyRequestsError = TooManyRequestsError.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): SubscribeFriendshipEventsUpdatesResponse {
    return {
      events: isSet(object.events) ? FriendshipEventResponses.fromJSON(object.events) : undefined,
      internalServerError: isSet(object.internalServerError)
        ? InternalServerError.fromJSON(object.internalServerError)
        : undefined,
      unauthorizedError: isSet(object.unauthorizedError)
        ? UnauthorizedError.fromJSON(object.unauthorizedError)
        : undefined,
      forbiddenError: isSet(object.forbiddenError) ? ForbiddenError.fromJSON(object.forbiddenError) : undefined,
      tooManyRequestsError: isSet(object.tooManyRequestsError)
        ? TooManyRequestsError.fromJSON(object.tooManyRequestsError)
        : undefined,
    };
  },

  toJSON(message: SubscribeFriendshipEventsUpdatesResponse): unknown {
    const obj: any = {};
    if (message.events !== undefined) {
      obj.events = FriendshipEventResponses.toJSON(message.events);
    }
    if (message.internalServerError !== undefined) {
      obj.internalServerError = InternalServerError.toJSON(message.internalServerError);
    }
    if (message.unauthorizedError !== undefined) {
      obj.unauthorizedError = UnauthorizedError.toJSON(message.unauthorizedError);
    }
    if (message.forbiddenError !== undefined) {
      obj.forbiddenError = ForbiddenError.toJSON(message.forbiddenError);
    }
    if (message.tooManyRequestsError !== undefined) {
      obj.tooManyRequestsError = TooManyRequestsError.toJSON(message.tooManyRequestsError);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<SubscribeFriendshipEventsUpdatesResponse>, I>>(
    base?: I,
  ): SubscribeFriendshipEventsUpdatesResponse {
    return SubscribeFriendshipEventsUpdatesResponse.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<SubscribeFriendshipEventsUpdatesResponse>, I>>(
    object: I,
  ): SubscribeFriendshipEventsUpdatesResponse {
    const message = createBaseSubscribeFriendshipEventsUpdatesResponse();
    message.events = (object.events !== undefined && object.events !== null)
      ? FriendshipEventResponses.fromPartial(object.events)
      : undefined;
    message.internalServerError = (object.internalServerError !== undefined && object.internalServerError !== null)
      ? InternalServerError.fromPartial(object.internalServerError)
      : undefined;
    message.unauthorizedError = (object.unauthorizedError !== undefined && object.unauthorizedError !== null)
      ? UnauthorizedError.fromPartial(object.unauthorizedError)
      : undefined;
    message.forbiddenError = (object.forbiddenError !== undefined && object.forbiddenError !== null)
      ? ForbiddenError.fromPartial(object.forbiddenError)
      : undefined;
    message.tooManyRequestsError = (object.tooManyRequestsError !== undefined && object.tooManyRequestsError !== null)
      ? TooManyRequestsError.fromPartial(object.tooManyRequestsError)
      : undefined;
    return message;
  },
};

export type FriendshipsServiceDefinition = typeof FriendshipsServiceDefinition;
export const FriendshipsServiceDefinition = {
  name: "FriendshipsService",
  fullName: "decentraland.social.friendships_ea.FriendshipsService",
  methods: {
    /** Get the list of friends for the authenticated user */
    getFriends: {
      name: "GetFriends",
      requestType: Empty,
      requestStream: false,
      responseType: UsersResponse,
      responseStream: true,
      options: {},
    },
    /** Get the list of mutual friends between the authenticated user and the one in the parameter */
    getMutualFriends: {
      name: "GetMutualFriends",
      requestType: MutualFriendsPayload,
      requestStream: false,
      responseType: UsersResponse,
      responseStream: true,
      options: {},
    },
    /** Get the list of request events for the authenticated user */
    getRequestEvents: {
      name: "GetRequestEvents",
      requestType: Empty,
      requestStream: false,
      responseType: RequestEventsResponse,
      responseStream: false,
      options: {},
    },
    /** Update friendship status: REQUEST, ACCEPT, REJECT, CANCEL, DELETE */
    updateFriendshipEvent: {
      name: "UpdateFriendshipEvent",
      requestType: UpdateFriendshipPayload,
      requestStream: false,
      responseType: UpdateFriendshipResponse,
      responseStream: false,
      options: {},
    },
    /** Subscribe to updates of friendship status: REQUEST, ACCEPT, REJECT, CANCEL, DELETE */
    subscribeFriendshipEventsUpdates: {
      name: "SubscribeFriendshipEventsUpdates",
      requestType: Empty,
      requestStream: false,
      responseType: SubscribeFriendshipEventsUpdatesResponse,
      responseStream: true,
      options: {},
    },
  },
} as const;

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin ? T
  : T extends globalThis.Array<infer U> ? globalThis.Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function longToNumber(long: Long): number {
  if (long.gt(globalThis.Number.MAX_SAFE_INTEGER)) {
    throw new globalThis.Error("Value is larger than Number.MAX_SAFE_INTEGER");
  }
  return long.toNumber();
}

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
