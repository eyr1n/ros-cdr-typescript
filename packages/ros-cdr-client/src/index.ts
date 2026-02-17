const brand = Symbol();
type Branded<T, Brand> = T & { [brand]: Brand };

const OP_TOPIC = 0 as const;
const OP_SERVICE_REQUEST = 1 as const;
const OP_SERVICE_RESPONSE = 2 as const;

export type PublisherId = Branded<number, 'PublisherId'>;
export type SubscriptionId = Branded<number, 'SubscriptionId'>;
export type ServiceClientId = Branded<number, 'ServiceClientId'>;

export type QosBaseProfile =
  | 'sensor_data'
  | 'parameters'
  | 'default'
  | 'services_default'
  | 'parameter_events'
  | 'system_default'
  | 'best_available';

export type QosHistoryPolicy = 'system_default' | 'keep_last' | 'keep_all';

export type QosReliabilityPolicy =
  | 'system_default'
  | 'reliable'
  | 'best_effort'
  | 'best_available';

export type QosDurabilityPolicy =
  | 'system_default'
  | 'transient_local'
  | 'volatile'
  | 'best_available';

export type QosLivelinessPolicy =
  | 'system_default'
  | 'automatic'
  | 'manual_by_topic'
  | 'best_available';

export type QosDuration =
  | {
      sec: number;
      nsec: number;
    }
  | 'infinite';

export interface QosProfile {
  profile?: QosBaseProfile;
  history?: QosHistoryPolicy;
  depth?: number;
  reliability?: QosReliabilityPolicy;
  durability?: QosDurabilityPolicy;
  deadline?: QosDuration;
  lifespan?: QosDuration;
  liveliness?: QosLivelinessPolicy;
  liveliness_lease_duration?: QosDuration;
  avoid_ros_namespace_conventions?: boolean;
}

interface CreateRequest {
  call_id: number;
  op: 'create_publisher' | 'create_subscription' | 'create_service_client';
  name: string;
  type: string;
  qos: QosProfile;
}

interface CreateResponse {
  id: number;
  call_id: number;
}

interface DestroyRequest {
  op: 'destroy';
  id: PublisherId | SubscriptionId | ServiceClientId;
}

interface SubscriptionMessage {
  opcode: typeof OP_TOPIC;
  id: number;
  message: DataView;
}

interface ServiceClientResponse {
  opcode: typeof OP_SERVICE_RESPONSE;
  call_id: number;
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
  if (!('call_id' in response) || typeof response.call_id !== 'number') {
    return null;
  }
  return {
    id: response.id,
    call_id: response.call_id,
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
    const call_id = view.getUint32(1, true);
    return {
      opcode: OP_SERVICE_RESPONSE,
      call_id,
      message: new DataView(buffer, 5),
    };
  }
  return null;
}

export class RosCdrClient {
  #ws: WebSocket;
  #pendingCreates = new Map<number, (id: number) => void>();
  #subscriptions = new Map<SubscriptionId, (message: DataView) => void>();
  #serviceResponses = new Map<number, (response: DataView) => void>();
  #nextCallId = 0;

  constructor(ws: WebSocket) {
    this.#ws = ws;
    this.#ws.binaryType = 'arraybuffer';
    this.#ws.onmessage = this.#onMessage.bind(this);
  }

  async createPublisher(
    name: string,
    type: string,
    qos: QosProfile,
    options?: { signal?: AbortSignal },
  ): Promise<PublisherId> {
    const request: CreateRequest = {
      call_id: this.#nextCallId++,
      op: 'create_publisher',
      name,
      type,
      qos,
    };
    return this.#sendCreateRequest(request, options) as Promise<PublisherId>;
  }

  async createSubscription(
    name: string,
    type: string,
    qos: QosProfile,
    callback: (message: DataView) => void,
    options?: { signal?: AbortSignal },
  ): Promise<SubscriptionId> {
    const request: CreateRequest = {
      call_id: this.#nextCallId++,
      op: 'create_subscription',
      name,
      type,
      qos,
    };
    const id = await (this.#sendCreateRequest(
      request,
      options,
    ) as Promise<SubscriptionId>);
    this.#subscriptions.set(id, callback);
    return id;
  }

  async createServiceClient(
    name: string,
    type: string,
    qos: QosProfile,
    options?: { signal?: AbortSignal },
  ): Promise<ServiceClientId> {
    const request: CreateRequest = {
      call_id: this.#nextCallId++,
      op: 'create_service_client',
      name,
      type,
      qos,
    };
    return this.#sendCreateRequest(
      request,
      options,
    ) as Promise<ServiceClientId>;
  }

  publish(id: PublisherId, message: Uint8Array) {
    const payload = new Uint8Array(1 + 4 + message.length);
    payload[0] = OP_TOPIC;
    const view = new DataView(payload.buffer);
    view.setUint32(1, id, true);
    payload.set(message, 5);
    this.#sendBinaryPayload(payload);
  }

  callService(
    id: ServiceClientId,
    request: Uint8Array,
    options?: { signal?: AbortSignal },
  ): Promise<DataView> {
    if (options?.signal?.aborted) {
      return Promise.reject(options.signal.reason);
    }

    const callId = this.#nextCallId++;
    const payload = new Uint8Array(1 + 4 + 4 + request.length);
    payload[0] = OP_SERVICE_REQUEST;
    const view = new DataView(payload.buffer);
    view.setUint32(1, id, true);
    view.setUint32(5, callId, true);
    payload.set(request, 9);

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (this.#serviceResponses.delete(callId)) {
          reject(options?.signal?.reason);
        }
      };

      options?.signal?.addEventListener('abort', onAbort, { once: true });
      this.#serviceResponses.set(callId, (response) => {
        options?.signal?.removeEventListener('abort', onAbort);
        resolve(response);
      });

      try {
        this.#sendBinaryPayload(payload);
      } catch (error) {
        reject(error);
      }
    });
  }

  destroy(id: PublisherId | SubscriptionId | ServiceClientId) {
    const request: DestroyRequest = { op: 'destroy', id };
    this.#sendTextPayload(request);
    this.#subscriptions.delete(id as SubscriptionId);
  }

  #sendCreateRequest(
    request: CreateRequest,
    options?: { signal?: AbortSignal },
  ): Promise<number> {
    if (options?.signal?.aborted) {
      return Promise.reject(options.signal.reason);
    }

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (this.#pendingCreates.delete(request.call_id)) {
          reject(options?.signal?.reason);
        }
      };

      options?.signal?.addEventListener('abort', onAbort, { once: true });
      this.#pendingCreates.set(request.call_id, (id: number) => {
        options?.signal?.removeEventListener('abort', onAbort);
        resolve(id);
      });

      try {
        this.#sendTextPayload(request);
      } catch (error) {
        reject(error);
      }
    });
  }

  #sendTextPayload(payload: CreateRequest | DestroyRequest) {
    this.#ws.send(JSON.stringify(payload));
  }

  #sendBinaryPayload(payload: Uint8Array) {
    this.#ws.send(payload);
  }

  #onMessage(event: MessageEvent<unknown>) {
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
    const callback = this.#pendingCreates.get(response.call_id);
    if (callback) {
      this.#pendingCreates.delete(response.call_id);
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
      const callback = this.#serviceResponses.get(message.call_id);
      if (callback) {
        this.#serviceResponses.delete(message.call_id);
        callback(message.message);
      }
      return;
    }
  }
}
