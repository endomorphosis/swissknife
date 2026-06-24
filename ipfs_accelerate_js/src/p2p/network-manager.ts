// SwissKnife P2P Network Manager - Core LibP2P Integration
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { webTransport } from '@libp2p/webtransport'
import { mplex } from '@libp2p/mplex'
import { noise } from '@libp2p/noise'
import { kadDHT } from '@libp2p/kad-dht'
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery'
import { gossipsub } from '@libp2p/gossipsub'
import { multiaddr } from '@multiformats/multiaddr'
import { createFromJSON, createSecp256k1PeerId } from '@libp2p/peer-id'
import type { Libp2p } from 'libp2p'
import type { PeerId } from '@libp2p/peer-id'
import type { 
  MLPeer, 
  P2PConfig, 
  P2PMessage, 
  P2PEvents, 
  NetworkTopology,
  NetworkRegion,
  PeerCapabilities 
} from './types.js'

export class SwissKnifeP2PNetworkManager {
  private libp2p: Libp2p | null = null
  private config: P2PConfig
  private peers: Map<string, MLPeer> = new Map()
  private eventListeners: Map<keyof P2PEvents, Set<Function>> = new Map()
  private heartbeatInterval: NodeJS.Timeout | null = null
  private isStarted: boolean = false
  private capabilities: PeerCapabilities | null = null

  constructor(config: P2PConfig) {
    this.config = config
    this.initializeEventMaps()
  }

  private initializeEventMaps(): void {
    const events: (keyof P2PEvents)[] = [
      'peer:connected', 'peer:disconnected', 'peer:updated',
      'task:assigned', 'task:completed', 'task:failed',
      'model:shared', 'resource:offered', 'message:received',
      'network:topology_changed'
    ]
    
    events.forEach(event => {
      this.eventListeners.set(event, new Set())
    })
  }

  // Initialize LibP2P node
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('P2P Network Manager already started')
    }

    try {
      // Detect local capabilities
      this.capabilities = await this.detectCapabilities()
      
      // Create LibP2P node configuration
      const libp2pConfig = await this.createLibp2pConfig()
      
      // Initialize LibP2P
      this.libp2p = await createLibp2p(libp2pConfig)
      
      // Set up event handlers
      this.setupEventHandlers()
      
      // Start the node
      await this.libp2p.start()
      
      console.log(`SwissKnife P2P Node started with PeerId: ${this.libp2p.peerId}`)
      console.log(`Listening on addresses:`, this.libp2p.getMultiaddrs())
      
      // Start heartbeat for peer management
      this.startHeartbeat()
      
      // Announce capabilities
      await this.announceCapabilities()
      
      this.isStarted = true
      
    } catch (error) {
      console.error('Failed to start P2P network manager:', error)
      throw error
    }
  }

  // Stop LibP2P node
  async stop(): Promise<void> {
    if (!this.isStarted || !this.libp2p) {
      return
    }

    try {
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval)
        this.heartbeatInterval = null
      }

      // Stop LibP2P
      await this.libp2p.stop()
      this.libp2p = null
      this.isStarted = false
      
      console.log('SwissKnife P2P Network Manager stopped')
      
    } catch (error) {
      console.error('Error stopping P2P network manager:', error)
      throw error
    }
  }

  // Create LibP2P configuration
  private async createLibp2pConfig(): Promise<any> {
    const isNode = typeof window === 'undefined'
    
    return {
      addresses: {
        listen: this.config.network.listenAddresses
      },
      transports: isNode 
        ? [tcp(), webSockets()]
        : [webSockets(), webRTC(), webTransport()],
      streamMuxers: [mplex()],
      connectionEncryption: [noise()],
      services: {
        dht: this.config.dht.enabled ? kadDHT({
          kBucketSize: this.config.dht.bucketSize,
          clientMode: !isNode // Browser nodes typically run in client mode
        }) : undefined,
        pubsub: gossipsub({
          emitSelf: false,
          globalSignaturePolicy: 'StrictSign'
        }),
        pubsubPeerDiscovery: pubsubPeerDiscovery({
          interval: 1000,
          topics: ['swissknife-ml-discovery']
        })
      },
      connectionManager: {
        maxConnections: this.config.network.maxConnections,
        minConnections: this.config.network.minConnections
      },
      connectionGater: {
        denyDialPeer: async (peerId: PeerId) => {
          return this.config.security.bannedPeers.some(
            banned => banned.equals(peerId)
          )
        }
      }
    }
  }

  // Set up LibP2P event handlers
  private setupEventHandlers(): void {
    if (!this.libp2p) return

    // Connection events
    this.libp2p.addEventListener('peer:connect', (evt) => {
      this.handlePeerConnected(evt.detail)
    })

    this.libp2p.addEventListener('peer:disconnect', (evt) => {
      this.handlePeerDisconnected(evt.detail)
    })

    // Pubsub message handling
    this.libp2p.services.pubsub?.addEventListener('message', (evt) => {
      this.handlePubsubMessage(evt.detail)
    })

    // DHT events
    if (this.libp2p.services.dht) {
      this.libp2p.services.dht.addEventListener('peer', (evt) => {
        this.handleDHTDiscovery(evt.detail)
      })
    }
  }

  // Handle peer connection
  private async handlePeerConnected(peerId: PeerId): Promise<void> {
    console.log(`Peer connected: ${peerId}`)
    
    const peer: MLPeer = {
      id: peerId,
      multiaddrs: [],
      capabilities: await this.requestPeerCapabilities(peerId),
      lastSeen: new Date(),
      status: 'connected',
      reputation: 0
    }
    
    this.peers.set(peerId.toString(), peer)
    this.emit('peer:connected', peer)
    
    // Subscribe to ML topics for this peer
    await this.subscribeToMLTopics()
  }

  // Handle peer disconnection
  private handlePeerDisconnected(peerId: PeerId): void {
    console.log(`Peer disconnected: ${peerId}`)
    
    const peer = this.peers.get(peerId.toString())
    if (peer) {
      peer.status = 'disconnected'
      this.emit('peer:disconnected', peerId)
    }
  }

  // Handle pubsub messages
  private handlePubsubMessage(evt: any): void {
    try {
      const message: P2PMessage = JSON.parse(
        new TextDecoder().decode(evt.data)
      )
      
      this.emit('message:received', message)
      
      // Route message based on type
      switch (message.type) {
        case 'capability_announcement':
          this.handleCapabilityAnnouncement(message)
          break
        case 'peer_discovery':
          this.handlePeerDiscovery(message)
          break
        case 'heartbeat':
          this.handleHeartbeat(message)
          break
        default:
          console.log(`Received ${message.type} message from ${message.from}`)
      }
      
    } catch (error) {
      console.error('Error handling pubsub message:', error)
    }
  }

  // Handle DHT peer discovery
  private handleDHTDiscovery(evt: any): void {
    console.log(`Discovered peer via DHT: ${evt.id}`)
    // Additional DHT-specific handling can be added here
  }

  // Detect local hardware capabilities
  private async detectCapabilities(): Promise<PeerCapabilities> {
    const capabilities: PeerCapabilities = {
      gpu: {
        available: false,
        type: 'webgpu',
        memory: 0,
        computeUnits: 1,
        supportedFeatures: []
      },
      frameworks: {
        webgpu: false,
        webnn: false,
        onnx: false,
        tensorflow: false,
        pytorch: false
      },
      resources: {
        cpuCores: navigator.hardwareConcurrency || 4,
        totalMemory: (navigator as any).deviceMemory 
          ? (navigator as any).deviceMemory * 1024 
          : 4096,
        availableMemory: 2048, // Conservative estimate
        networkBandwidth: 100, // Conservative estimate
        storageSpace: 1024 // Conservative estimate
      },
      operations: {
        inference: true,
        training: false,
        modelSharding: true,
        dataProcessing: true,
        distributedCompute: true
      }
    }

    // Detect WebGPU support
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter()
        if (adapter) {
          capabilities.gpu.available = true
          capabilities.gpu.type = 'webgpu'
          capabilities.frameworks.webgpu = true
          
          const limits = adapter.limits
          if (limits) {
            capabilities.gpu.memory = limits.maxBufferSize 
              ? Math.floor(limits.maxBufferSize / (1024 * 1024))
              : 1024
            capabilities.gpu.computeUnits = limits.maxComputeWorkgroupsPerDimension || 1
          }
          
          const features = Array.from(adapter.features || [])
          capabilities.gpu.supportedFeatures = features
        }
      } catch (error) {
        console.warn('WebGPU detection failed:', error)
      }
    }

    // Detect WebNN support
    if (typeof window !== 'undefined' && 'ml' in window) {
      capabilities.frameworks.webnn = true
    }

    // Check for ONNX.js support
    if (typeof window !== 'undefined') {
      try {
        // Simple check for ONNX.js availability
        capabilities.frameworks.onnx = typeof (window as any).ort !== 'undefined'
      } catch (error) {
        // ONNX.js not available
      }
    }

    return capabilities
  }

  // Announce capabilities to the network
  private async announceCapabilities(): Promise<void> {
    if (!this.libp2p || !this.capabilities) return

    const message: P2PMessage = {
      id: `cap-${Date.now()}`,
      from: this.libp2p.peerId,
      type: 'capability_announcement',
      timestamp: new Date(),
      data: {
        capabilities: this.capabilities,
        version: '0.1.0',
        nodeType: 'swissknife-ml'
      }
    }

    await this.broadcast(message)
  }

  // Subscribe to ML-specific topics
  private async subscribeToMLTopics(): Promise<void> {
    if (!this.libp2p?.services.pubsub) return

    const topics = [
      'swissknife-ml-discovery',
      'swissknife-ml-tasks',
      'swissknife-ml-models',
      'swissknife-ml-resources',
      'swissknife-ml-announcements'
    ]

    for (const topic of topics) {
      try {
        await this.libp2p.services.pubsub.subscribe(topic)
        console.log(`Subscribed to topic: ${topic}`)
      } catch (error) {
        console.error(`Failed to subscribe to ${topic}:`, error)
      }
    }
  }

  // Broadcast message to all peers
  async broadcast(message: P2PMessage, topic: string = 'swissknife-ml-announcements'): Promise<void> {
    if (!this.libp2p?.services.pubsub) {
      throw new Error('Pubsub not available')
    }

    const data = new TextEncoder().encode(JSON.stringify(message))
    await this.libp2p.services.pubsub.publish(topic, data)
  }

  // Send direct message to specific peer
  async sendToPeer(peerId: PeerId, message: P2PMessage): Promise<void> {
    if (!this.libp2p) {
      throw new Error('LibP2P not started')
    }

    try {
      const stream = await this.libp2p.dialProtocol(peerId, '/swissknife/ml/1.0.0')
      const data = new TextEncoder().encode(JSON.stringify(message))
      
      await stream.sink([data])
      await stream.close()
      
    } catch (error) {
      console.error(`Failed to send message to peer ${peerId}:`, error)
      throw error
    }
  }

  // Start heartbeat system
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat()
      this.cleanupDisconnectedPeers()
    }, this.config.network.heartbeatInterval)
  }

  // Send heartbeat message
  private async sendHeartbeat(): Promise<void> {
    if (!this.libp2p) return

    const message: P2PMessage = {
      id: `hb-${Date.now()}`,
      from: this.libp2p.peerId,
      type: 'heartbeat',
      timestamp: new Date(),
      data: {
        status: 'active',
        capabilities: this.capabilities
      }
    }

    await this.broadcast(message, 'swissknife-ml-discovery')
  }

  // Clean up disconnected peers
  private cleanupDisconnectedPeers(): void {
    const now = new Date()
    const timeout = this.config.network.connectionTimeout

    for (const [peerId, peer] of this.peers.entries()) {
      const timeSinceLastSeen = now.getTime() - peer.lastSeen.getTime()
      
      if (timeSinceLastSeen > timeout && peer.status === 'connected') {
        peer.status = 'disconnected'
        this.emit('peer:disconnected', peer.id)
      }
      
      // Remove peers that have been disconnected for too long
      if (timeSinceLastSeen > timeout * 3) {
        this.peers.delete(peerId)
      }
    }
  }

  // Event handling methods
  private handleCapabilityAnnouncement(message: P2PMessage): void {
    const peer = this.peers.get(message.from.toString())
    if (peer) {
      peer.capabilities = message.data.capabilities
      peer.lastSeen = new Date()
      this.emit('peer:updated', peer)
    }
  }

  private handlePeerDiscovery(message: P2PMessage): void {
    console.log(`Peer discovery message from ${message.from}`)
  }

  private handleHeartbeat(message: P2PMessage): void {
    const peer = this.peers.get(message.from.toString())
    if (peer) {
      peer.lastSeen = new Date()
      peer.status = 'connected'
    }
  }

  // Request capabilities from a specific peer
  private async requestPeerCapabilities(peerId: PeerId): Promise<PeerCapabilities> {
    // Default capabilities - in a real implementation, this would
    // involve requesting capabilities from the peer
    return {
      gpu: { available: false, type: 'webgpu', memory: 0, computeUnits: 1, supportedFeatures: [] },
      frameworks: { webgpu: false, webnn: false, onnx: false, tensorflow: false, pytorch: false },
      resources: { cpuCores: 4, totalMemory: 4096, availableMemory: 2048, networkBandwidth: 100, storageSpace: 1024 },
      operations: { inference: true, training: false, modelSharding: true, dataProcessing: true, distributedCompute: true }
    }
  }

  // Public getters
  get peerId(): PeerId | null {
    return this.libp2p?.peerId || null
  }

  get connectedPeers(): MLPeer[] {
    return Array.from(this.peers.values()).filter(peer => peer.status === 'connected')
  }

  private calculateNetworkRegions(peers: MLPeer[]): NetworkRegion[] {
    const regionsByKey = new Map<string, MLPeer[]>()

    peers.forEach(peer => {
      const regionKey = this.determineRegionKey(peer)
      const regionPeers = regionsByKey.get(regionKey) || []
      regionPeers.push(peer)
      regionsByKey.set(regionKey, regionPeers)
    })

    return Array.from(regionsByKey.entries()).map(([regionId, regionPeers]) => ({
      id: regionId,
      peers: regionPeers.map(peer => peer.id),
      averageLatency: 0,
      totalCapacity: this.aggregateRegionCapabilities(regionPeers)
    }))
  }

  private determineRegionKey(peer: MLPeer): string {
    const capabilities = peer.capabilities

    if (capabilities.gpu.available && capabilities.gpu.memory >= 4096) {
      return 'gpu-high-memory'
    }

    if (capabilities.gpu.available) {
      return 'gpu-standard'
    }

    if (capabilities.resources.cpuCores >= 8) {
      return 'cpu-high-core'
    }

    return 'cpu-standard'
  }

  private aggregateRegionCapabilities(peers: MLPeer[]): PeerCapabilities {
    const gpuPeer = peers.find(peer => peer.capabilities.gpu.available)
    const supportedFeatures = new Set<string>()

    peers.forEach(peer => {
      peer.capabilities.gpu.supportedFeatures.forEach(feature => {
        supportedFeatures.add(feature)
      })
    })

    return {
      gpu: {
        available: peers.some(peer => peer.capabilities.gpu.available),
        type: gpuPeer?.capabilities.gpu.type || 'webgpu',
        memory: peers.reduce((sum, peer) => sum + peer.capabilities.gpu.memory, 0),
        computeUnits: peers.reduce((sum, peer) => sum + peer.capabilities.gpu.computeUnits, 0),
        supportedFeatures: Array.from(supportedFeatures)
      },
      frameworks: {
        webgpu: peers.some(peer => peer.capabilities.frameworks.webgpu),
        webnn: peers.some(peer => peer.capabilities.frameworks.webnn),
        onnx: peers.some(peer => peer.capabilities.frameworks.onnx),
        tensorflow: peers.some(peer => peer.capabilities.frameworks.tensorflow),
        pytorch: peers.some(peer => peer.capabilities.frameworks.pytorch)
      },
      resources: {
        cpuCores: peers.reduce((sum, peer) => sum + peer.capabilities.resources.cpuCores, 0),
        totalMemory: peers.reduce((sum, peer) => sum + peer.capabilities.resources.totalMemory, 0),
        availableMemory: peers.reduce((sum, peer) => sum + peer.capabilities.resources.availableMemory, 0),
        networkBandwidth: peers.reduce((sum, peer) => sum + peer.capabilities.resources.networkBandwidth, 0),
        storageSpace: peers.reduce((sum, peer) => sum + peer.capabilities.resources.storageSpace, 0)
      },
      operations: {
        inference: peers.some(peer => peer.capabilities.operations.inference),
        training: peers.some(peer => peer.capabilities.operations.training),
        modelSharding: peers.some(peer => peer.capabilities.operations.modelSharding),
        dataProcessing: peers.some(peer => peer.capabilities.operations.dataProcessing),
        distributedCompute: peers.some(peer => peer.capabilities.operations.distributedCompute)
      }
    }
  }

  get networkTopology(): NetworkTopology {
    const connectedPeers = this.connectedPeers

    return {
      totalPeers: this.peers.size,
      connectedPeers: connectedPeers.length,
      networkRegions: this.calculateNetworkRegions(connectedPeers),
      averageLatency: 50, // TODO: Calculate real latency
      bandwidth: 100, // TODO: Calculate real bandwidth
      reliability: 0.95 // TODO: Calculate real reliability
    }
  }

  // Event system
  on<K extends keyof P2PEvents>(event: K, listener: P2PEvents[K]): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.add(listener)
    }
  }

  off<K extends keyof P2PEvents>(event: K, listener: P2PEvents[K]): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(listener)
    }
  }

  private emit<K extends keyof P2PEvents>(event: K, ...args: Parameters<P2PEvents[K]>): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args)
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error)
        }
      })
    }
  }
}
