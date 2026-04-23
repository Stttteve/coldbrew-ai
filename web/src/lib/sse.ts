/**
 * Small Server-Sent Events helper.
 *
 * Why SSE over WebSockets or a polling endpoint?
 *   - one-way server → client is all we need (token deltas, progress)
 *   - SSE survives serverless edges nicely; the connection is a plain HTTP
 *     response with `Content-Type: text/event-stream`
 *   - it's native in browsers via `EventSource`, no client library needed
 *
 * Frame format (per the SSE spec):
 *   data: <JSON>\n\n
 *
 * We prefix events with an optional `event:` line when we need named events.
 */

export type SseFrame = { event?: string; data: unknown };

export function sseResponse(
  iterable: AsyncIterable<SseFrame>,
  init?: ResponseInit,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const frame of iterable) {
          const lines: string[] = [];
          if (frame.event) lines.push(`event: ${frame.event}`);
          lines.push(`data: ${JSON.stringify(frame.data)}`);
          controller.enqueue(encoder.encode(lines.join("\n") + "\n\n"));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    ...init,
    headers: {
      ...init?.headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering if present
    },
  });
}
