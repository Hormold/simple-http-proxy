#!/usr/bin/env node

/**
 * @fileoverview Test HTTP server that responds to requests for testing the tunnel client
 */

import http from 'http';

const PORT = 3000;

const server = http.createServer((req, res) => {
  console.log(`📨 Local server received: ${req.method} ${req.url}`);

  // Simple routing
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>Test Server</title></head>
      <body>
        <h1>🎉 Tunnel Test Successful!</h1>
        <p>This request came through the tunnel: <strong>${req.method} ${req.url}</strong></p>
        <p>User-Agent: ${req.headers['user-agent'] || 'Unknown'}</p>
        <p>Host: ${req.headers['host'] || 'Unknown'}</p>
        <p>X-Real-IP: ${req.headers['x-real-ip'] || 'Not set'}</p>
        <p>X-Forwarded-For: ${req.headers['x-forwarded-for'] || 'Not set'}</p>
        <hr>
        <p><a href="/api/test">Test API endpoint</a></p>
        <p><a href="/json">JSON response</a></p>
      </body>
      </html>
    `);
  }

  else if (req.url === '/api/test') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'API endpoint working through tunnel!',
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString(),
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-real-ip': req.headers['x-real-ip'],
        'x-forwarded-for': req.headers['x-forwarded-for']
      }
    }, null, 2));
  }

  else if (req.url === '/json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'This is a JSON response from the local test server',
      tunnel: 'working',
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers
      }
    }));
  }

  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 - Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🧪 Test server running on http://localhost:${PORT}`);
  console.log(`🌐 Test endpoints:`);
  console.log(`   http://localhost:${PORT}/`);
  console.log(`   http://localhost:${PORT}/api/test`);
  console.log(`   http://localhost:${PORT}/json`);
});
