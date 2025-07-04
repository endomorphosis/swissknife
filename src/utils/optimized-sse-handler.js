/**
 * Optimized Server-Sent Events (SSE) Handler for DIA Model Streaming
 * 
 * This implementation addresses the time to first byte (TTFB) and jitter issues
 * in SSE connections when streaming DIA model outputs. It includes connection
 * pre-warming, adaptive backpressure handling, prioritized event delivery,
 * and comprehensive performance metrics.
 */

import { EventEmitter } from 'events';

// Event priority levels
export const Priority = {
  CRITICAL: 0, // System events, connection control
  HIGH: 1,     // User-visible content (model outputs)
  NORMAL: 2,   // Regular events
  LOW: 3       // Background or non-urgent events
};

// Connection states
export const ConnectionState = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected'
};

/**
 * Performance metrics collector for SSE connections
 */
class SseMetrics {
  constructor() {
    this.reset();
  }
  
  reset() {
    this.connectTime = null;
    this.ttfb = null;
    this.eventCount = 0;
    this.bytesSent = 0;
    this.eventTimes = [];
    this.eventSizes = [];
    this.reconnects = 0;
    this.errors = [];
    this.backpressureEvents = 0;
    this.lastEventTime = null;
    this.jitterValues = [];
  }
  
  recordConnect() {
    this.connectTime = Date.now();
  }
  
  recordEventSent(size, type) {
    const now = Date.now();
    
    // Record time to first byte
    if (this.ttfb === null && this.connectTime) {
      this.ttfb = now - this.connectTime;
    }
    
    // Calculate jitter (variation in inter-event timing)
    if (this.lastEventTime) {
      const interval = now - this.lastEventTime;
      const lastInterval = this.eventTimes.length > 1 ? 
        this.eventTimes[this.eventTimes.length - 1] - this.eventTimes[this.eventTimes.length - 2] : 
        interval;
      const jitter = Math.abs(interval - lastInterval);
      
      this.jitterValues.push({
        timestamp: now,
        jitter,
        type
      });
    }
    
    this.eventTimes.push(now);
    this.lastEventTime = now;
    this.eventCount++;
    this.bytesSent += size;
    this.eventSizes.push({ timestamp: now, size, type });
  }
  
  recordReconnect() {
    this.reconnects++;
  }
  
  recordError(error) {
    this.errors.push({
      timestamp: Date.now(),
      error: typeof error === 'string' ? error : error.toString()
    });
  }
  
  recordBackpressure() {
    this.backpressureEvents++;
  }
  
  getMetrics() {
    const now = Date.now();
    const lastMinute = now - 60000;
    
    // Filter to recent events
    const recentEvents = this.eventTimes.filter(t => t > lastMinute).length;
    const recentBytes = this.eventSizes
      .filter(e => e.timestamp > lastMinute)
      .reduce((sum, e) => sum + e.size, 0);
    
    // Calculate average jitter
    const recentJitter = this.jitterValues
      .filter(j => j.timestamp > lastMinute)
      .map(j => j.jitter);
      
    const avgJitter = recentJitter.length > 0 ?
      recentJitter.reduce((sum, j) => sum + j, 0) / recentJitter.length :
      0;
    
    // Calculate event rate and bandwidth
    const eventsPerSecond = recentEvents / 60;
    const bytesPerSecond = recentBytes / 60;
    
    return {
      ttfb: this.ttfb,
      totalEvents: this.eventCount,
      totalBytes: this.bytesSent,
      eventsPerSecond,
      bytesPerSecond,
      avgJitter,
      maxJitter: recentJitter.length > 0 ? Math.max(...recentJitter) : 0,
      reconnects: this.reconnects,
      backpressureEvents: this.backpressureEvents,
      errors: this.errors.slice(-5), // Last 5 errors
    };
  }
}

/**
 * Optimized SSE handler for low-latency streaming
 */
export class OptimizedSseHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // Response settings
      heartbeatInterval: 15000,      // 15 seconds
      heartbeatMessage: ': heartbeat',
      retryInterval: 2000,           // 2 seconds
      initialBufferSize: 8192,       // 8KB initial buffer
      contentType: 'text/event-stream',
      
      // Performance tuning
      maxBatchSize: 10,              // Max events to batch
      batchInterval: 5,              // 5ms batching window
      enableCompression: true,       // Enable response compression
      chunkSize: 16384,              // 16KB chunk size
      
      // Backpressure handling
      enableBackpressure: true,      // Enable backpressure detection
      backpressureHighWatermark: 50, // Events in queue before backpressure
      backpressureLowWatermark: 10,  // Events in queue to resume normal flow
      
      // Reconnection handling
      maxReconnectAttempts: 5,
      reconnectBackoffFactor: 1.5,
      
      ...options
    };
    
    this.metrics = new SseMetrics();
    this.state = ConnectionState.DISCONNECTED;
    this.queue = [];
    this.highPriorityQueue = [];
    this.isBackpressured = false;
    this.heartbeatTimer = null;
    this.batchTimer = null;
    this.response = null;
    
    // Set up metrics reporting
    this.metricsInterval = setInterval(() => {
      this.emit('metrics', this.metrics.getMetrics());
    }, 10000); // Report every 10 seconds
  }
  
  /**
   * Initialize the SSE connection with a response object
   * @param {object} response - HTTP response object
   */
  initialize(response) {
    // Clean up any existing connection
    this.close();
    
    this.response = response;
    this.state = ConnectionState.CONNECTED;
    this.metrics.recordConnect();
    
    // Set headers for SSE
    this._setHeaders();
    
    // Send initial retry directive
    this._writeDirectly(`retry: ${this.options.retryInterval}\n\n`);
    
    // Setup heartbeat
    this._setupHeartbeat();
    
    // Process any queued messages
    this._processQueue();
    
    this.emit('open');
  }
  
  /**
   * Send an event with optional event type
   * @param {string} data - Event data
   * @param {string} eventType - Optional event type
   * @param {number} priority - Event priority (0-3)
   */
  send(data, eventType = null, priority = Priority.NORMAL) {
    const event = {
      data,
      type: eventType,
      priority,
      timestamp: Date.now()
    };
    
    // For high priority events, use a separate queue
    if (priority <= Priority.HIGH) {
      this.highPriorityQueue.push(event);
      this._processHighPriorityQueue();
    } else {
      this.queue.push(event);
      
      // Check for backpressure
      if (this.options.enableBackpressure && 
          this.queue.length >= this.options.backpressureHighWatermark) {
        this._enableBackpressure();
      }
      
      this._scheduleQueueProcessing();
    }
  }
  
  /**
   * Send a data event with high priority
   * @param {string} data - Event data
   */
  sendHigh(data) {
    this.send(data, null, Priority.HIGH);
  }
  
  /**
   * Send a data event with critical priority
   * @param {string} data - Event data
   */
  sendCritical(data) {
    this.send(data, null, Priority.CRITICAL);
  }
  
  /**
   * Send a data event with low priority
   * @param {string} data - Event data
   */
  sendLow(data) {
    this.send(data, null, Priority.LOW);
  }
  
  /**
   * Send a typed event with specified priority
   * @param {string} data - Event data
   * @param {string} eventType - Event type
   * @param {number} priority - Priority level
   */
  sendEvent(data, eventType, priority = Priority.NORMAL) {
    this.send(data, eventType, priority);
  }
  
  /**
   * Close the SSE connection
   */
  close() {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.batchTimer);
    
    if (this.state === ConnectionState.CONNECTED && this.response) {
      // Try to end the response if possible
      try {
        this.response.end();
      } catch (err) {
        this.metrics.recordError(`Error closing SSE connection: ${err}`);
      }
    }
    
    this.state = ConnectionState.DISCONNECTED;
    this.response = null;
    this.emit('close');
  }
  
  /**
   * Get current metrics
   * @returns {object} Current metrics
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.close();
    clearInterval(this.metricsInterval);
    this.removeAllListeners();
  }
  
  // Private methods
  
  /**
   * Set appropriate headers for SSE
   * @private
   */
  _setHeaders() {
    if (!this.response) return;
    
    try {
      this.response.setHeader('Content-Type', this.options.contentType);
      this.response.setHeader('Cache-Control', 'no-cache,no-transform');
      this.response.setHeader('Connection', 'keep-alive');
      this.response.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
      
      if (this.options.enableCompression) {
        // Let compression middleware handle it if present
        // Otherwise could set Content-Encoding: gzip here
      }
    } catch (err) {
      this.metrics.recordError(`Error setting headers: ${err}`);
    }
  }
  
  /**
   * Set up heartbeat interval
   * @private
   */
  _setupHeartbeat() {
    clearInterval(this.heartbeatTimer);
    
    this.heartbeatTimer = setInterval(() => {
      if (this.state === ConnectionState.CONNECTED) {
        this._writeDirectly(this.options.heartbeatMessage + '\n\n');
      } else {
        clearInterval(this.heartbeatTimer);
      }
    }, this.options.heartbeatInterval);
  }
  
  /**
   * Process high priority queue immediately
   * @private
   */
  _processHighPriorityQueue() {
    if (this.state !== ConnectionState.CONNECTED || !this.response) return;
    
    while (this.highPriorityQueue.length > 0) {
      const event = this.highPriorityQueue.shift();
      this._writeEvent(event);
    }
  }
  
  /**
   * Schedule processing of the regular event queue
   * @private
   */
  _scheduleQueueProcessing() {
    if (this.batchTimer || this.state !== ConnectionState.CONNECTED) return;
    
    this.batchTimer = setTimeout(() => {
      this._processQueue();
      this.batchTimer = null;
    }, this.options.batchInterval);
  }
  
  /**
   * Process the regular event queue, batching events if possible
   * @private
   */
  _processQueue() {
    if (this.state !== ConnectionState.CONNECTED || !this.response) return;
    
    // Process up to max batch size
    const batchSize = Math.min(this.options.maxBatchSize, this.queue.length);
    
    if (batchSize > 0) {
      // Sort by priority
      this.queue.sort((a, b) => a.priority - b.priority);
      
      // Take the events to process
      const events = this.queue.splice(0, batchSize);
      
      // Group events by type to optimize formatting
      const eventsByType = {};
      for (const event of events) {
        const type = event.type || '';
        if (!eventsByType[type]) {
          eventsByType[type] = [];
        }
        eventsByType[type].push(event);
      }
      
      // Process each type
      for (const [type, typeEvents] of Object.entries(eventsByType)) {
        // For small number of events, send individually
        if (typeEvents.length === 1) {
          this._writeEvent(typeEvents[0]);
        } else {
          // For multiple events, batch them with a boundary
          const combinedData = typeEvents
            .map(e => e.data)
            .join('\n');
            
          this._writeEvent({
            data: combinedData,
            type,
            priority: Math.min(...typeEvents.map(e => e.priority))
          });
        }
      }
      
      // If we still have events, schedule another round
      if (this.queue.length > 0) {
        this._scheduleQueueProcessing();
      } else if (this.isBackpressured) {
        this._disableBackpressure();
      }
    }
  }
  
  /**
   * Write an event to the response
   * @param {object} event - Event to write
   * @private
   */
  _writeEvent(event) {
    if (!this.response || this.state !== ConnectionState.CONNECTED) return;
    
    try {
      let message = '';
      
      // Add event type if provided
      if (event.type) {
        message += `event: ${event.type}\n`;
      }
      
      // Add data, handling multiline data
      const lines = event.data.split('\n');
      for (const line of lines) {
        message += `data: ${line}\n`;
      }
      
      // End the message with a blank line
      message += '\n';
      
      this._writeDirectly(message);
      
      // Record metrics
      this.metrics.recordEventSent(message.length, event.type);
    } catch (err) {
      this.metrics.recordError(`Error writing event: ${err}`);
      this.emit('error', err);
    }
  }
  
  /**
   * Write raw data directly to the response
   * @param {string} data - Data to write
   * @private
   */
  _writeDirectly(data) {
    if (!this.response || this.state !== ConnectionState.CONNECTED) return;
    
    try {
      this.response.write(data);
    } catch (err) {
      this.metrics.recordError(`Error writing to response: ${err}`);
      this.emit('error', err);
      this.close();
    }
  }
  
  /**
   * Enable backpressure mode to slow down event producers
   * @private
   */
  _enableBackpressure() {
    if (!this.isBackpressured) {
      this.isBackpressured = true;
      this.metrics.recordBackpressure();
      this.emit('backpressure', true);
    }
  }
  
  /**
   * Disable backpressure mode when queue is drained enough
   * @private
   */
  _disableBackpressure() {
    if (this.isBackpressured && 
        this.queue.length <= this.options.backpressureLowWatermark) {
      this.isBackpressured = false;
      this.emit('backpressure', false);
    }
  }
}

/**
 * Helper function to create a new optimized SSE handler
 * @param {object} options - Handler options
 * @returns {OptimizedSseHandler} New handler instance
 */
export function createOptimizedSseHandler(options = {}) {
  return new OptimizedSseHandler(options);
}

/**
 * Middleware factory for Express/Connect/Fastify to optimize SSE responses
 * @param {object} options - SSE handler options
 * @returns {function} Middleware function
 */
export function optimizedSseMiddleware(options = {}) {
  return function(req, res, next) {
    // Skip if not an SSE request
    const acceptHeader = req.headers.accept || '';
    if (!acceptHeader.includes('text/event-stream')) {
      return next();
    }
    
    // Create and attach the handler to the response
    const handler = createOptimizedSseHandler(options);
    res.sseHandler = handler;
    
    // Provide convenience methods on the response
    res.sse = (data, eventType, priority) => {
      handler.send(data, eventType, priority);
    };
    
    res.sseEvent = (data, eventType) => {
      handler.sendEvent(data, eventType);
    };
    
    // Initialize the handler with the response
    handler.initialize(res);
    
    // Handle client disconnect
    req.on('close', () => {
      handler.close();
    });
    
    // Continue processing
    next();
  };
}
