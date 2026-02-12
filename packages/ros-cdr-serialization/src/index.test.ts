import { describe, expect, expectTypeOf, it } from 'vitest';
import * as ros from './index.js';

describe('std_msgs/msg/UInt32', () => {
  const UInt32 = ros.message('std_msgs/msg/UInt32', {
    data: ros.uint32(),
  });

  it('reads from raw binary payload', () => {
    const rawPayload = Uint8Array.from([
      0x00, 0x01, 0x00, 0x00, 0xd2, 0x04, 0x00, 0x00,
    ]);
    expect(ros.deserialize(UInt32, rawPayload)).toEqual({ data: 1234 });
  });

  it('serializes and deserializes', () => {
    const payload = ros.serialize(UInt32, { data: 1234 });
    const output = ros.deserialize(UInt32, payload);
    expectTypeOf(output).toEqualTypeOf<{ data: number }>();
    expect(output).toEqual({ data: 1234 });
  });
});

describe('std_msgs/msg/String', () => {
  const StringMessage = ros.message('std_msgs/msg/String', {
    data: ros.string(),
  });

  it('reads from raw binary payload', () => {
    const rawPayload = Uint8Array.from([
      0x00, 0x01, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x68, 0x65, 0x6c, 0x6c,
      0x6f, 0x00,
    ]);
    expect(ros.deserialize(StringMessage, rawPayload)).toEqual({
      data: 'hello',
    });
  });

  it('serializes and deserializes', () => {
    const payload = ros.serialize(StringMessage, { data: 'hello' });
    const output = ros.deserialize(StringMessage, payload);
    expectTypeOf(output).toEqualTypeOf<{ data: string }>();
    expect(output).toEqual({ data: 'hello' });
  });
});

describe('geometry_msgs/msg/Quaternion', () => {
  const Quaternion = ros.message('geometry_msgs/msg/Quaternion', {
    x: ros.float64(),
    y: ros.float64(),
    z: ros.float64(),
    w: ros.float64(),
  });

  it('reads from raw binary payload', () => {
    const rawPayload = Uint8Array.from([
      0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe0, 0x3f, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xe0, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x3f,
    ]);
    expect(ros.deserialize(Quaternion, rawPayload)).toEqual({
      x: 0,
      y: 0.5,
      z: -0.5,
      w: 1,
    });
  });

  it('serializes and deserializes', () => {
    const input = { x: 0, y: 0.5, z: -0.5, w: 1 };
    const payload = ros.serialize(Quaternion, input);
    const output = ros.deserialize(Quaternion, payload);
    expectTypeOf(output).toEqualTypeOf<{
      x: number;
      y: number;
      z: number;
      w: number;
    }>();
    expect(output).toEqual(input);
  });
});

describe('empty message', () => {
  const Empty = ros.message('std_srvs/srv/Empty_Request', {});

  it('reads from raw binary payload', () => {
    const rawPayload = Uint8Array.from([0x00, 0x01, 0x00, 0x00, 0x00]);
    expect(ros.deserialize(Empty, rawPayload)).toEqual({});
  });

  it('serializes and deserializes', () => {
    const payload = ros.serialize(Empty, {});
    expect(ros.deserialize(Empty, payload)).toEqual({});
  });
});
