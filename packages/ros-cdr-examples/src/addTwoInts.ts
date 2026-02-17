import { RosCdrClient } from '@eyr1n/ros-cdr-client';
import * as ros from '@eyr1n/ros-cdr-serialization';

const url = process.argv[2] ?? 'ws://127.0.0.1:54321';

const AddTwoInts = ros.service('example_interfaces/srv/AddTwoInts', {
  request: {
    a: ros.int64(),
    b: ros.int64(),
  },
  response: {
    sum: ros.int64(),
  },
});

const ws = new WebSocket(url);
const client = new RosCdrClient(ws);

ws.onopen = async () => {
  const id = await client.createServiceClient(
    '/add_two_ints',
    AddTwoInts.type,
    {},
  );
  const request = ros.serialize(AddTwoInts.request, { a: 2n, b: 3n });
  const response = await client.callService(id, request);
  const deserialized = ros.deserialize(AddTwoInts.response, response);
  console.log(`Result of add_two_ints: ${deserialized.sum}`);
  client.destroy(id);
  ws.close();
};

ws.onerror = () => {
  throw new Error(`failed to connect to ${url}`);
};
