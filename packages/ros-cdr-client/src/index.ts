const brand = Symbol();
type Branded<T, Brand> = T & { [brand]: Brand };

const OP_CREATE_SUBSCRIPTION = 'create_subscription' as const;
const OP_CREATE_PUBLISHER = 'create_publisher' as const;
const OP_CREATE_SERVICE_CLIENT = 'create_service_client' as const;
const OP_DESTROY = 'destroy' as const;

const OP_TOPIC = 1 as const;
const OP_SERVICE_REQUEST = 2 as const;
const OP_SERVICE_RESPONSE = 3 as const;

type CreateOp =
  | typeof OP_CREATE_PUBLISHER
  | typeof OP_CREATE_SUBSCRIPTION
  | typeof OP_CREATE_SERVICE_CLIENT;

export type PublisherId = Branded<number, 'PublisherId'>;
export type SubscriptionId = Branded<number, 'SubscriptionId'>;
export type ServiceClientId = Branded<number, 'ServiceClientId'>;

interface CreateRequest {
  callId: number;
  op: CreateOp;
  name: string;
  type: string;
}

interface CreateResponse {
  id: number;
  callId: number;
}

interface DestroyRequest {
  op: typeof OP_DESTROY;
  id: PublisherId | SubscriptionId | ServiceClientId;
}

interface SubscriptionMessage {
  opcode: typeof OP_TOPIC;
  id: number;
  message: DataView;
}

interface ServiceClientResponse {
  opcode: typeof OP_SERVICE_RESPONSE;
  id: number;
  callId: number;
  message: DataView;
}

function parseTextPayload(payload: string): CreateResponse | null {
  let response: unknown;
  try {
    response = JSON.parse(payload);
  } catch {
    return null;
  }
  if (response === null || typeof response !== 'object') {
    return null;
  }
  if (!('id' in response) || typeof response.id !== 'number') {
    return null;
  }
  if (!('callId' in response) || typeof response.callId !== 'number') {
    return null;
  }
  return {
    id: response.id,
    callId: response.callId,
  };
}

function parseBinaryPayload(
  buffer: ArrayBuffer,
): SubscriptionMessage | ServiceClientResponse | null {
  const view = new DataView(buffer);
  if (view.byteLength < 5) {
    return null;
  }

  const opcode = view.getUint8(0);

  if (opcode === OP_TOPIC) {
    const id = view.getUint32(1, true);
    return { opcode: OP_TOPIC, id, message: new DataView(buffer, 5) };
  }
  if (opcode === OP_SERVICE_RESPONSE) {
    if (view.byteLength < 9) {
      return null;
    }
    const id = view.getUint32(1, true);
    const callId = view.getUint32(5, true);
    return {
      opcode: OP_SERVICE_RESPONSE,
      id,
      callId,
      message: new DataView(buffer, 9),
    };
  }
  return null;
}

export class RosCdrClient {
  readonly #ws: WebSocket;

  readonly #pendingCreates = new Map<number, (id: number) => void>();
  readonly #subscriptions = new Map<
    SubscriptionId,
    (message: DataView) => void
  >();
  readonly #serviceResponses = new Map<number, (response: DataView) => void>();
  #callId = 0;

  constructor(ws: WebSocket) {
    this.#ws = ws;
    this.#ws.binaryType = 'arraybuffer';
    this.#ws.onmessage = this.#onMessage.bind(this);
  }

  async createPublisher(name: string, type: string): Promise<PublisherId> {
    const request: CreateRequest = {
      callId: this.#callId++,
      op: OP_CREATE_PUBLISHER,
      name,
      type,
    };
    return this.#sendCreateRequest(request) as Promise<PublisherId>;
  }

  async createSubscription(
    name: string,
    type: string,
    callback: (message: DataView) => void,
  ): Promise<SubscriptionId> {
    const request: CreateRequest = {
      callId: this.#callId++,
      op: OP_CREATE_SUBSCRIPTION,
      name,
      type,
    };
    const id = await (this.#sendCreateRequest(
      request,
    ) as Promise<SubscriptionId>);
    this.#subscriptions.set(id, callback);
    return id;
  }

  async createServiceClient(
    name: string,
    type: string,
  ): Promise<ServiceClientId> {
    const request: CreateRequest = {
      callId: this.#callId++,
      op: OP_CREATE_SERVICE_CLIENT,
      name,
      type,
    };
    return this.#sendCreateRequest(request) as Promise<ServiceClientId>;
  }

  publish(id: PublisherId, message: Uint8Array) {
    const payload = new Uint8Array(1 + 4 + message.length);
    payload[0] = OP_TOPIC;
    const view = new DataView(payload.buffer);
    view.setUint32(1, id, true);
    payload.set(message, 5);
    this.#sendBinaryPayload(payload);
  }

  callService(id: ServiceClientId, request: Uint8Array): Promise<DataView> {
    const callId = this.#callId++;
    const payload = new Uint8Array(1 + 4 + 4 + request.length);
    payload[0] = OP_SERVICE_REQUEST;
    const view = new DataView(payload.buffer);
    view.setUint32(1, id, true);
    view.setUint32(5, callId, true);
    payload.set(request, 9);

    return new Promise((resolve) => {
      this.#serviceResponses.set(callId, resolve);
      this.#sendBinaryPayload(payload);
    });
  }

  destroy(id: PublisherId | SubscriptionId | ServiceClientId) {
    const request: DestroyRequest = { op: OP_DESTROY, id };
    this.#sendTextPayload(request);
    this.#subscriptions.delete(id as SubscriptionId);
  }

  #sendCreateRequest(request: CreateRequest): Promise<number> {
    return new Promise((resolve) => {
      this.#pendingCreates.set(request.callId, resolve);
      this.#sendTextPayload(request);
    });
  }

  #sendTextPayload(payload: CreateRequest | DestroyRequest) {
    this.#ws.send(JSON.stringify(payload));
  }

  #sendBinaryPayload(payload: Uint8Array) {
    this.#ws.send(payload);
  }

  #onMessage(event: MessageEvent) {
    if (typeof event.data === 'string') {
      this.#onTextPayload(event.data);
      return;
    }
    if (event.data instanceof ArrayBuffer) {
      this.#onBinaryPayload(event.data);
      return;
    }
  }

  #onTextPayload(payload: string) {
    const response = parseTextPayload(payload);
    if (!response) {
      return;
    }
    const callback = this.#pendingCreates.get(response.callId);
    if (callback) {
      this.#pendingCreates.delete(response.callId);
      callback(response.id);
    }
  }

  #onBinaryPayload(payload: ArrayBuffer) {
    const message = parseBinaryPayload(payload);
    if (!message) {
      return;
    }
    if (message.opcode === OP_TOPIC) {
      this.#subscriptions.get(message.id as SubscriptionId)?.(message.message);
      return;
    }
    if (message.opcode === OP_SERVICE_RESPONSE) {
      const callback = this.#serviceResponses.get(message.callId);
      if (callback) {
        this.#serviceResponses.delete(message.callId);
        callback(message.message);
      }
      return;
    }
  }
}
