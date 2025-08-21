# AI Chat Proxy Server

A high-performance reverse proxy server with WebSocket tunneling capabilities. Designed for exposing local development servers to the internet through secure subdomain-based tunnels.

## Features

- **Reverse Proxy**: HTTP/HTTPS proxy with full header forwarding
- **WebSocket Tunneling**: Real-time bidirectional communication
- **Dynamic Subdomains**: Auto-generated or custom subdomain allocation
- **TLS Support**: Optional SSL/TLS encryption
- **Buffer Management**: Intelligent WebSocket buffer handling
- **Keep-alive**: Automatic connection health monitoring
- **Health Monitoring**: Built-in status and health check endpoints
- **Performance Optimized**: Gzip compression, HTTP keep-alive, metrics
- **Security**: Input validation, sanitization, no tunnel enumeration
- **Modular Architecture**: Clean separation of concerns, ES modules

## Requirements

- Node.js 18+
- npm for dependency management

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd proxy

# Install dependencies
npm install

# Make executable (optional)
chmod +x index.js
```

## Configuration

Configure the server using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server listening port |
| `HOST` | `0.0.0.0` | Server listening host |
| `PUBLIC_DOMAIN` | `aimodelproxy.com` | Public domain for subdomain routing |
| `WS_PATH` | `/_ws/tunnel` | WebSocket tunnel endpoint path |
| `TLS_KEY_PATH` | - | Path to TLS private key (optional) |
| `TLS_CERT_PATH` | - | Path to TLS certificate (optional) |

### TLS Configuration

To enable HTTPS, set the TLS environment variables:

```bash
export TLS_KEY_PATH=/path/to/private-key.pem
export TLS_CERT_PATH=/path/to/certificate.pem
```

## Usage

### Starting the Server

```bash
# Basic usage
npm start

# Or directly
node index.js

# With custom configuration
PORT=3000 HOST=localhost PUBLIC_DOMAIN=example.com node index.js
```

### Using the Client

The easiest way to create a tunnel is using the provided client:

```bash
# Expose local server on port 3000 with random subdomain
node client.js 3000

# Expose local server with custom subdomain
node client.js myapp 3000

# Connect to specific tunnel server
node client.js localhost:8080 3000

# Full configuration
node client.js example.com:8080 3000 myapp
```

### Manual WebSocket Connection

You can also create tunnels manually using any WebSocket client:

```bash
# Using a WebSocket client library
const WebSocket = require('ws');

// Connect to create tunnel
const ws = new WebSocket('ws://your-server:8080/_ws/tunnel?subdomain=myservice');

// Handle tunnel ready
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'ready') {
    console.log(`Tunnel ready at: ${msg.url}`);
    // Your service is now accessible at: http://myservice.aimodelproxy.com
  }
});
```

### Testing the Setup

Use the provided test server and client:

```bash
# Terminal 1: Start tunnel server
node index.js

# Terminal 2: Start test local server
node test-client.js

# Terminal 3: Create tunnel
node client.js 3000

# Terminal 4: Test the tunnel
curl http://[generated-subdomain].aimodelproxy.com
```

### API Endpoints

#### Health Check
```
GET /api/status
GET /
```
Returns server status (no tunnel enumeration for security).

Response:
```json
{
  "ok": true,
  "domain": "aimodelproxy.com",
  "wsPath": "/_ws/tunnel"
}
```

#### Performance Metrics
```
GET /api/metrics
```
Returns detailed performance metrics and server stats.

Response:
```json
{
  "requests": 150,
  "responses": 148,
  "errors": 2,
  "avgResponseTime": 12.5,
  "uptime": 3600000,
  "requestsPerSecond": 41.67,
  "memory": {
    "rss": 104857600,
    "heapTotal": 67108864,
    "heapUsed": 45000000,
    "external": 2000000
  },
  "nodeVersion": "v20.11.0"
}
```

## WebSocket Protocol

### Client Messages

#### Request
```json
{
  "type": "req",
  "id": "uuid",
  "method": "GET",
  "path": "/api/users",
  "headers": {
    "host": "example.com",
    "user-agent": "MyApp/1.0"
  }
}
```

#### Request Body
```json
{
  "type": "reqBody",
  "id": "uuid",
  "chunk": "base64-encoded-data"
}
```

#### Request End
```json
{
  "type": "reqEnd",
  "id": "uuid"
}
```

### Server Messages

#### Ready
```json
{
  "type": "ready",
  "subdomain": "generated-or-requested-subdomain",
  "url": "https://subdomain.domain.com"
}
```

#### Response
```json
{
  "type": "res",
  "id": "uuid",
  "status": 200,
  "headers": {
    "content-type": "application/json"
  }
}
```

#### Response Body
```json
{
  "type": "resBody",
  "id": "uuid",
  "chunk": "base64-encoded-data"
}
```

#### Response End
```json
{
  "type": "resEnd",
  "id": "uuid"
}
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │───▶│   Proxy Server  │───▶│   Local Server  │
│   (Browser)     │    │   (Public)      │    │   (Private)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ WebSocket       │
                       │ Tunnel          │
                       └─────────────────┘
```

### Flow

1. **Tunnel Creation**: Client connects via WebSocket to create tunnel
2. **Subdomain Assignment**: Server assigns unique subdomain
3. **Request Forwarding**: Public requests routed through WebSocket
4. **Response Streaming**: Responses streamed back to public clients

## Error Handling

The server handles various error conditions:

- **Invalid Subdomain**: Returns 404 for unmatched subdomains
- **Tunnel Offline**: Returns 502 when tunnel is unavailable
- **Connection Timeout**: Automatic cleanup of dead connections
- **Buffer Overflow**: Automatic pause/resume for high traffic

## Performance

The server is optimized for high performance with:

- **Gzip Compression**: Automatic compression for responses > 1KB
- **HTTP Keep-alive**: Persistent connections reduce latency
- **Smart Buffer Management**: Prevents memory exhaustion
- **Connection Pooling**: Efficient WebSocket connection handling
- **Metrics Collection**: Real-time performance monitoring
- **Ping/Pong Keepalive**: Bidirectional heartbeat mechanism

Typical performance:
- **API Response Time**: 10-15ms (without compression)
- **Throughput**: 1000+ requests/second
- **Memory Usage**: Minimal, with smart garbage collection
- **Connection Handling**: 10,000+ concurrent connections

## Keepalive Mechanism

Both server and client implement WebSocket ping/pong for connection health:

- **Server → Client**: Ping every 25 seconds, timeout after 90 seconds
- **Client → Server**: Ping every 25 seconds, automatic pong responses
- **Connection Monitoring**: Real-time logging of ping/pong activity
- **Graceful Cleanup**: Proper connection termination on failures

## Security Considerations

- No built-in authentication (add your own)
- No rate limiting (implement as needed)
- WebSocket buffer limits prevent memory exhaustion
- Hop-by-hop headers are filtered out
- TLS recommended for production use
- No tunnel enumeration (active tunnels not exposed via API)
- Input validation and sanitization on all user inputs
- Proper error handling without information leakage

## Monitoring

Monitor server health through:
- `/api/status` endpoint for basic health
- WebSocket connection counts
- Active tunnel tracking
- Console logs for detailed events

## Development

```bash
# Install dev dependencies
npm install --save-dev nodemon

# Run with auto-restart
npx nodemon index.js
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details
