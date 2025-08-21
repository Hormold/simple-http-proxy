/**
 * @fileoverview WebSocket message handler for client communication
 */

import { getTunnel, getRequestState, unregisterRequest } from "./tunnel.js";
import { safeEndHttpWith502 } from "./utils.js";
import { sanitizeResponseHeaders } from "./utils.js";
import http from "http";

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
 * Handle HTTP request message
 * @param {Object} msg - Request message
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleRequest(msg, tunnel, id) {
  const { method, path, httpVersion, headers } = msg;

  try {
    // For this tunnel-based proxy, we don't create HTTP requests ourselves.
    // Instead, we store the request information and wait for the client
    // to process it and send back a response through WebSocket messages.
    // The actual HTTP request handling should be done by the client application.

    console.log(`[tunnel] Received HTTP request ${id}: ${method} ${path}`);

    // Store request state for body handling
    if (!tunnel.activeRequests) tunnel.activeRequests = new Map();
    tunnel.activeRequests.set(id, {
      method,
      path,
      headers,
      bodyBuffer: [],
      bodySize: 0,
      startTime: Date.now()
    });

    // If this is a GET request with no body expected, we might want to
    // immediately process it or wait for client response
    // For now, we'll wait for the client to send a response

  } catch (error) {
    console.error(`[tunnel] Failed to handle HTTP request ${id}:`, error.message);
    const errorMsg = {
      type: "res",
      id,
      status: 500,
      headers: { "content-type": "text/plain" }
    };
    tunnel.ws.send(JSON.stringify(errorMsg));

    const bodyMsg = {
      type: "resBody",
      id,
      chunk: Buffer.from("Internal Server Error").toString('base64')
    };
    tunnel.ws.send(JSON.stringify(bodyMsg));

    const endMsg = { type: "resEnd", id };
    tunnel.ws.send(JSON.stringify(endMsg));
  }
}

/**
 * Handle request body chunk
 * @param {Object} msg - Request body message
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleRequestBody(msg, tunnel, id) {
  if (!tunnel.activeRequests) return;

  const state = tunnel.activeRequests.get(id);
  if (!state) return;

  try {
    const chunk = Buffer.from(msg.chunk || "", "base64");
    if (!chunk.length) return;

    // Buffer the chunk for later sending
    state.bodyBuffer.push(chunk);
    state.bodySize += chunk.length;

    // Prevent memory issues with very large requests
    if (state.bodySize > 50 * 1024 * 1024) { // 50MB limit
      console.warn(`[tunnel] Request body too large for ${id}, aborting`);
      state.req.destroy(new Error("Request body too large"));
      tunnel.activeRequests.delete(id);
      return;
    }
  } catch (error) {
    console.error(`[tunnel] Failed to process request body for ${id}:`, error.message);
    if (state.req) state.req.destroy(error);
    tunnel.activeRequests.delete(id);
  }
}

/**
 * Handle request end message
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleRequestEnd(tunnel, id) {
  if (!tunnel.activeRequests) return;

  const state = tunnel.activeRequests.get(id);
  if (!state) return;

  try {
    // Log request completion
    const duration = Date.now() - state.startTime;
    console.log(`[tunnel] HTTP request ${id} completed in ${duration}ms`);

    // Combine all body chunks for logging/debugging
    if (state.bodyBuffer.length > 0) {
      const fullBody = Buffer.concat(state.bodyBuffer);
      console.log(`[tunnel] Request ${id} body size: ${fullBody.length} bytes`);
    }

    // In a real implementation, you might want to process the request here
    // and send a response back through the tunnel

    // For now, just clean up
    tunnel.activeRequests.delete(id);

  } catch (error) {
    console.error(`[tunnel] Failed to end HTTP request for ${id}:`, error.message);
    tunnel.activeRequests.delete(id);
  }
}

/**
 * Handle request abort message
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleRequestAbort(tunnel, id) {
  if (!tunnel.activeRequests) return;

  const state = tunnel.activeRequests.get(id);
  if (!state) return;

  try {
    // Log request abortion
    const duration = Date.now() - state.startTime;
    console.log(`[tunnel] HTTP request ${id} aborted after ${duration}ms`);

    // Clean up
    tunnel.activeRequests.delete(id);

  } catch (error) {
    console.error(`[tunnel] Failed to abort HTTP request for ${id}:`, error.message);
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
