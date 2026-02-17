import { CdrReader, CdrWriter } from '@foxglove/cdr';

interface RosPrimitiveTypeMap {
  bool: boolean;
  byte: number;
  char: number;
  float32: number;
  float64: number;
  int8: number;
  uint8: number;
  int16: number;
  uint16: number;
  int32: number;
  uint32: number;
  int64: bigint;
  uint64: bigint;
  string: string;
  wstring: string;
}

export type RosPrimitiveType = keyof RosPrimitiveTypeMap;
export type Infer<Schema> =
  Schema extends RosSchema<infer Value> ? Value : unknown;
export type RosMessageShape = { [key: string]: RosSchema };
export type InferMessageShape<Shape extends RosMessageShape> = {
  [K in keyof Shape]: Infer<Shape[K]>;
};

export abstract class RosSchema<Value = unknown> {
  protected abstract read(reader: CdrReader): Value;
  protected abstract write(writer: CdrWriter, input: Value): void;

  /** @internal */
  _read(reader: CdrReader): Value {
    return this.read(reader);
  }

  /** @internal */
  _write(writer: CdrWriter, input: Value): void {
    this.write(writer, input);
  }
}

export class RosPrimitiveSchema<
  Type extends RosPrimitiveType,
> extends RosSchema<RosPrimitiveTypeMap[Type]> {
  #type: Type;

  constructor(type: Type) {
    super();
    this.#type = type;
  }

  protected read(reader: CdrReader): RosPrimitiveTypeMap[Type] {
    switch (this.#type) {
      case 'bool':
        return (reader.uint8() !== 0) as RosPrimitiveTypeMap[Type];
      case 'byte':
      case 'char':
        return reader.uint8() as RosPrimitiveTypeMap[Type];
      case 'float32':
        return reader.float32() as RosPrimitiveTypeMap[Type];
      case 'float64':
        return reader.float64() as RosPrimitiveTypeMap[Type];
      case 'int8':
        return reader.int8() as RosPrimitiveTypeMap[Type];
      case 'uint8':
        return reader.uint8() as RosPrimitiveTypeMap[Type];
      case 'int16':
        return reader.int16() as RosPrimitiveTypeMap[Type];
      case 'uint16':
        return reader.uint16() as RosPrimitiveTypeMap[Type];
      case 'int32':
        return reader.int32() as RosPrimitiveTypeMap[Type];
      case 'uint32':
        return reader.uint32() as RosPrimitiveTypeMap[Type];
      case 'int64':
        return reader.int64() as RosPrimitiveTypeMap[Type];
      case 'uint64':
        return reader.uint64() as RosPrimitiveTypeMap[Type];
      case 'string':
      case 'wstring':
        return reader.string() as RosPrimitiveTypeMap[Type];
    }
  }

  protected write(writer: CdrWriter, input: RosPrimitiveTypeMap[Type]): void {
    switch (this.#type) {
      case 'bool':
        writer.uint8(input ? 1 : 0);
        return;
      case 'byte':
      case 'char':
        writer.uint8(input as number);
        return;
      case 'float32':
        writer.float32(input as number);
        return;
      case 'float64':
        writer.float64(input as number);
        return;
      case 'int8':
        writer.int8(input as number);
        return;
      case 'uint8':
        writer.uint8(input as number);
        return;
      case 'int16':
        writer.int16(input as number);
        return;
      case 'uint16':
        writer.uint16(input as number);
        return;
      case 'int32':
        writer.int32(input as number);
        return;
      case 'uint32':
        writer.uint32(input as number);
        return;
      case 'int64':
        writer.int64(input as bigint);
        return;
      case 'uint64':
        writer.uint64(input as bigint);
        return;
      case 'string':
      case 'wstring':
        writer.string(input as string);
        return;
    }
  }
}

export class RosArraySchema<Schema extends RosSchema> extends RosSchema<
  Infer<Schema>[]
> {
  #schema: Schema;
  #length: number | undefined;

  constructor(schema: Schema, length?: number) {
    super();
    if (length !== undefined && (!Number.isInteger(length) || length <= 0)) {
      throw new Error('length must be a positive integer');
    }
    this.#schema = schema;
    this.#length = length;
  }

  protected read(reader: CdrReader): Infer<Schema>[] {
    const length = this.#length ?? reader.sequenceLength();
    const output: Infer<Schema>[] = [];
    for (let i = 0; i < length; ++i) {
      output.push(this.#schema._read(reader) as Infer<Schema>);
    }
    return output;
  }

  protected write(writer: CdrWriter, input: Infer<Schema>[]): void {
    if (this.#length === undefined) {
      writer.sequenceLength(input.length);
    } else if (input.length !== this.#length) {
      throw new Error(
        `expected fixed array length ${this.#length}, got ${input.length}`,
      );
    }
    for (const item of input) {
      this.#schema._write(writer, item);
    }
  }
}

export class RosMessageSchema<
  Shape extends RosMessageShape = RosMessageShape,
> extends RosSchema<InferMessageShape<Shape>> {
  #type: string;
  #shape: Shape;

  constructor(type: string, shape: Shape) {
    super();
    this.#type = type;
    this.#shape = shape;
  }

  get type(): string {
    return this.#type;
  }

  protected read(reader: CdrReader): InferMessageShape<Shape> {
    const entries = Object.entries(this.#shape);
    if (entries.length === 0) {
      reader.uint8();
      return {} as InferMessageShape<Shape>;
    }
    const output: { [key: string]: unknown } = {};
    for (const [key, schema] of entries) {
      output[key] = schema._read(reader);
    }
    return output as InferMessageShape<Shape>;
  }

  protected write(writer: CdrWriter, input: InferMessageShape<Shape>): void {
    const entries = Object.entries(this.#shape);
    if (entries.length === 0) {
      writer.uint8(0);
      return;
    }
    for (const [key, schema] of entries) {
      schema._write(writer, input[key]);
    }
  }
}

export interface RosServiceSchema<
  RequestShape extends RosMessageShape = RosMessageShape,
  ResponseShape extends RosMessageShape = RosMessageShape,
> {
  type: string;
  request: RosMessageSchema<RequestShape>;
  response: RosMessageSchema<ResponseShape>;
}

function primitiveFactory<Type extends RosPrimitiveType>(
  type: Type,
): () => RosPrimitiveSchema<Type> {
  return () => new RosPrimitiveSchema(type);
}

export const bool = primitiveFactory('bool');
export const byte = primitiveFactory('byte');
export const char = primitiveFactory('char');
export const float32 = primitiveFactory('float32');
export const float64 = primitiveFactory('float64');
export const int8 = primitiveFactory('int8');
export const uint8 = primitiveFactory('uint8');
export const int16 = primitiveFactory('int16');
export const uint16 = primitiveFactory('uint16');
export const int32 = primitiveFactory('int32');
export const uint32 = primitiveFactory('uint32');
export const int64 = primitiveFactory('int64');
export const uint64 = primitiveFactory('uint64');
export const string = primitiveFactory('string');
export const wstring = primitiveFactory('wstring');

export function array<Schema extends RosSchema>(
  schema: Schema,
  length?: number,
): RosArraySchema<Schema> {
  return new RosArraySchema(schema, length);
}

export function message<Shape extends RosMessageShape>(
  type: string,
  shape: Shape,
): RosMessageSchema<Shape> {
  return new RosMessageSchema(type, shape);
}

export function service<
  RequestShape extends RosMessageShape,
  ResponseShape extends RosMessageShape,
>(
  type: string,
  shape: {
    request: RequestShape;
    response: ResponseShape;
  },
): RosServiceSchema<RequestShape, ResponseShape> {
  return {
    type,
    request: new RosMessageSchema(`${type}_Request`, shape.request),
    response: new RosMessageSchema(`${type}_Response`, shape.response),
  };
}

export function serialize<Schema extends RosMessageSchema>(
  schema: Schema,
  value: Infer<Schema>,
): Uint8Array {
  const writer = new CdrWriter();
  schema._write(writer, value);
  return writer.data;
}

export function deserialize<Schema extends RosMessageSchema>(
  schema: Schema,
  payload: ArrayBufferView,
): Infer<Schema> {
  const reader = new CdrReader(payload);
  return schema._read(reader) as Infer<Schema>;
}
