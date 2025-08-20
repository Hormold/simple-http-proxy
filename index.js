#!/usr/bin/env node

/**
 * @fileoverview Main entry point for the proxy server
 *
 * This is a reverse proxy server with WebSocket tunneling capabilities.
 * It allows exposing local development servers to the internet through
 * secure subdomain-based tunnels.
 *
 * Requirements: Node.js 18+
 * Optional: Set TLS_KEY_PATH and TLS_CERT_PATH env vars for HTTPS
 */

import { startServer } from "./src/server.js";

// Start the server
startServer();