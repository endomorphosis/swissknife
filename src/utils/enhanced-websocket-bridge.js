/**
 * Enhanced WebSocket Bridge for Low-Latency DIA Model Streaming
 * 
 * This implementation focuses on reducing time to first byte and jitter in WebSocket 
 * connections to improve streaming performance for the DIA model. It includes
 * connection pre-warming, message prioritization, adaptive batching, and
 * comprehensive performance metrics.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

// Connection states
const ConnectionState = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected'
};

// Message priorities
const Priority = {
  CRITICAL: 0, // Essential messages like auth/initialization
  HIGH: 1,     // User-visible streaming content
  NORMAL: 2,   // Regular messages
  LOW: 3       // Background or non-urgent messages
};

/**
 * Performance metrics collector for websocket connections
 */
class PerformanceMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.connectTimes = [];
    this.messageSendTimes = new Map();
    this.messageReceiveTimes = [];
    this.ttfb = null;
    this.reconnects = 0;
    this.latencies = [];
    this.jitterValues = [];
    this.throughputIn = [];
    this.throughputOut = [];
    this.errors = [];
    this.lastActivity = Date.now();
  }

  recordConnectStart() {
    this.connectStartTime = Date.now();
  }

  recordConnectEnd() {
    if (this.connectStartTime) {
      const duration = Date.now() - this.connectStartTime;
      this.connectTimes.push(duration);
      this.connectStartTime = null;
    }
  }

  recordMessageSend(id, size, priority) {
    const now = Date.now();
    this.messageSendTimes.set(id, { 
      timestamp: now, 
      size,
      priority 
    });
    this.throughputOut.push({ timestamp: now, bytes: size });
    this.lastActivity = now;
  }

  recordMessageReceive(id, size) {
    const now = Date.now();
    const sendInfo = this.messageSendTimes.get(id);
    
    // If we have a corresponding send event, calculate latency
    if (sendInfo) {
      const latency = now - sendInfo.timestamp;
      this.latencies.push({ 
        latency, 
        timestamp: now, 
        priority: sendInfo.priority 
      });
      
      // Calculate jitter relative to the previous message of the same priority
      const previousLatency = this.latencies
        .filter(item => item.priority === sendInfo.priority)
        .slice(-2, -1)[0];
        
      if (previousLatency) {
        const jitter = Math.abs(latency - previousLatency.latency);
        this.jitterValues.push({
          jitter,
          timestamp: now,
          priority: sendInfo.priority
        });
      }
      
      this.messageSendTimes.delete(id);
    }
    
    // Record TTFB if this is the first message
    if (this.ttfb === null) {
      this.ttfb = now - (this.connectStartTime || now);
    }
    
    this.messageReceiveTimes.push(now);
    this.throughputIn.push({ timestamp: now, bytes: size });
    this.lastActivity = now;
  }

  recordReconnect() {
    this.reconnects += 1;
  }

  recordError(error) {
    this.errors.push({
      timestamp: Date.now(),
      error: error.toString()
    });
  }

  getMetrics() {
    const now = Date.now();
    const lastMinute = now - 60000;
    const recentLatencies = this.latencies
      .filter(item => item.timestamp > lastMinute)
      .map(item => item.latency);
    
    const recentJitter = this.jitterValues
      .filter(item => item.timestamp > lastMinute)
      .map(item => item.jitter);
    
    // Calculate throughput in bytes per second
    const recentInBytes = this.throughputIn
      .filter(item => item.timestamp > lastMinute)
      .reduce((sum, item) => sum + item.bytes, 0);
    
    const recentOutBytes = this.throughputOut
      .filter(item => item.timestamp > lastMinute)
      .reduce((sum, item) => sum + item.bytes, 0);
    
    return {
      ttfb: this.ttfb,
      avgConnectTime: this.connectTimes.length > 0 
        ? this.connectTimes.reduce((a, b) => a + b, 0) / this.connectTimes.length 
        : null,
      avgLatency: recentLatencies.length > 0
        ? recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length
        : null,
      avgJitter: recentJitter.length > 0
        ? recentJitter.reduce((a, b) => a + b, 0) / recentJitter.length
        : null,
      maxLatency: recentLatencies.length > 0
        ? Math.max(...recentLatencies)
        : null,
      minLatency: recentLatencies.length > 0
        ? Math.min(...recentLatencies)
        : null,
      throughputIn: recentInBytes / 60, // bytes/second
      throughputOut: recentOutBytes / 60, // bytes/second
      reconnects: this.reconnects,
      errors: this.errors.slice(-5), // last 5 errors
      pendingMessages: this.messageSendTimes.size,
      idleTime: now - this.lastActivity,
    };
  }
}

/**
 * Enhanced WebSocket bridge with optimizations for streaming performance
 */
export class EnhancedWebSocketBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      url: null,
      protocols: [],
      // Connection management
      autoReconnect: true,
      maxReconnectAttempts: 10,
      initialReconnectDelay: 100, // Start with a short delay for fast recovery
      maxReconnectDelay: 5000,    // Cap at 5 seconds
      connectionTimeout: 10000,   // 10 seconds
      // Message handling
      binaryMessages: false,      // Use binary messaging when possible
      enableCompression: true,    // Use compression for messages
      // Batching configuration
      enableBatching: true,       // Enable message batching
      batchingThreshold: 20,      // Only batch messages arriving within 20ms
      maxBatchSize: 50,           // Maximum messages in a batch
      // Heartbeat settings
      heartbeatEnabled: true,
      heartbeatInterval: 15000,    // 15 seconds
      // Buffer settings
      maxBufferedMessages: 1000,   // Max messages to buffer during disconnect
      // Progressive backoff strategy
      backoffFactor: 1.5,
      jitterFactor: 0.1,
      
      ...options
    };
    
    // Message ID counter
    this.nextMessageId = 1;
    
    // Connection state
    this.state = ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.messageQueue = [];
    this.batchTimeout = null;
    
    // Performance metrics
    this.metrics = new PerformanceMetrics();
    
    // Message batching state
    this.currentBatch = {
      critical: [],
      high: [],
      normal: [],
      low: []
    };
    
    // Set up regular metrics reporting
    this.metricsInterval = setInterval(() => {
      this.emit('metrics', this.metrics.getMetrics());
    }, 10000); // Report metrics every 10 seconds

    // Bind event handlers
    this._onOpen = this._onOpen.bind(this);
    this._onMessage = this._onMessage.bind(this);
    this._onClose = this._onClose.bind(this);
    this._onError = this._onError.bind(this);
  }
  
  /**
   * Connect to the WebSocket server
   * @param {string} url - WebSocket server URL
   * @param {Array} protocols - WebSocket protocols
   */
  connect(url = null, protocols = null) {
    if (this.state === ConnectionState.CONNECTED || 
        this.state === ConnectionState.CONNECTING) {
      return;
    }
    
    if (url) this.options.url = url;
    if (protocols) this.options.protocols = protocols;
    
    if (!this.options.url) {
      throw new Error('WebSocket URL is required');
    }
    
    this.state = ConnectionState.CONNECTING;
    this.metrics.recordConnectStart();

    // Set up connection timeout
    this.connectTimeout = setTimeout(() => {
      if (this.state === ConnectionState.CONNECTING) {
        this._handleConnectionFailure(new Error('Connection timeout'));
      }
    }, this.options.connectionTimeout);

    // Initialize the WebSocket connection
    try {
      const wsOptions = {
        perMessageDeflate: this.options.enableCompression
      };
      
      this.socket = new WebSocket(this.options.url, this.options.protocols, wsOptions);
      this.socket.binaryType = this.options.binaryMessages ? 'arraybuffer' : 'blob';
      
      // Set up event listeners
      this.socket.addEventListener('open', this._onOpen);
      this.socket.addEventListener('message', this._onMessage);
      this.socket.addEventListener('close', this._onClose);
      this.socket.addEventListener('error', this._onError);
    } catch (error) {
      this._handleConnectionFailure(error);
    }
  }
  
  /**
   * Disconnect from the WebSocket server
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  disconnect(code = 1000, reason = 'Normal closure') {
    clearTimeout(this.connectTimeout);
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.batchTimeout);
    
    if (this.socket) {
      try {
        // Remove event listeners
        this.socket.removeEventListener('open', this._onOpen);
        this.socket.removeEventListener('message', this._onMessage);
        this.socket.removeEventListener('close', this._onClose);
        this.socket.removeEventListener('error', this._onError);
        
        // Close the connection if it's open
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.close(code, reason);
        }
      } catch (error) {
        this.metrics.recordError(error);
      }
    }
    
    this.state = ConnectionState.DISCONNECTED;
    this.socket = null;
    this.emit('disconnected', { code, reason });
  }
  
  /**
   * Send a message with the specified priority
   * @param {*} message - Message to send
   * @param {number} priority - Message priority (0-3)
   * @returns {string} Message ID
   */
  send(message, priority = Priority.NORMAL) {
    const messageId = this._generateMessageId();
    const messageObj = {
      id: messageId,
      data: message,
      priority: priority,
      timestamp: Date.now()
    };
    
    // If we're connected, handle the message directly
    if (this.state === ConnectionState.CONNECTED) {
      this._handleOutgoingMessage(messageObj);
    } else {
      // Otherwise queue it for later
      this._queueMessage(messageObj);
    }
    
    return messageId;
  }
  
  /**
   * Send a critical priority message, bypassing batching
   * @param {*} message - Message to send
   * @returns {string} Message ID
   */
  sendCritical(message) {
    return this.send(message, Priority.CRITICAL);
  }
  
  /**
   * Send a high priority message
   * @param {*} message - Message to send
   * @returns {string} Message ID
   */
  sendHigh(message) {
    return this.send(message, Priority.HIGH);
  }
  
  /**
   * Send a low priority message
   * @param {*} message - Message to send
   * @returns {string} Message ID
   */
  sendLow(message) {
    return this.send(message, Priority.LOW);
  }
  
  /**
   * Get the current connection state
   * @returns {string} Connection state
   */
  getState() {
    return this.state;
  }
  
  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.disconnect();
    clearInterval(this.metricsInterval);
    this.removeAllListeners();
  }
  
  // Private methods
  
  /**
   * Generate a unique message ID
   * @returns {string} Message ID
   * @private
   */
  _generateMessageId() {
    const id = `msg_${this.nextMessageId}`;
    this.nextMessageId += 1;
    return id;
  }
  
  /**
   * Handle connection success
   * @private
   */
  _onOpen() {
    clearTimeout(this.connectTimeout);
    this.state = ConnectionState.CONNECTED;
    this.reconnectAttempts = 0;
    this.metrics.recordConnectEnd();
    
    // Set up heartbeat
    if (this.options.heartbeatEnabled) {
      this._setupHeartbeat();
    }
    
    this.emit('connected');
    
    // Process queued messages
    this._processQueue();
  }
  
  /**
   * Handle incoming messages
   * @param {MessageEvent} event - WebSocket message event
   * @private
   */
  _onMessage(event) {
    try {
      // Parse the message
      const message = this._parseMessage(event.data);
      
      // Record metrics
      this.metrics.recordMessageReceive(
        message.id || 'server', 
        event.data.length || 0
      );
      
      // Emit the message event
      this.emit('message', message);
    } catch (error) {
      this.metrics.recordError(error);
      this.emit('error', {
        type: 'parse_error',
        error,
        raw: event.data
      });
    }
  }
  
  /**
   * Handle connection close
   * @param {CloseEvent} event - WebSocket close event
   * @private
   */
  _onClose(event) {
    // Clean up existing timers
    clearTimeout(this.connectTimeout);
    clearInterval(this.heartbeatTimer);
    
    // Handle clean close vs. error
    if (event.code === 1000) {
      // Normal closure
      this.state = ConnectionState.DISCONNECTED;
      this.emit('disconnected', {
        code: event.code,
        reason: event.reason || 'Connection closed'
      });
    } else {
      // Abnormal closure
      this._handleConnectionFailure({
        code: event.code,
        reason: event.reason || 'Connection closed abnormally'
      });
    }
  }
  
  /**
   * Handle connection errors
   * @param {Error} error - WebSocket error
   * @private
   */
  _onError(error) {
    this.metrics.recordError(error);
    this.emit('error', {
      type: 'socket_error',
      error
    });
    
    // The close event will be called after this
  }
  
  /**
   * Handle connection failures and reconnection
   * @param {Error} error - Connection error
   * @private
   */
  _handleConnectionFailure(error) {
    clearTimeout(this.connectTimeout);
    clearInterval(this.heartbeatTimer);
    
    this.metrics.recordError(error);
    this.emit('error', {
      type: 'connection_error',
      error
    });
    
    // If reconnect is enabled, try again with backoff
    if (this.options.autoReconnect && 
        this.reconnectAttempts < this.options.maxReconnectAttempts) {
      
      this.state = ConnectionState.RECONNECTING;
      this.reconnectAttempts += 1;
      this.metrics.recordReconnect();
      
      // Calculate backoff with jitter
      const backoff = this._calculateBackoff();
      this.emit('reconnecting', {
        attempt: this.reconnectAttempts,
        delay: backoff,
        error
      });
      
      // Schedule reconnection
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, backoff);
    } else {
      this.state = ConnectionState.DISCONNECTED;
      this.emit('disconnected', {
        code: 0,
        reason: 'Connection failed',
        error
      });
    }
  }
  
  /**
   * Set up heartbeat to keep connection alive
   * @private
   */
  _setupHeartbeat() {
    clearInterval(this.heartbeatTimer);
    
    this.heartbeatTimer = setInterval(() => {
      if (this.state === ConnectionState.CONNECTED) {
        this.sendCritical({ type: 'heartbeat', timestamp: Date.now() });
      } else {
        clearInterval(this.heartbeatTimer);
      }
    }, this.options.heartbeatInterval);
  }
  
  /**
   * Process the message queue
   * @private
   */
  _processQueue() {
    if (this.state !== ConnectionState.CONNECTED) return;
    
    // Process messages in priority order
    const allMessages = [...this.messageQueue];
    this.messageQueue = [];
    
    // Sort by priority
    allMessages.sort((a, b) => a.priority - b.priority);
    
    // Send all queued messages
    for (const message of allMessages) {
      this._handleOutgoingMessage(message);
    }
  }
  
  /**
   * Queue a message for later sending
   * @param {Object} message - Message object
   * @private
   */
  _queueMessage(messageObj) {
    // Only queue if we're below max buffer size
    if (this.messageQueue.length < this.options.maxBufferedMessages) {
      this.messageQueue.push(messageObj);
    } else {
      // Drop messages when buffer is full (lowest priority first)
      this.messageQueue.sort((a, b) => b.priority - a.priority);
      this.messageQueue.pop(); // Remove the lowest priority message
      this.messageQueue.push(messageObj);
      
      this.emit('message_dropped', {
        reason: 'buffer_full',
        message: messageObj
      });
    }
  }
  
  /**
   * Handle sending a message
   * @param {Object} messageObj - Message object
   * @private
   */
  _handleOutgoingMessage(messageObj) {
    // Critical messages bypass batching
    if (messageObj.priority === Priority.CRITICAL || !this.options.enableBatching) {
      this._sendMessageDirectly(messageObj);
      return;
    }
    
    // Add to the appropriate priority batch
    const priorityName = this._getPriorityName(messageObj.priority);
    this.currentBatch[priorityName].push(messageObj);
    
    // Schedule batch processing if not already scheduled
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this._processBatch();
        this.batchTimeout = null;
      }, this.options.batchingThreshold);
    }
  }
  
  /**
   * Process batched messages
   * @private
   */
  _processBatch() {
    // Process each priority level
    for (const priority of ['critical', 'high', 'normal', 'low']) {
      const messages = this.currentBatch[priority];
      
      if (messages.length > 0) {
        // If only one message, send directly
        if (messages.length === 1) {
          this._sendMessageDirectly(messages[0]);
        } else {
          // Create a batch message
          const batch = {
            type: 'batch',
            messages: messages.map(m => ({
              id: m.id,
              data: m.data
            }))
          };
          
          // Send as a single message
          const batchId = this._generateMessageId();
          const batchObj = {
            id: batchId,
            data: batch,
            priority: messages[0].priority
          };
          
          this._sendMessageDirectly(batchObj);
          
          // Record each message in the metrics
          for (const msg of messages) {
            this.metrics.recordMessageSend(msg.id, 0, msg.priority);
          }
        }
        
        // Clear the batch
        this.currentBatch[priority] = [];
      }
    }
  }
  
  /**
   * Send a message directly over the WebSocket
   * @param {Object} messageObj - Message object
   * @private
   */
  _sendMessageDirectly(messageObj) {
    if (this.socket && this.state === ConnectionState.CONNECTED) {
      try {
        // Serialize the message
        const serialized = this._serializeMessage(messageObj);
        const size = typeof serialized === 'string' 
          ? serialized.length 
          : serialized.byteLength;
        
        // Send the message
        this.socket.send(serialized);
        
        // Record metrics
        this.metrics.recordMessageSend(messageObj.id, size, messageObj.priority);
      } catch (error) {
        this.metrics.recordError(error);
        this.emit('error', {
          type: 'send_error',
          error,
          message: messageObj
        });
      }
    } else {
      // Can't send, queue the message
      this._queueMessage(messageObj);
    }
  }
  
  /**
   * Parse an incoming message
   * @param {*} data - Raw message data
   * @returns {Object} Parsed message
   * @private
   */
  _parseMessage(data) {
    // Handle binary messages
    if (data instanceof ArrayBuffer) {
      // For now, just convert to string
      // In a real implementation, you'd handle binary formats properly
      const view = new Uint8Array(data);
      const str = Array.from(view)
        .map(b => String.fromCharCode(b))
        .join('');
      return JSON.parse(str);
    }
    
    // Handle text messages
    return JSON.parse(data);
  }
  
  /**
   * Serialize an outgoing message
   * @param {Object} messageObj - Message object
   * @returns {*} Serialized message
   * @private
   */
  _serializeMessage(messageObj) {
    // Simple JSON serialization
    // In a real implementation, you'd use a more efficient format for binary mode
    return JSON.stringify({
      id: messageObj.id,
      data: messageObj.data
    });
  }
  
  /**
   * Calculate reconnection backoff with jitter
   * @returns {number} Backoff time in ms
   * @private
   */
  _calculateBackoff() {
    const backoff = this.options.initialReconnectDelay * 
      Math.pow(this.options.backoffFactor, this.reconnectAttempts - 1);
    
    // Apply jitter to avoid thundering herd problem
    const jitter = backoff * this.options.jitterFactor;
    const randomJitter = Math.random() * jitter * 2 - jitter; // -jitter to +jitter
    
    const finalBackoff = Math.min(
      backoff + randomJitter,
      this.options.maxReconnectDelay
    );
    
    return Math.max(20, Math.floor(finalBackoff)); // Minimum 20ms
  }
  
  /**
   * Get the string name of a priority level
   * @param {number} priority - Priority level
   * @returns {string} Priority name
   * @private
   */
  _getPriorityName(priority) {
    switch (priority) {
      case Priority.CRITICAL: return 'critical';
      case Priority.HIGH: return 'high';
      case Priority.NORMAL: return 'normal';
      case Priority.LOW: return 'low';
      default: return 'normal';
    }
  }
}

// Export constants
export { ConnectionState, Priority };
