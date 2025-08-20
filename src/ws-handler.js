/**
 * @fileoverview WebSocket connection handler for tunnel management
 */

import { URL } from "url";
import { isValidSubdomain, randSubdomain, safeSend } from "./utils.js";
import { validateSubdomain } from "./validation.js";
import { createTunnel, cleanupTunnel, getTunnels } from "./tunnel.js";
import { handleClientMessage } from "./message-handler.js";
import { CLIENT_PING_INTERVAL, CLIENT_PING_TIMEOUT } from "./constants.js";

/**
 * Handle WebSocket upgrade and connection
 * @param {http.IncomingMessage} req - HTTP request object
 * @param {net.Socket} socket - Network socket
 * @param {Buffer} head - Upgrade head buffer
 * @param {WebSocket} ws - WebSocket instance
 */
export function handleWsConnection(req, socket, head, ws) {
  try {
    // Validate request parameters
    if (!req || !req.url || !req.headers) {
      console.error("[tunnel] Invalid request object in WebSocket upgrade");
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const wsPath = process.env.WS_PATH || "/_ws/tunnel";

    if (urlObj.pathname !== wsPath) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    // Parse and validate subdomain from query parameter
    const reqSub = (urlObj.searchParams.get("subdomain") || "").toLowerCase().trim();
    let desired = reqSub && isValidSubdomain(reqSub) ? reqSub : randSubdomain();

    // Additional validation
    const subdomainValidation = validateSubdomain(desired);
    if (!subdomainValidation.valid) {
      console.error(`[tunnel] Invalid subdomain '${desired}':`, subdomainValidation.errors);
      ws.close(1003, `Invalid subdomain: ${subdomainValidation.errors.join(", ")}`);
      return;
    }

    // Check if subdomain is already in use
    if (createTunnel(ws, desired) === null) {
      ws.close(1013, "subdomain already in use");
      return;
    }

    console.log(`[tunnel] New tunnel created: ${desired}`);

    // Set up WebSocket event handlers
    setupWsEventHandlers(ws, desired);

    // Start keepalive mechanism
    startKeepalive(ws, desired);

    // Announce ready state
    announceReady(ws, desired);

  } catch (error) {
    console.error("[tunnel] Error handling WebSocket connection:", error.message);
    try {
      ws.close(1011, "Internal server error");
    } catch (closeError) {
      console.error("[tunnel] Error closing WebSocket:", closeError.message);
    }
  }
}

/**
 * Set up WebSocket event handlers
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} subdomain - Assigned subdomain
 */
function setupWsEventHandlers(ws, subdomain) {
  ws.on("close", () => {
    cleanupTunnel(subdomain, "client disconnected");
  });

  ws.on("error", (error) => {
    console.error(`[tunnel] WebSocket error for ${subdomain}:`, error.message);
    cleanupTunnel(subdomain, "client error");
  });

  ws.on("pong", () => {
    // This will be handled by the tunnel object
  });

  ws.on("message", (data, isBinary) => {
    handleWsMessage(ws, data, isBinary, subdomain);
  });
}

/**
 * Handle WebSocket message
 * @param {WebSocket} ws - WebSocket connection
 * @param {Buffer|string} data - Message data
 * @param {boolean} isBinary - Whether data is binary
 * @param {string} subdomain - Subdomain identifier
 */
function handleWsMessage(ws, data, isBinary, subdomain) {
  try {
    const msg = isBinary
      ? JSON.parse(Buffer.from(data).toString("utf8"))
      : JSON.parse(data.toString());

    handleClientMessage(msg, subdomain);
  } catch (error) {
    console.error(`[tunnel] Failed to parse message from ${subdomain}:`, error.message);
    // Invalid message, ignore silently
  }
}

/**
 * Start keepalive mechanism for tunnel
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} subdomain - Subdomain identifier
 */
function startKeepalive(ws, subdomain) {

  const pingTimer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      clearInterval(pingTimer);
      return;
    }

    const tunnels = getTunnels();
    const tunnel = tunnels.get(subdomain);
    if (!tunnel) {
      clearInterval(pingTimer);
      return;
    }

    // Check for ping timeout
    if (Date.now() - tunnel.lastPongAt > CLIENT_PING_TIMEOUT) {
      ws.terminate();
      cleanupTunnel(subdomain, "ping timeout");
      clearInterval(pingTimer);
      return;
    }

    // Send ping
    try {
      ws.ping();
    } catch (error) {
      console.error(`[tunnel] Failed to ping ${subdomain}:`, error.message);
    }
  }, CLIENT_PING_INTERVAL);

  // Store timer reference for cleanup
  const tunnels = getTunnels();
  const tunnel = tunnels.get(subdomain);
  if (tunnel) {
    tunnel.pingTimer = pingTimer;
  }
}

/**
 * Announce tunnel ready state to client
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} subdomain - Assigned subdomain
 */
function announceReady(ws, subdomain) {
  const protocol = (process.env.TLS_KEY_PATH && process.env.TLS_CERT_PATH) ? "https" : "http";
  const publicDomain = process.env.PUBLIC_DOMAIN || "aimodelproxy.com";

  safeSend(ws, {
    type: "ready",
    subdomain: subdomain,
    url: `${protocol}://${subdomain}.${publicDomain}`
  });
}
