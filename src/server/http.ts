// 该文件把 MiniHarness 实例适配为 HTTP JSON 与 SSE 服务入口。
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { MiniHarnessInstance } from '../app/create-harness';
import type { EngineEvent } from '../runtime/events';

export type MiniHarnessFetchHandler = (request: Request) => Promise<Response>;

export interface MiniHarnessRunRequest {
  input: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

export interface MiniHarnessHttpServerOptions {
  basePath?: string;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function parseRunRequest(request: Request): Promise<MiniHarnessRunRequest> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new Error('Request body must be valid JSON');
  }

  if (!isRecord(body)) {
    throw new Error('Request body must be a JSON object');
  }

  if (typeof body.input !== 'string' || body.input.trim().length === 0) {
    throw new Error('input must be a non-empty string');
  }

  if (typeof body.sessionId !== 'string' || body.sessionId.trim().length === 0) {
    throw new Error('sessionId must be a non-empty string');
  }

  if (body.metadata !== undefined && !isRecord(body.metadata)) {
    throw new Error('metadata must be an object when provided');
  }

  return {
    input: body.input,
    sessionId: body.sessionId,
    metadata: body.metadata,
  };
}

function formatSseEvent(event: EngineEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function createSseStream(
  harness: MiniHarnessInstance,
  input: MiniHarnessRunRequest,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of harness.engine.runEvents(
          input.input,
          input.sessionId,
          { metadata: input.metadata },
        )) {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        }
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              error: {
                code: 'RUN_FAILED',
                message: error instanceof Error ? error.message : String(error),
              },
            })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });
}

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath || basePath === '/') {
    return '';
  }

  return basePath.startsWith('/') ? basePath.replace(/\/$/, '') : `/${basePath}`;
}

function stripBasePath(pathname: string, basePath: string): string | undefined {
  if (!basePath) {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }

  return undefined;
}

/** 创建可直接测试的 fetch-style HTTP handler。 */
export function createMiniHarnessFetchHandler(
  harness: MiniHarnessInstance,
  options: MiniHarnessHttpServerOptions = {},
): MiniHarnessFetchHandler {
  const basePath = normalizeBasePath(options.basePath);

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = stripBasePath(url.pathname, basePath);

    if (!path) {
      return errorResponse(404, 'NOT_FOUND', 'Route not found');
    }

    if (request.method === 'GET' && path === '/healthz') {
      return jsonResponse({
        status: 'ok',
        environment: harness.config.production.environment,
        timestamp: Date.now(),
      });
    }

    if (request.method === 'GET' && path === '/readyz') {
      return jsonResponse({
        status: 'ready',
        environment: harness.config.production.environment,
        provider: harness.model.name,
        memory: {
          type: harness.config.memory.type,
        },
        tools: {
          registered: harness.tools.list().length,
        },
        metrics: {
          enabled: Boolean(harness.metrics),
        },
      });
    }

    if (request.method === 'GET' && path === '/metrics') {
      if (!harness.metrics) {
        return jsonResponse({
          status: 'disabled',
        });
      }

      return jsonResponse(harness.metrics.snapshot());
    }

    if (request.method === 'POST' && path === '/v1/runs') {
      let input: MiniHarnessRunRequest;
      try {
        input = await parseRunRequest(request);
      } catch (error) {
        return errorResponse(
          400,
          'INVALID_REQUEST',
          error instanceof Error ? error.message : String(error),
        );
      }

      const message = await harness.engine.run(input.input, input.sessionId);
      return jsonResponse({
        sessionId: input.sessionId,
        message,
      });
    }

    if (request.method === 'POST' && path === '/v1/runs/stream') {
      let input: MiniHarnessRunRequest;
      try {
        input = await parseRunRequest(request);
      } catch (error) {
        return errorResponse(
          400,
          'INVALID_REQUEST',
          error instanceof Error ? error.message : String(error),
        );
      }

      return new Response(createSseStream(harness, input), {
        headers: {
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'content-type': 'text/event-stream; charset=utf-8',
        },
      });
    }

    return errorResponse(404, 'NOT_FOUND', 'Route not found');
  };
}

function collectIncomingBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const host = request.headers.host ?? 'localhost';
  const url = `http://${host}${request.url ?? '/'}`;
  const method = request.method ?? 'GET';
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : (await collectIncomingBody(request)).toString('utf8');

  return new Request(url, {
    method,
    headers: request.headers as Record<string, string>,
    body,
  });
}

async function writeNodeResponse(
  response: Response,
  nodeResponse: ServerResponse,
): Promise<void> {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });
  nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

/** 创建 Node HTTP server，供生产入口或 CLI 包装后监听端口。 */
export function createMiniHarnessHttpServer(
  harness: MiniHarnessInstance,
  options: MiniHarnessHttpServerOptions = {},
) {
  const handle = createMiniHarnessFetchHandler(harness, options);

  return createServer(async (request, response) => {
    try {
      await writeNodeResponse(await handle(await toWebRequest(request)), response);
    } catch (error) {
      await writeNodeResponse(
        errorResponse(
          500,
          'INTERNAL_ERROR',
          error instanceof Error ? error.message : String(error),
        ),
        response,
      );
    }
  });
}
