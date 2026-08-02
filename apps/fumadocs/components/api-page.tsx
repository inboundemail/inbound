'use client';

import {
  type CodeUsageGeneratorFn,
  createCodeUsageGeneratorRegistry,
} from 'fumadocs-openapi/requests/generators';
import { registerDefault } from 'fumadocs-openapi/requests/generators/all';
import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import sdkOperations from '../sdk-operations.json';

type RequestData = Parameters<CodeUsageGeneratorFn>[0];

const codeUsages = createCodeUsageGeneratorRegistry();
registerDefault(codeUsages);

function format(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? '{}';
}

function getQuery(data: RequestData): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(data.query).map(([key, value]) => [
      key,
      value.values.length === 1 ? value.values[0] : value.values,
    ]),
  );
}

function getArguments(data: RequestData): string[] {
  const args = Object.values(data.path).map((value) => format(value.value));
  if (data.body !== undefined) args.push(format(data.body));
  else if (Object.keys(data.query).length > 0)
    args.push(format(getQuery(data)));
  return args;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPath(template: string, pathname: string): boolean {
  const pattern = template
    .split('/')
    .map((segment) =>
      segment.startsWith('{') && segment.endsWith('}')
        ? '[^/]+'
        : escapePattern(segment),
    )
    .join('/');
  return new RegExp(`^${pattern}$`).test(pathname);
}

function findOperation(data: RequestData) {
  const pathname = new URL(data.url).pathname;
  return sdkOperations.find(
    (operation) =>
      operation.method === data.method.toUpperCase() &&
      matchesPath(operation.path, pathname),
  );
}

function toResendPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toResendPayload);
  if (typeof value !== 'object' || value === null) return value;

  const keyMap: Record<string, string> = {
    content_id: 'contentId',
    content_type: 'contentType',
    reply_to: 'replyTo',
    scheduled_at: 'scheduledAt',
  };

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      keyMap[key] ?? key,
      toResendPayload(item),
    ]),
  );
}

codeUsages.add('inbound-sdk', {
  label: 'Inbound SDK',
  lang: 'ts',
  generate(data) {
    const operation = findOperation(data);
    if (!operation) return '// This operation is not available in the SDK.';

    return `import { Inbound } from 'inboundemail'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

const result = await inbound.${operation.resource}.${operation.sdkMethod}(${getArguments(data).join(', ')})`;
  },
});

codeUsages.add('resend-compatible', {
  label: 'Resend compatible',
  lang: 'ts',
  generate(data) {
    return `import { Resend } from 'inboundemail'

const resend = new Resend(process.env.INBOUND_API_KEY!)

const { data, error } = await resend.emails.send(${format(
      toResendPayload(data.body),
    )})`;
  },
});

export const OpenAPIPage = createOpenAPIPage({
  codeUsages,
  playground: {
    enabled: false,
  },
  generateCodeSamples({ operation }) {
    if (operation.operationId === 'emails.send') return [];
    return [
      {
        id: 'resend-compatible',
        lang: 'ts',
        source: false,
      },
    ];
  },
});
