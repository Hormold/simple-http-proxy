/**
 * @fileoverview Tunnel management for WebSocket connections
 */

import crypto from "crypto";
import { safeEndHttpWith502 } from "./utils.js";

/** @type {Map<string, Tunnel>} Global tunnel registry */
const tunnels = new Map();

/**
 * @typedef {Object} Tunnel
 * @property {WebSocket} ws - WebSocket connection
 * @property {string} subdomain - Assigned subdomain
 * @property {Map<string, RequestState>} reqMap - Request ID to state mapping
 * @property {number} lastPongAt - Last pong timestamp
 * @property {NodeJS.Timeout|null} pingTimer - Ping interval timer
 */

/**
 * @typedef {Object} RequestState
 * @property {http.ServerResponse} res - HTTP response object
 * @property {boolean} resHeadersSent - Whether response headers were sent
 * @property {Buffer[]} resBodyQueue - Queued response body chunks
 * @property {boolean} resBackpressure - Whether response is under backpressure
 */

/**
 * Get tunnel registry (for external access)
 * @returns {Map<string, Tunnel>} Tunnel registry
 */
export function getTunnels() {
  return tunnels;
}

/**
 * Get active tunnel by subdomain
 * @param {string} subdomain - Subdomain to look up
 * @returns {Tunnel|null} Tunnel object or null if not found
 */
export function getTunnel(subdomain) {
  const tunnel = tunnels.get(subdomain);
  if (!tunnel || tunnel.ws.readyState !== tunnel.ws.OPEN) {
    return null;
  }
  return tunnel;
}

/**
 * Create a new tunnel
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} desired - Desired subdomain
 * @returns {Tunnel|null} Created tunnel or null if subdomain taken
 */
export function createTunnel(ws, desired) {
  if (tunnels.has(desired)) {
    return null;
  }

  const tunnel = {
    ws,
    subdomain: desired,
    reqMap: new Map(),
    lastPongAt: Date.now(),
    pingTimer: null
  };

  tunnels.set(desired, tunnel);
  return tunnel;
}

/**
 * Clean up tunnel and all associated resources
 * @param {string} subdomain - Subdomain to clean up
 * @param {string} reason - Reason for cleanup
 */
export function cleanupTunnel(subdomain, reason) {
  const tunnel = tunnels.get(subdomain);
  if (!tunnel) return;

  console.log(`[tunnel] Cleaning up tunnel ${subdomain}: ${reason}`);

  // Clear ping timer
  if (tunnel.pingTimer) {
    clearInterval(tunnel.pingTimer);
    tunnel.pingTimer = null;
  }

  // End all pending HTTP requests
  for (const [id, state] of tunnel.reqMap.entries()) {
    safeEndHttpWith502(state.res, `tunnel closed: ${reason}`);
  }

  // Clear request map
  tunnel.reqMap.clear();

  // Remove from registry
  tunnels.delete(subdomain);
}

/**
 * Register HTTP request with tunnel
 * @param {Tunnel} tunnel - Tunnel object
 * @param {string} id - Request ID
 * @param {http.ServerResponse} res - HTTP response object
 * @returns {RequestState} Request state object
 */
export function registerRequest(tunnel, id, res) {
  const state = {
    res,
    resHeadersSent: false,
    resBodyQueue: [],
    resBackpressure: false
  };

  tunnel.reqMap.set(id, state);
  return state;
}

/**
 * Unregister HTTP request from tunnel
 * @param {Tunnel} tunnel - Tunnel object
 * @param {string} id - Request ID
 */
export function unregisterRequest(tunnel, id) {
  tunnel.reqMap.delete(id);
}

/**
 * Get request state by ID
 * @param {Tunnel} tunnel - Tunnel object
 * @param {string} id - Request ID
 * @returns {RequestState|null} Request state or null
 */
export function getRequestState(tunnel, id) {
  return tunnel.reqMap.get(id) || null;
}

/**
 * Get all active subdomains
 * @returns {string[]} Array of active subdomains
 */
export function getActiveSubdomains() {
  return Array.from(tunnels.keys());
}

/**
 * Generate unique request ID
 * @returns {string} UUID v4
 */
export function generateRequestId() {
  return crypto.randomUUID();
}
