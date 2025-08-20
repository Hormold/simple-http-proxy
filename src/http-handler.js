/**
 * @fileoverview HTTP request handler for the proxy server
 */

import { filterHeaders, safeSend } from "./utils.js";
import { getTunnel, registerRequest, unregisterRequest, generateRequestId, getActiveSubdomains } from "./tunnel.js";
import { MAX_WS_BUFFER, RESUME_WS_BUFFER } from "./constants.js";

/**
 * Handle incoming HTTP requests
 * @param {http.IncomingMessage} req - HTTP request object
 * @param {http.ServerResponse} res - HTTP response object
 */
export function handleHttpRequest(req, res) {
  const host = req.headers["host"] || "";
  const isHttps = req.socket.encrypted ? true : false;

  // Health check endpoint
  if (req.url && (req.url === "/api/status" || req.url === "/")) {
    handleStatusRequest(req, res);
    return;
  }

  // Extract subdomain from host
  const subdomain = extractSubdomainFromHost(host);
  if (!subdomain) {
    send404Response(res, "no tunnel matched; use subdomain." + process.env.PUBLIC_DOMAIN || "aimodelproxy.com");
    return;
  }

  // Get tunnel for subdomain
  const tunnel = getTunnel(subdomain);
  if (!tunnel) {
    send502Response(res, "tunnel offline");
    return;
  }

  // Register request with tunnel
  const id = generateRequestId();
  const state = registerRequest(tunnel, id, res);

  // Set up cleanup handlers
  res.on("close", () => {
    safeSend(tunnel.ws, { type: "reqAbort", id });
    unregisterRequest(tunnel, id);
  });

  res.on("error", () => {
    safeSend(tunnel.ws, { type: "reqAbort", id });
    unregisterRequest(tunnel, id);
  });

  // Send initial request metadata to client
  const firstMsg = {
    type: "req",
    id,
    method: req.method,
    path: req.url,
    httpVersion: req.httpVersion,
    headers: filterHeaders(req.headers, isHttps, host, req.socket)
  };

  if (!safeSend(tunnel.ws, firstMsg)) {
    send502Response(res, "failed to send request to tunnel");
    unregisterRequest(tunnel, id);
    return;
  }

  // Handle request body streaming
  handleRequestBody(req, tunnel, id);
}

/**
 * Handle status/health check requests
 * @param {http.IncomingMessage} req - HTTP request object
 * @param {http.ServerResponse} res - HTTP response object
 */
function handleStatusRequest(req, res) {

  const body = JSON.stringify({
    ok: true,
    domain: process.env.PUBLIC_DOMAIN || "aimodelproxy.com",
    wsPath: process.env.WS_PATH || "/_ws/tunnel",
    activeTunnels: getActiveSubdomains()
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(body);
}

/**
 * Extract subdomain from host header
 * @param {string} host - Host header value
 * @returns {string|null} Extracted subdomain or null
 */
function extractSubdomainFromHost(host) {
  if (!host) return null;

  const bare = host.split(":")[0].toLowerCase();
  const publicDomain = (process.env.PUBLIC_DOMAIN || "aimodelproxy.com").toLowerCase();
  const suffix = "." + publicDomain;

  if (bare === publicDomain) return null;
  if (!bare.endsWith(suffix)) return null;

  return bare.slice(0, -suffix.length);
}

/**
 * Handle streaming request body to WebSocket
 * @param {http.IncomingMessage} req - HTTP request object
 * @param {Object} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
function handleRequestBody(req, tunnel, id) {

  let pausedForWsBuffer = false;

  const maybePause = () => {
    if (!pausedForWsBuffer && tunnel.ws.bufferedAmount > MAX_WS_BUFFER) {
      pausedForWsBuffer = true;
      req.pause();

      const iv = setInterval(() => {
        if (tunnel.ws.readyState !== tunnel.ws.OPEN) {
          clearInterval(iv);
          return;
        }

        if (tunnel.ws.bufferedAmount <= RESUME_WS_BUFFER) {
          clearInterval(iv);
          pausedForWsBuffer = false;
          req.resume();
        }
      }, 25);
    }
  };

  req.on("data", (chunk) => {
    maybePause();
    safeSend(tunnel.ws, {
      type: "reqBody",
      id,
      chunk: chunk.toString("base64")
    });
  });

  req.on("end", () => {
    safeSend(tunnel.ws, { type: "reqEnd", id });
  });
}

/**
 * Send 404 response
 * @param {http.ServerResponse} res - HTTP response object
 * @param {string} message - Error message
 */
function send404Response(res, message) {
  res.writeHead(404, { "content-type": "text/plain" });
  res.end(message);
}

/**
 * Send 502 response
 * @param {http.ServerResponse} res - HTTP response object
 * @param {string} message - Error message
 */
function send502Response(res, message) {
  res.writeHead(502, { "content-type": "text/plain" });
  res.end(message);
}
