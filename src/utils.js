/**
 * @fileoverview Utility functions for the proxy server
 */

import crypto from "crypto";
import { HOP_BY_HOP_HEADERS, SUBDOMAIN_RANDOM_BYTES, DEFAULT_PUBLIC_DOMAIN } from "./constants.js";
import { validateHeaders, sanitizeString } from "./validation.js";

/**
 * Filter headers by removing hop-by-hop headers and adding forwarded headers
 * @param {Object} src - Source headers object
 * @param {boolean} isHttps - Whether the request is HTTPS
 * @param {string} hostHeader - Host header value
 * @param {net.Socket} [socket] - Network socket for IP detection
 * @returns {Object} Filtered headers
 */
export function filterHeaders(src, isHttps, hostHeader, socket = null) {
  if (!src || typeof src !== "object") {
    throw new Error("Source headers must be an object");
  }

  const headers = {};

  // Validate and copy non-empty, non-hop-by-hop headers
  for (const [k, v] of Object.entries(src)) {
    if (!v) continue;

    const key = sanitizeString(k, 256);
    const value = Array.isArray(v) ? v.map(val => sanitizeString(val, 8192)) : sanitizeString(v, 8192);

    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    headers[key] = value;
  }

  // Add forwarded headers
  const clientIp = getRemoteIp(src, socket);
  const xff = sanitizeString(src["x-forwarded-for"], 1024);
  headers["x-forwarded-for"] = xff ? `${xff}, ${clientIp}` : clientIp;
  headers["x-forwarded-proto"] = isHttps ? "https" : "http";
  headers["x-forwarded-host"] = sanitizeString(hostHeader || src["host"] || "", 256);
  headers["x-real-ip"] = clientIp;

  return headers;
}

/**
 * Get remote IP from request headers and socket
 * @param {Object} reqHeaders - Request headers
 * @param {net.Socket} [socket] - Network socket (if available)
 * @returns {string} Remote IP address
 */
export function getRemoteIp(reqHeaders, socket = null) {
  if (!reqHeaders || typeof reqHeaders !== "object") {
    return socket?.remoteAddress || "0.0.0.0";
  }

  // Priority order for IP detection (most trusted to least trusted):
  // 1. X-Real-IP (set by trusted proxies like nginx)
  // 2. X-Forwarded-For (first IP in the chain)
  // 3. X-Forwarded-Proto (protocol)
  // 4. Socket remote address (direct connection)

  // X-Real-IP is most trusted (set by reverse proxies)
  const xRealIp = sanitizeString(reqHeaders["x-real-ip"], 256);
  if (xRealIp && isValidIpAddress(xRealIp)) {
    return xRealIp;
  }

  // X-Forwarded-For contains comma-separated list of IPs
  const xForwardedFor = sanitizeString(reqHeaders["x-forwarded-for"], 512);
  if (xForwardedFor) {
    // Take the first IP in the chain (original client)
    const firstIp = xForwardedFor.split(',')[0]?.trim();
    if (firstIp && isValidIpAddress(firstIp)) {
      return firstIp;
    }
  }

  // X-Forwarded header (alternative format)
  const xForwarded = sanitizeString(reqHeaders["x-forwarded"], 512);
  if (xForwarded) {
    const forwardedParts = xForwarded.split(';');
    for (const part of forwardedParts) {
      if (part.toLowerCase().startsWith('for=')) {
        const ip = part.substring(4).trim();
        if (ip && isValidIpAddress(ip)) {
          return ip;
        }
      }
    }
  }

  // CF-Connecting-IP (Cloudflare)
  const cfConnectingIp = sanitizeString(reqHeaders["cf-connecting-ip"], 256);
  if (cfConnectingIp && isValidIpAddress(cfConnectingIp)) {
    return cfConnectingIp;
  }

  // True-Client-IP (Akamai, Azure)
  const trueClientIp = sanitizeString(reqHeaders["true-client-ip"], 256);
  if (trueClientIp && isValidIpAddress(trueClientIp)) {
    return trueClientIp;
  }

  // Fastly-Client-IP (Fastly CDN)
  const fastlyClientIp = sanitizeString(reqHeaders["fastly-client-ip"], 256);
  if (fastlyClientIp && isValidIpAddress(fastlyClientIp)) {
    return fastlyClientIp;
  }

  // Fallback to socket remote address
  if (socket?.remoteAddress && isValidIpAddress(socket.remoteAddress)) {
    return socket.remoteAddress;
  }

  return "0.0.0.0";
}

/**
 * Validate if string is a valid IP address (IPv4 or IPv6)
 * @param {string} ip - IP address to validate
 * @returns {boolean} Whether IP is valid
 */
function isValidIpAddress(ip) {
  if (!ip || typeof ip !== "string") {
    return false;
  }

  // Remove IPv6 brackets if present
  const cleanIp = ip.replace(/^\[|\]$/g, "");

  // IPv4 validation
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipv4Regex.test(cleanIp)) {
    return true;
  }

  // IPv6 validation (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
  if (ipv6Regex.test(cleanIp)) {
    return true;
  }

  return false;
}

/**
 * Generate a random subdomain
 * @returns {string} Random subdomain starting with 't'
 * @throws {Error} If crypto operation fails
 */
export function randSubdomain() {
  try {
    const randomBytes = crypto.randomBytes(SUBDOMAIN_RANDOM_BYTES);
    return "t" + randomBytes.toString("hex");
  } catch (error) {
    throw new Error(`Failed to generate random subdomain: ${error.message}`);
  }
}

/**
 * Extract subdomain from host header
 * @param {string} host - Host header value
 * @returns {string|null} Extracted subdomain or null if invalid
 */
export function extractSubdomain(host) {
  if (!host || typeof host !== "string") {
    return null;
  }

  const sanitizedHost = sanitizeString(host, 256);
  const bare = sanitizedHost.split(":")[0].toLowerCase();
  const suffix = "." + DEFAULT_PUBLIC_DOMAIN.toLowerCase();

  if (bare === DEFAULT_PUBLIC_DOMAIN.toLowerCase()) return null;
  if (!bare.endsWith(suffix)) return null;

  const subdomain = bare.slice(0, -suffix.length);

  // Validate extracted subdomain
  if (!subdomain || subdomain.length < 3) {
    return null;
  }

  return subdomain;
}

/**
 * Sanitize response headers by removing hop-by-hop headers
 * @param {Object} headers - Response headers
 * @returns {Object} Sanitized headers
 */
export function sanitizeResponseHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (HOP_BY_HOP_HEADERS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Safely send JSON message via WebSocket
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} obj - Object to send
 * @returns {boolean} Success status
 */
export function safeSend(ws, obj) {
  if (!ws || ws.readyState !== ws.OPEN) return false;

  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch (error) {
    console.error("[tunnel] Failed to send WebSocket message:", error.message);
    return false;
  }
}

/**
 * Safely end HTTP response with 502 error
 * @param {http.ServerResponse} res - HTTP response object
 * @param {string} msg - Error message
 */
export function safeEndHttpWith502(res, msg) {
  if (!res.headersSent) {
    try {
      res.writeHead(502, { "content-type": "text/plain" });
    } catch (error) {
      console.error("[tunnel] Failed to write error response headers:", error.message);
    }
  }

  try {
    res.end(msg || "bad gateway");
  } catch (error) {
    console.error("[tunnel] Failed to end error response:", error.message);
  }
}

/**
 * Validate subdomain format
 * @param {string} subdomain - Subdomain to validate
 * @returns {boolean} Whether subdomain is valid
 */
export function isValidSubdomain(subdomain) {
  if (typeof subdomain !== "string") {
    return false;
  }

  if (subdomain.length < 3 || subdomain.length > 63) {
    return false;
  }

  // Must contain only lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9-]+$/.test(subdomain)) {
    return false;
  }

  // Cannot start or end with hyphen
  if (subdomain.startsWith("-") || subdomain.endsWith("-")) {
    return false;
  }

  return true;
}
