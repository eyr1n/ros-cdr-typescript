import { RosCdrClient } from '@eyr1n/ros-cdr-client';
import * as ros from '@eyr1n/ros-cdr-serialization';

const url = process.argv[2] ?? 'ws://127.0.0.1:9090';

const std_msgs_String = ros.message('std_msgs/msg/String', {
  data: ros.string(),
});

const ws = new WebSocket(url);
const client = new RosCdrClient(ws);

ws.onopen = async () => {
  const id = await client.createPublisher('/chatter', std_msgs_String.type, {});

  let count = 0;
  setInterval(() => {
    const message = ros.serialize(std_msgs_String, {
      data: `Hello World: ${count}`,
    });
    client.publish(id, message);
    console.log(`Publishing: "Hello World: ${count}"`);
    count++;
  }, 1000);

  process.once('SIGINT', () => {
    client.destroy(id);
    ws.close();
    process.exit();
  });
};

ws.onerror = () => {
  throw new Error(`failed to connect to ${url}`);
};
