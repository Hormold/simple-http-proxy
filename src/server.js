#!/usr/bin/env node

/**
 * @fileoverview Main proxy server entry point
 */

import http from "http";
import https from "https";
import fs from "fs";
import { WebSocketServer } from "ws";
import { handleHttpRequest } from "./http-handler.js";
import { handleWsConnection } from "./ws-handler.js";
import {
  DEFAULT_PORT,
  DEFAULT_HOST,
  DEFAULT_PUBLIC_DOMAIN,
  DEFAULT_WS_PATH
} from "./constants.js";

/**
 * Create HTTP or HTTPS server based on TLS configuration
 * @returns {http.Server|https.Server} Server instance
 */
function makeServer() {
  const keyPath = process.env.TLS_KEY_PATH;
  const certPath = process.env.TLS_CERT_PATH;

  if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const creds = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    return https.createServer(creds, handleHttpRequest);
  }

  return http.createServer(handleHttpRequest);
}

/**
 * Start the proxy server
 */
function startServer() {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const host = process.env.HOST || DEFAULT_HOST;
  const publicDomain = process.env.PUBLIC_DOMAIN || DEFAULT_PUBLIC_DOMAIN;
  const wsPath = process.env.WS_PATH || DEFAULT_WS_PATH;

  const server = makeServer();

  // Attach WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleWsConnection(req, socket, head, ws);
    });
  });

  // Start listening
  server.listen(port, host, () => {
    console.log(`[tunnel] Listening on ${host}:${port}`);
    console.log(`[tunnel] Domain: ${publicDomain}`);
    console.log(`[tunnel] WebSocket path: ${wsPath}`);
  });

  // Graceful shutdown handling
  process.on("SIGINT", () => {
    console.log("[tunnel] Received SIGINT, shutting down...");
    server.close(() => {
      console.log("[tunnel] Server closed");
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    console.log("[tunnel] Received SIGTERM, shutting down...");
    server.close(() => {
      console.log("[tunnel] Server closed");
      process.exit(0);
    });
  });
}

// Start server if this module is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { startServer };
