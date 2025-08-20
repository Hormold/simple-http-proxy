/**
 * @fileoverview Data validation utilities
 */

import { SUBDOMAIN_PATTERN } from "./constants.js";

/**
 * Validate subdomain format
 * @param {string} subdomain - Subdomain to validate
 * @returns {ValidationResult} Validation result
 */
export function validateSubdomain(subdomain) {
  const errors = [];

  if (typeof subdomain !== "string") {
    errors.push("Subdomain must be a string");
    return { valid: false, errors };
  }

  if (!subdomain.trim()) {
    errors.push("Subdomain cannot be empty");
  }

  if (subdomain.length < 3) {
    errors.push("Subdomain must be at least 3 characters long");
  }

  if (subdomain.length > 63) {
    errors.push("Subdomain cannot exceed 63 characters");
  }

  if (!SUBDOMAIN_PATTERN.test(subdomain)) {
    errors.push("Subdomain can only contain lowercase letters, numbers, and hyphens");
  }

  // Cannot start or end with hyphen
  if (subdomain.startsWith("-") || subdomain.endsWith("-")) {
    errors.push("Subdomain cannot start or end with a hyphen");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate WebSocket message
 * @param {any} message - Message to validate
 * @returns {ValidationResult} Validation result
 */
export function validateWebSocketMessage(message) {
  const errors = [];

  if (!message || typeof message !== "object") {
    errors.push("Message must be an object");
    return { valid: false, errors };
  }

  if (!message.type || typeof message.type !== "string") {
    errors.push("Message must have a valid type");
  }

  if (message.id && typeof message.id !== "string") {
    errors.push("Message ID must be a string");
  }

  if (message.method && typeof message.method !== "string") {
    errors.push("HTTP method must be a string");
  }

  if (message.path && typeof message.path !== "string") {
    errors.push("Request path must be a string");
  }

  if (message.status !== undefined && typeof message.status !== "number") {
    errors.push("Response status must be a number");
  }

  if (message.headers !== undefined && typeof message.headers !== "object") {
    errors.push("Headers must be an object");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate HTTP headers
 * @param {Object} headers - Headers to validate
 * @returns {ValidationResult} Validation result
 */
export function validateHeaders(headers) {
  const errors = [];

  if (!headers || typeof headers !== "object") {
    errors.push("Headers must be an object");
    return { valid: false, errors };
  }

  // Check for suspicious header values
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== "string") {
      errors.push("Header keys must be strings");
    }

    if (value !== null && value !== undefined && typeof value !== "string" && !Array.isArray(value)) {
      errors.push(`Header '${key}' value must be string, array, or null`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate environment configuration
 * @returns {ValidationResult} Validation result
 */
export function validateEnvironmentConfig() {
  const errors = [];

  const port = process.env.PORT;
  if (port && (isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535)) {
    errors.push("PORT must be a valid port number (1-65535)");
  }

  const host = process.env.HOST;
  if (host && typeof host !== "string") {
    errors.push("HOST must be a string");
  }

  const publicDomain = process.env.PUBLIC_DOMAIN;
  if (publicDomain && typeof publicDomain !== "string") {
    errors.push("PUBLIC_DOMAIN must be a string");
  }

  const wsPath = process.env.WS_PATH;
  if (wsPath && !wsPath.startsWith("/")) {
    errors.push("WS_PATH must start with '/'");
  }

  // Validate TLS files if provided
  const keyPath = process.env.TLS_KEY_PATH;
  const certPath = process.env.TLS_CERT_PATH;

  if ((keyPath && !certPath) || (!keyPath && certPath)) {
    errors.push("Both TLS_KEY_PATH and TLS_CERT_PATH must be provided together");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize string input
 * @param {string} input - Input to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized string
 */
export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== "string") {
    return "";
  }

  // Remove null bytes and other control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F-\x9F]/g, "");

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}
