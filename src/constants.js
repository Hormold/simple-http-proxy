/**
 * @fileoverview Constants used throughout the proxy server
 */

/** @type {number} Default server port */
export const DEFAULT_PORT = 8080;

/** @type {string} Default server host */
export const DEFAULT_HOST = "0.0.0.0";

/** @type {string} Default public domain */
export const DEFAULT_PUBLIC_DOMAIN = "aimodelproxy.com";

/** @type {string} Default WebSocket path */
export const DEFAULT_WS_PATH = "/_ws/tunnel";

/** @type {number} Maximum WebSocket buffer size before pausing request */
export const MAX_WS_BUFFER = 10 * 1024 * 1024;

/** @type {number} Buffer size to resume request after pause */
export const RESUME_WS_BUFFER = 1 * 1024 * 1024;

/** @type {number} Client ping interval in milliseconds */
export const CLIENT_PING_INTERVAL = 20000; // 20 seconds

/** @type {number} Client ping timeout in milliseconds */
export const CLIENT_PING_TIMEOUT = 300000; // 5 minutes (very generous)

/** @type {Set<string>} Hop-by-hop headers that should be filtered out */
export const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "upgrade",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "te",
  "trailer"
]);

/** @type {RegExp} Subdomain validation pattern */
export const SUBDOMAIN_PATTERN = /^[a-z0-9-]{3,63}$/;

/** @type {number} Subdomain random bytes length */
export const SUBDOMAIN_RANDOM_BYTES = 5;
