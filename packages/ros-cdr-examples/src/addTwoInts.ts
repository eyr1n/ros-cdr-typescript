import { RosCdrClient } from '@eyr1n/ros-cdr-client';
import * as ros from '@eyr1n/ros-cdr-serialization';

const url = process.argv[2] ?? 'ws://127.0.0.1:9090';

const AddTwoIntsRequest = ros.message('example_interfaces/srv/AddTwoInts', {
  a: ros.int64(),
  b: ros.int64(),
});

const AddTwoIntsResponse = ros.message('example_interfaces/srv/AddTwoInts', {
  sum: ros.int64(),
});

const ws = new WebSocket(url);
const client = new RosCdrClient(ws);

ws.onopen = async () => {
  const id = await client.createServiceClient(
    '/add_two_ints',
    AddTwoIntsRequest.type,
  );
  const request = ros.serialize(AddTwoIntsRequest, { a: 2n, b: 3n });
  const response = await client.callService(id, 1, request);
  const deserialized = ros.deserialize(AddTwoIntsResponse, response);
  console.log(`Result of add_two_ints: ${deserialized.sum}`);
  client.destroy(id);
  ws.close();
};

ws.onerror = () => {
  throw new Error(`failed to connect to ${url}`);
};
