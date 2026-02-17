import type { MessageDefinitionField } from '@foxglove/message-definition';
import type { MessageDefinition, ServiceDefinition } from './parse.js';

class Context {
  #indent: number;
  #indentStep: number;

  constructor(indent: number, indentStep: number) {
    this.#indent = indent;
    this.#indentStep = indentStep;
  }

  inc() {
    this.#indent += this.#indentStep;
  }

  dec() {
    this.#indent -= this.#indentStep;
  }

  fmt(value: string) {
    return `${' '.repeat(this.#indent)}${value}`;
  }
}

function isComplex(field: MessageDefinitionField): boolean {
  return (
    field.isComplex === true ||
    field.type === 'time' ||
    field.type === 'duration'
  );
}

function normalizeComplex(pkg: string, field: MessageDefinitionField): string {
  if (field.type === 'time') {
    return 'builtin_interfaces/msg/Time';
  }
  if (field.type === 'duration') {
    return 'builtin_interfaces/msg/Duration';
  }
  const parts = field.type.split('/');
  if (parts.length === 1) {
    return `${pkg}/msg/${field.type}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}/msg/${parts[1]}`;
  }
  return field.type;
}

function* generateShape(
  ctx: Context,
  pkg: string,
  fields: MessageDefinitionField[],
) {
  for (const field of fields.filter((field) => !field.isConstant)) {
    if (isComplex(field)) {
      const parts = normalizeComplex(pkg, field).split('/');
      const schemaRef = `${parts[0]}.${parts[2]}`;
      if (field.isArray) {
        if (field.arrayLength != null) {
          yield ctx.fmt(
            `get ${field.name}() { return ros.array(${schemaRef}, ${field.arrayLength}); },`,
          );
        } else {
          yield ctx.fmt(
            `get ${field.name}() { return ros.array(${schemaRef}); },`,
          );
        }
      } else {
        yield ctx.fmt(`get ${field.name}() { return ${schemaRef}; },`);
      }
    } else {
      if (field.isArray) {
        if (field.arrayLength != null) {
          yield ctx.fmt(
            `${field.name}: ros.array(ros.${field.type}(), ${field.arrayLength}),`,
          );
        } else {
          yield ctx.fmt(`${field.name}: ros.array(ros.${field.type}()),`);
        }
      } else {
        yield ctx.fmt(`${field.name}: ros.${field.type}(),`);
      }
    }
  }
}

function* generateMessage(
  ctx: Context,
  pkg: string,
  definition: MessageDefinition,
) {
  yield ctx.fmt(
    `export const ${definition.name} = ros.message('${pkg}/msg/${definition.name}', {`,
  );
  ctx.inc();
  yield* generateShape(ctx, pkg, definition.definition.definitions);
  ctx.dec();
  yield ctx.fmt(`});`);
  yield ctx.fmt(
    `export type ${definition.name} = ros.Infer<typeof ${definition.name}>;`,
  );
}

function* generateService(
  ctx: Context,
  pkg: string,
  definition: ServiceDefinition,
) {
  yield ctx.fmt(
    `export const ${definition.name} = ros.service('${pkg}/srv/${definition.name}', {`,
  );
  ctx.inc();
  yield ctx.fmt(`request: {`);
  ctx.inc();
  yield* generateShape(ctx, pkg, definition.requestDefinition.definitions);
  ctx.dec();
  yield ctx.fmt(`},`);
  yield ctx.fmt(`response: {`);
  ctx.inc();
  yield* generateShape(ctx, pkg, definition.responseDefinition.definitions);
  ctx.dec();
  yield ctx.fmt(`},`);
  ctx.dec();
  yield ctx.fmt(`});`);
  yield ctx.fmt(
    `export type ${definition.name}_Request = ros.Infer<typeof ${definition.name}.request>;`,
  );
  yield ctx.fmt(
    `export type ${definition.name}_Response = ros.Infer<typeof ${definition.name}.response>;`,
  );
}

export function* generatePackage(
  pkg: string,
  definitions: (MessageDefinition | ServiceDefinition)[],
) {
  const ctx = new Context(0, 2);
  yield ctx.fmt(`export namespace ${pkg} {`);
  ctx.inc();

  for (let i = 0; i < definitions.length; ++i) {
    const definition = definitions[i];
    switch (definition.type) {
      case 'msg':
        yield* generateMessage(ctx, pkg, definition);
        break;
      case 'srv':
        yield* generateService(ctx, pkg, definition);
        break;
    }
    if (i < definitions.length - 1) {
      yield ctx.fmt('');
    }
  }

  ctx.dec();
  yield ctx.fmt('}');
}
