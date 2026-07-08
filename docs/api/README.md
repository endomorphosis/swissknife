# SwissKnife API Documentation

**Version**: 0.0.53
**Generated**: 2025-10-29T04:25:38.018Z

## Overview

SwissKnife is a Use swissknife, an AI assistant, right from your terminal. swissknife can understand your codebase, edit files, run terminal commands, and handle entire workflows for you..

## Project Structure

This is a TypeScript/JavaScript project with multiple components:

### Main Components

1. **CLI Tool** (`src/`)
   - Entry point: `src/entrypoints/cli.tsx`
   - P2P integration and distributed task execution
   - AI-powered command assistance

2. **Web Desktop** (`web/`)
   - Entry point: `web/main.ts`
   - 27+ professional applications
   - Real-time collaboration features

3. **IPFS Accelerate** (`ipfs_accelerate_js/`)
   - Entry point: `ipfs_accelerate_js/src/index.ts`
   - Distributed computing
   - AI inference acceleration

## Key Modules

### AI Integration
- `src/ai/service.ts` - AI service integration
- `src/ai/types.ts` - AI type definitions

### Commands
- `src/commands/` - CLI command implementations
- Over 30+ commands for various operations

### Workers
- `src/workers/` - Background worker implementations
- `web/workers/` - Browser-side workers

### P2P Networking
- `src/collaboration/` - P2P collaboration engine
- Real-time state synchronization

### Utilities
- `src/utils/` - Shared utility functions
- `web/src/utils/` - Web-specific utilities

## Build Commands

```bash
npm run build:all    # Build all components
npm run build:cli    # Build CLI only
npm run build:web    # Build web GUI only
npm run build:ipfs   # Build IPFS module only
```

## Test Commands

```bash
npm run test              # Run tests
npm run test:vite        # Vite integration tests
npm run test:browser     # Browser tests
npm run test:collaborative # P2P collaboration tests
```

## Documentation Commands

```bash
npm run docs:api             # Generate API documentation
npm run docs:complete-system # Generate comprehensive docs
```

## Dependencies

### Main Dependencies
- **@anthropic-ai/bedrock-sdk**: ^0.12.4
- **@anthropic-ai/claude-code**: ^0.2.29
- **@anthropic-ai/sdk**: ^0.39.0
- **@anthropic-ai/vertex-sdk**: ^0.7.0
- **@commander-js/extra-typings**: ^12.0.0
- **@iarna/toml**: ^2.2.5
- **@inkjs/ui**: ^2.0.0
- **@modelcontextprotocol/sdk**: ^1.12.1
- **@multiformats/multiaddr**: ^12.1.14
- **@sentry/node**: ^9.3.0
- **@statsig/js-client**: ^3.12.2
- **@types/lodash-es**: ^4.17.12
- **ansi-colors**: ^4.1.3
- **ansi-escapes**: ^7.0.0
- **assert**: ^2.1.0
- **buffer**: ^6.0.3
- **chalk**: ^4.1.2
- **cli-highlight**: ^2.1.11
- **cli-table3**: ^0.6.5
- **commander**: ^12.0.0

### Dev Dependencies
- **jest-cli**: 29.7.0
- **jest-util**: 29.7.0
- **@babel/core**: ^7.17.0
- **@babel/plugin-proposal-class-properties**: ^7.18.6
- **@babel/plugin-transform-class-properties**: ^7.27.1
- **@babel/plugin-transform-private-methods**: ^7.27.1
- **@babel/plugin-transform-runtime**: ^7.27.4
- **@babel/preset-env**: ^7.16.0
- **@babel/preset-react**: ^7.27.1
- **@babel/preset-typescript**: ^7.27.1
- **@babel/runtime**: ^7.17.0
- **@jest/globals**: ^27.5.1
- **@lhci/cli**: ^0.12.0
- **@playwright/test**: ^1.55.0
- **@types/chai**: ^5.2.2
- **@types/diff**: ^7.0.2
- **@types/ink**: ^0.5.2
- **@types/ink-testing-library**: ^1.0.4
- **@types/jest**: ^29.5.12
- **@types/minimist**: ^1.2.5

## TypeScript Configuration

The project uses TypeScript with the following key configurations:
- **Target**: ES2022
- **Module**: NodeNext
- **Build Tool**: Vite
- **Test Framework**: Vitest

## Architecture Patterns

1. **Event-Driven**: Custom event system for component communication
2. **Worker-Based**: Background processing via Web Workers
3. **P2P Networking**: libp2p for peer-to-peer communication
4. **Type-Safe**: Full TypeScript coverage
5. **Modular**: Component-based architecture

## Getting Started for Developers

1. **Clone and Install**:
   ```bash
   git clone https://github.com/endomorphosis/swissknife.git
   cd swissknife
   npm install --legacy-peer-deps
   ```

2. **Run Development Server**:
   ```bash
   npm run desktop:collaborative
   ```

3. **Build for Production**:
   ```bash
   npm run build:all
   ```

## For Programming Agents

When working with this codebase:

1. **Start with the codebase map**: See `docs/agents/codebase-map.md`
2. **Check TypeScript definitions**: All major types are defined in `**/types.ts` files
3. **Follow existing patterns**: Look at existing files in the same directory as examples
4. **Test your changes**: Run appropriate tests before committing
5. **Use the build system**: Always use npm scripts rather than direct tools

## Additional Resources

- **User Guide**: [README.md](../../README.md)
- **Developer Guide**: [docs/DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md)
- **Architecture**: [docs/UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md)
- **Agent Documentation**: [docs/agents/README.md](../agents/README.md)

## License

AGPL-3.0

---

**Note**: For detailed API documentation of individual functions and classes, please refer to the inline JSDoc comments in the source code. This overview provides a high-level understanding of the project structure and key components.

**TypeDoc**: Full API documentation generation via TypeDoc requires proper TypeScript project references. If TypeDoc generation fails, refer to this overview for project structure understanding.
