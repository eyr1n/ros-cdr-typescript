import type { MessageDefinition as FoxgloveMessageDefinition } from '@foxglove/message-definition';
import { parse } from '@foxglove/rosmsg';
import type { File } from './collect.js';

export interface MessageDefinition {
  type: 'msg';
  name: string;
  definition: FoxgloveMessageDefinition;
}

export interface ServiceDefinition {
  type: 'srv';
  name: string;
  requestDefinition: FoxgloveMessageDefinition;
  responseDefinition: FoxgloveMessageDefinition;
}

function parseDefinition(content: string): FoxgloveMessageDefinition {
  return parse(content, {
    ros2: true,
    skipTypeFixup: true,
  })[0];
}

function parseMessageDefinition(file: File): MessageDefinition {
  return {
    type: 'msg',
    name: file.name,
    definition: parseDefinition(file.content),
  };
}

function parseServiceDefinition(file: File): ServiceDefinition {
  const [request, response] = file.content.split(/^---$/m);
  return {
    type: 'srv',
    name: file.name,
    requestDefinition: parseDefinition(request),
    responseDefinition: parseDefinition(response),
  };
}

export function parseInterfaceFile(
  file: File,
): MessageDefinition | ServiceDefinition {
  switch (file.type) {
    case 'msg':
      return parseMessageDefinition(file);
    case 'srv':
      return parseServiceDefinition(file);
  }
}
