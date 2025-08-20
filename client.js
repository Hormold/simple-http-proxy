#!/usr/bin/env node

/**
 * @fileoverview Simple WebSocket tunnel client for exposing local servers
 *
 * Usage:
 *   node client.js [tunnel-server] [local-port] [subdomain]
 *
 * Examples:
 *   node client.js localhost:8080 3000
 *   node client.js myapp 3000
 *   node client.js example.com:8080 3000 myapp
 *
 * Environment variables:
 *   TUNNEL_HOST - Tunnel server host (default: localhost)
 *   TUNNEL_PORT - Tunnel server port (default: 8080)
 *   WS_PATH - WebSocket path (default: /_ws/tunnel)
 */

import WebSocket from 'ws';
import http from 'http';

// Configuration
const DEFAULT_SUBDOMAIN = 'tunnel' + Math.random().toString(36).substr(2, 8);
const DEFAULT_LOCAL_PORT = 3000;
const DEFAULT_TUNNEL_HOST = process.env.TUNNEL_HOST || 'localhost';
const DEFAULT_TUNNEL_PORT = process.env.TUNNEL_PORT || 80;
const WS_PATH = process.env.WS_PATH || '/_ws/tunnel';

/**
 * Parse command line arguments
 * @returns {Object} Parsed configuration
 */
function parseArguments() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    process.exit(1);
  }

  // Handle different argument patterns
  let tunnelServer, localPort, subdomain;

  if (args.length === 1) {
    // node client.js 3000
    tunnelServer = `${DEFAULT_TUNNEL_HOST}:${DEFAULT_TUNNEL_PORT}`;
    localPort = parseInt(args[0]);
    subdomain = DEFAULT_SUBDOMAIN;
  } else if (args.length === 2) {
    // node client.js localhost:8080 3000
    // or node client.js myapp 3000
    if (args[0].includes(':')) {
      tunnelServer = args[0];
      localPort = parseInt(args[1]);
      subdomain = DEFAULT_SUBDOMAIN;
    } else {
      tunnelServer = `${DEFAULT_TUNNEL_HOST}:${DEFAULT_TUNNEL_PORT}`;
      subdomain = args[0];
      localPort = parseInt(args[1]);
    }
  } else if (args.length === 3) {
    // node client.js localhost:8080 3000 myapp
    tunnelServer = args[0];
    localPort = parseInt(args[1]);
    subdomain = args[2];
  } else {
    showUsage();
    process.exit(1);
  }

  // Validate local port
  if (isNaN(localPort) || localPort < 1 || localPort > 65535) {
    console.error('❌ Invalid local port. Must be a number between 1 and 65535.');
    process.exit(1);
  }

  // Parse tunnel server
  let tunnelHost, tunnelPort, useTLS;
  if (tunnelServer.includes(':')) {
    [tunnelHost, tunnelPort] = tunnelServer.split(':');
    tunnelPort = parseInt(tunnelPort);
    useTLS = tunnelPort === 443; // Assume HTTPS if port 443
  } else {
    tunnelHost = tunnelServer;
    // Auto-detect common ports
    if (tunnelHost.includes('aimodelproxy.com') || tunnelHost.includes('remote') || tunnelHost.includes('production')) {
      tunnelPort = 443; // Production servers likely use HTTPS
      useTLS = true;
    } else {
      tunnelPort = parseInt(DEFAULT_TUNNEL_PORT);
      useTLS = false;
    }
  }

  return {
    tunnelHost,
    tunnelPort,
    localPort,
    subdomain: subdomain || DEFAULT_SUBDOMAIN,
    useTLS
  };
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
🚇 WebSocket Tunnel Client

Usage:
  node client.js [tunnel-server] [local-port] [subdomain]

Examples:
  node client.js 3000
    # Creates tunnel to localhost:3000 with random subdomain

  node client.js myapp 3000
    # Creates tunnel to localhost:3000 with subdomain 'myapp'

  node client.js localhost:8080 3000
    # Creates tunnel to localhost:3000 via tunnel server at localhost:8080

  node client.js example.com:8080 3000 myapp
    # Creates tunnel to localhost:3000 via example.com:8080 with subdomain 'myapp'

  node client.js aimodelproxy.com 3000 myapp
    # Creates tunnel to localhost:3000 via aimodelproxy.com:443 (auto HTTPS)

Environment Variables:
  TUNNEL_HOST - Default tunnel server host (default: localhost)
  TUNNEL_PORT - Default tunnel server port (default: 80)
  WS_PATH - WebSocket path (default: /_ws/tunnel)

Features:
  - Auto-detects HTTPS for production domains (*.com, remote, production)
  - Supports both HTTP and HTTPS tunnel servers
  - Automatic protocol selection (ws:// or wss://)
  - Comprehensive error handling and logging

This will expose your local server running on port 3000 to the internet
through a public URL that you can share with others.
`);
}

// Parse configuration
const config = parseArguments();
const { tunnelHost, tunnelPort, localPort, subdomain, useTLS } = config;

// WebSocket connection URL
const protocol = useTLS ? 'wss' : 'ws';
const wsUrl = `${protocol}://${tunnelHost}:${tunnelPort}${WS_PATH}?subdomain=${subdomain}`;

console.log(`🚇 Starting WebSocket Tunnel Client`);
console.log(`   Tunnel Server: ${tunnelHost}:${tunnelPort} (${useTLS ? 'TLS' : 'plain'})`);
console.log(`   Local Port: ${localPort}`);
console.log(`   Subdomain: ${subdomain}`);
console.log(`   Connecting to: ${wsUrl}`);

// Connect to tunnel server
const ws = new WebSocket(wsUrl);

// Store active requests
const activeRequests = new Map();

ws.on('open', () => {
  console.log('✅ Connected to tunnel server');
});

// Store public domain from server
let publicDomain = 'aimodelproxy.com';

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    handleServerMessage(msg);
  } catch (error) {
    console.error('❌ Failed to parse server message:', error.message);
  }
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Connection closed: ${code} - ${reason}`);
  process.exit(1);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

// Handle ping from server
ws.on('ping', () => {
  console.log('💓 Received ping from server, sending pong');
  // WebSocket library automatically sends pong, but let's log it
});

// Handle pong from server
ws.on('pong', () => {
  console.log('💓 Received pong from server');
});

// Keepalive mechanism - send ping to server
setInterval(() => {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.ping();
      console.log('💓 Sent ping to server');
    } catch (error) {
      console.error('❌ Failed to send ping:', error.message);
    }
  }
}, 25000); // Send ping every 25 seconds

/**
 * Handle messages from the tunnel server
 */
function handleServerMessage(msg) {
  const { type, id } = msg;

  switch (type) {
    case 'ready':
      handleTunnelReady(msg);
      break;

    case 'req':
      handleHttpRequest(msg);
      break;

    case 'log':
      console.log(`[SERVER LOG] ${msg.message}`);
      break;

    case 'reqEnd':
      // Server finished sending request body (no action needed for GET requests)
      break;

    case 'reqAbort':
      // Server aborted request (connection closed)
      console.log(`🔄 Request ${msg.id} aborted by server`);
      break;

    default:
      console.warn(`⚠️  Unknown message type: ${type}`);
  }
}

/**
 * Handle tunnel ready message
 */
function handleTunnelReady(msg) {
  const { subdomain, url } = msg;

  console.log(`\n🎉 Tunnel successfully created!`);
  console.log(`🌐 Public URL: ${url}`);
  console.log(`📝 Subdomain: ${subdomain}`);
  console.log(`🔗 Local server: http://localhost:${localPort}`);
  console.log(`\n📋 Test commands:`);

  // Extract domain from URL for testing
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const protocol = urlObj.protocol;

    console.log(`   curl ${url}`);
    console.log(`   curl ${url}/api/test`);
    console.log(`   curl ${url}/health`);
    console.log(`   open ${url}`);

    // Show additional info for SSL
    if (protocol === 'https:') {
      console.log(`   🔒 This connection is secure (HTTPS)`);
    }
  } catch (error) {
    console.log(`   curl ${url}`);
  }

  console.log(`\nPress Ctrl+C to close the tunnel\n`);
}

/**
 * Handle HTTP request from tunnel server
 */
async function handleHttpRequest(msg) {
  const { id, method, path, headers } = msg;

  // Show request info (but not too verbose)
  console.log(`📨 ${method} ${path}`);

  // Prepare request to local server
  const requestOptions = {
    hostname: 'localhost',
    port: localPort,
    path: path,
    method: method,
    headers: {
      ...headers,
      'X-Forwarded-Host': headers.host,
      'X-Real-IP': '127.0.0.1',
      'X-Forwarded-Proto': 'http'
    }
  };

  try {
    // Make request to local server
    const response = await makeRequestToLocalServer(requestOptions, id);

    if (response) {
      // Send response back through tunnel
      sendResponse(id, response);
    }

  } catch (error) {
    console.error(`❌ Error handling request ${id}:`, error.message);
    sendErrorResponse(id, 502, 'Bad Gateway');
  }
}

/**
 * Make HTTP request to local server
 */
function makeRequestToLocalServer(options, requestId) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });

      res.on('error', reject);
    });

    req.on('error', (error) => {
      // Local server is not available
      console.warn(`⚠️  Local server not available on port ${localPort}`);
      resolve(null);
    });

    // Set timeout
    req.setTimeout(30000, () => {
      req.abort();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Send HTTP response back through tunnel
 */
function sendResponse(id, response) {
  // Send response headers
  const resMsg = {
    type: 'res',
    id: id,
    status: response.statusCode,
    headers: response.headers
  };

  ws.send(JSON.stringify(resMsg));

  // Send response body in chunks
  if (response.body && response.body.length > 0) {
    const chunkSize = 8192; // 8KB chunks

    for (let i = 0; i < response.body.length; i += chunkSize) {
      const chunk = response.body.slice(i, i + chunkSize);
      const bodyMsg = {
        type: 'resBody',
        id: id,
        chunk: chunk.toString('base64')
      };

      ws.send(JSON.stringify(bodyMsg));
    }
  }

  // Send response end
  const endMsg = {
    type: 'resEnd',
    id: id
  };

  ws.send(JSON.stringify(endMsg));
}

/**
 * Send error response
 */
function sendErrorResponse(id, status, message) {
  const errorMsg = {
    type: 'res',
    id: id,
    status: status,
    headers: {
      'content-type': 'text/plain',
      'content-length': Buffer.byteLength(message)
    }
  };

  ws.send(JSON.stringify(errorMsg));

  const bodyMsg = {
    type: 'resBody',
    id: id,
    chunk: Buffer.from(message).toString('base64')
  };

  ws.send(JSON.stringify(bodyMsg));

  const endMsg = {
    type: 'resEnd',
    id: id
  };

  ws.send(JSON.stringify(endMsg));
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down client...');
  ws.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down client...');
  ws.close();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  ws.close();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  ws.close();
  process.exit(1);
});
