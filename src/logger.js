/**
 * @fileoverview Structured logging utility for the proxy server
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LOG_LEVEL_NAMES = {
  [LOG_LEVELS.ERROR]: 'ERROR',
  [LOG_LEVELS.WARN]: 'WARN',
  [LOG_LEVELS.INFO]: 'INFO',
  [LOG_LEVELS.DEBUG]: 'DEBUG'
};

/**
 * Get current log level from environment
 * @returns {number} Current log level
 */
function getCurrentLogLevel() {
  const level = process.env.LOG_LEVEL || 'INFO';
  return LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
}

/**
 * Format log message with timestamp and level
 * @param {string} level - Log level name
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 * @returns {string} Formatted log message
 */
function formatLogMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const baseMessage = `[${timestamp}] [${level}] ${message}`;

  if (Object.keys(meta).length > 0) {
    try {
      return `${baseMessage} ${JSON.stringify(meta)}`;
    } catch (error) {
      return `${baseMessage} [Error serializing metadata: ${error.message}]`;
    }
  }

  return baseMessage;
}

/**
 * Performance metrics
 */
class PerformanceMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.requests = 0;
    this.responses = 0;
    this.errors = 0;
    this.avgResponseTime = 0;
    this.responseTimes = [];
    this.startTime = Date.now();
  }

  recordRequest() {
    this.requests++;
  }

  recordResponse(responseTime) {
    this.responses++;
    this.responseTimes.push(responseTime);

    // Keep only last 100 response times for avg calculation
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }

    // Calculate rolling average
    this.avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  recordError() {
    this.errors++;
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    return {
      requests: this.requests,
      responses: this.responses,
      errors: this.errors,
      avgResponseTime: Math.round(this.avgResponseTime * 100) / 100,
      uptime: uptime,
      requestsPerSecond: uptime > 0 ? Math.round((this.requests / uptime) * 1000 * 100) / 100 : 0
    };
  }
}

// Global performance metrics
const metrics = new PerformanceMetrics();

/**
 * Logger class with different log levels
 */
class Logger {
  constructor() {
    this.currentLevel = getCurrentLogLevel();
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Object} [meta] - Additional metadata
   */
  error(message, meta) {
    if (this.currentLevel >= LOG_LEVELS.ERROR) {
      console.error(formatLogMessage('ERROR', message, meta));
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} [meta] - Additional metadata
   */
  warn(message, meta) {
    if (this.currentLevel >= LOG_LEVELS.WARN) {
      console.warn(formatLogMessage('WARN', message, meta));
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} [meta] - Additional metadata
   */
  info(message, meta) {
    if (this.currentLevel >= LOG_LEVELS.INFO) {
      console.info(formatLogMessage('INFO', message, meta));
    }
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {Object} [meta] - Additional metadata
   */
  debug(message, meta) {
    if (this.currentLevel >= LOG_LEVELS.DEBUG) {
      console.debug(formatLogMessage('DEBUG', message, meta));
    }
  }

  /**
   * Create a child logger with context
   * @param {string} context - Context name
   * @returns {Logger} Child logger
   */
  child(context) {
    const childLogger = Object.create(this);
    const originalMethods = {};

    ['error', 'warn', 'info', 'debug'].forEach(level => {
      originalMethods[level] = this[level];
      childLogger[level] = (message, meta) => {
        const contextualMessage = `[${context}] ${message}`;
        originalMethods[level].call(this, contextualMessage, meta);
      };
    });

    return childLogger;
  }
}

// Export singleton logger instance
export const logger = new Logger();

// Export performance metrics
export { metrics };

// Export class for creating custom loggers
export { Logger };
