// Mock browser APIs needed by @statsig/js-client in Node.js environment

// Document mock with visibility state tracking
const mockDocument = {
  visibilityState: 'visible' as const,
  documentElement: {
    lang: 'en',
  },
  addEventListener: (
    _event: string,
    _handler: EventListenerOrEventListenerObject,
  ) => {
    // Visibility change events are handled through window.document reference
  },
} as const

// Window mock with focus/blur and beforeunload handling
export const mockWindow = {
  document: mockDocument,
  location: {
    href: 'node://localhost',
    pathname: '/',
  },
  addEventListener: (
    event: string,
    handler: EventListenerOrEventListenerObject,
  ) => {
    if (event === 'beforeunload') {
      // Capture beforeunload handlers and run them on process exit
      process.on('exit', () => {
        if (typeof handler === 'function') {
          handler({} as Event)
        } else {
          handler.handleEvent({} as Event)
        }
      })
    }
    // Other events (focus/blur) are not critically needed in Node.js
  },
  focus: () => {
    // Focus is a no-op in Node.js
  },
  innerHeight: 768,
  innerWidth: 1024,
} as const

// Navigator mock with minimal beacon support
export const mockNavigator = {
  sendBeacon: (_url: string, _data: string | Blob): boolean => {
    // Beacons are used for analytics - return success but don't actually send
    return true
  },
  userAgent:
    'Mozilla/5.0 (Node.js) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0',
  language: 'en-US',
} as const

// Only assign mocks if running in Node.js environment
if (typeof window === 'undefined') {
  // @ts-expect-error: intentionally applying partial mocks for Node.js environment
  global.window = mockWindow
}
if (typeof navigator === 'undefined') {
  // @ts-expect-error: intentionally applying partial mocks for Node.js environment
  global.navigator = mockNavigator
}
