/**
 * @fileoverview Type definitions for the proxy server
 */

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
 * @typedef {Object} ProxyConfig
 * @property {number} port - Server port
 * @property {string} host - Server host
 * @property {string} publicDomain - Public domain for subdomains
 * @property {string} wsPath - WebSocket tunnel path
 * @property {string} [tlsKeyPath] - TLS private key path
 * @property {string} [tlsCertPath] - TLS certificate path
 */

/**
 * @typedef {Object} WebSocketMessage
 * @property {string} type - Message type
 * @property {string} [id] - Request ID
 * @property {string} [method] - HTTP method
 * @property {string} [path] - Request path
 * @property {string} [httpVersion] - HTTP version
 * @property {Object} [headers] - Request headers
 * @property {string} [chunk] - Base64 encoded body chunk
 * @property {number} [status] - Response status code
 * @property {string} [subdomain] - Subdomain name
 * @property {string} [url] - Tunnel URL
 * @property {string} [level] - Log level
 * @property {string} [message] - Log message
 */

/**
 * @typedef {Object} StatusResponse
 * @property {boolean} ok - Server status
 * @property {string} domain - Public domain
 * @property {string} wsPath - WebSocket path
 * @property {string[]} activeTunnels - List of active subdomains
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - List of validation errors
 */
