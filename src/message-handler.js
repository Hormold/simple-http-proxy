/**
 * @fileoverview WebSocket message handler for client communication
 */

import { getTunnel, getRequestState, unregisterRequest } from "./tunnel.js";
import { safeEndHttpWith502 } from "./utils.js";
import { sanitizeResponseHeaders } from "./utils.js";

/**
 * Handle message from WebSocket client
 * @param {Object} msg - Parsed message object
 * @param {string} subdomain - Client subdomain
 */
export function handleClientMessage(msg, subdomain) {
  const { type, id } = msg || {};

  if (!type) {
    console.warn(`[tunnel] Received message without type from ${subdomain}`);
    return;
  }

  const tunnel = getTunnel(subdomain);
  if (!tunnel) {
    console.warn(`[tunnel] Received message for unknown tunnel: ${subdomain}`);
    return;
  }

  switch (type) {
    case "req":
      handleRequest(msg, tunnel, id);
      break;

    case "reqBody":
      handleRequestBody(msg, tunnel, id);
      break;

    case "reqEnd":
      handleRequestEnd(tunnel, id);
      break;

    case "reqAbort":
      handleRequestAbort(tunnel, id);
      break;

    case "res":
      handleResponse(msg, tunnel, id);
      break;

    case "resBody":
      handleResponseBody(msg, tunnel, id);
      break;

    case "resEnd":
      handleResponseEnd(tunnel, id);
      break;

    case "resAbort":
      handleResponseAbort(tunnel, id);
      break;

    case "log":
      handleLogMessage(msg, subdomain);
      break;

    default:
      console.warn(`[tunnel] Unknown message type '${type}' from ${subdomain}`);
  }
}

/**
 * Handle HTTP response message
 * @param {Object} msg - Response message
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleResponse(msg, tunnel, id) {
  const state = getRequestState(tunnel, id);
  if (!state || state.resHeadersSent) return;

  try {
    const headers = sanitizeResponseHeaders(msg.headers || {});
    state.res.writeHead(Number(msg.status || 200), headers);
    state.resHeadersSent = true;
  } catch (error) {
    console.error(`[tunnel] Failed to write response headers for ${id}:`, error.message);
    safeEndHttpWith502(state.res, "bad response headers");
    unregisterRequest(tunnel, id);
  }
}

/**
 * Handle response body chunk
 * @param {Object} msg - Response body message
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleResponseBody(msg, tunnel, id) {
  const state = getRequestState(tunnel, id);
  if (!state || !state.resHeadersSent) return;

  const chunk = Buffer.from(msg.chunk || "", "base64");
  if (!chunk.length) return;

  if (state.resBackpressure) {
    // Queue chunk for later sending
    state.resBodyQueue.push(chunk);
    return;
  }

  const ok = state.res.write(chunk);
  if (!ok) {
    // Response stream is full, enable backpressure
    state.resBackpressure = true;
    state.resBodyQueue.push(Buffer.alloc(0)); // Ensure at least one tick for fairness

    state.res.once("drain", () => {
      flushQueuedBody(state);
    });
  }
}

/**
 * Handle response end message
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleResponseEnd(tunnel, id) {
  const state = getRequestState(tunnel, id);
  if (!state) return;

  // Flush any remaining queued body chunks
  flushQueuedBody(state);

  // End the response
  if (!state.res.writableEnded) {
    state.res.end();
  }

  unregisterRequest(tunnel, id);
}

/**
 * Handle response abort message
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleResponseAbort(tunnel, id) {
  const state = getRequestState(tunnel, id);
  if (!state) return;

  if (!state.res.writableEnded) {
    state.res.destroy(new Error("aborted by client"));
  }

  unregisterRequest(tunnel, id);
}

/**
 * Handle log message from client
 * @param {Object} msg - Log message
 * @param {string} subdomain - Client subdomain
 */
function handleLogMessage(msg, subdomain) {
  // Optional logging from client - could be useful for debugging
  if (msg.level && msg.message) {
    console.log(`[client:${subdomain}] ${msg.level.toUpperCase()}: ${msg.message}`);
  }
}

/**
 * Flush queued response body chunks
 * @param {Object} state - Request state object
 */
function flushQueuedBody(state) {
  if (!state) return;

  while (state.resBodyQueue.length) {
    const chunk = state.resBodyQueue.shift();
    if (!chunk || chunk.length === 0) continue; // Skip empty chunks

    const ok = state.res.write(chunk);
    if (!ok) {
      // Still under backpressure, re-queue remaining chunks
      state.resBackpressure = true;
      state.res.once("drain", () => flushQueuedBody(state));
      return;
    }
  }

  state.resBackpressure = false;
}
