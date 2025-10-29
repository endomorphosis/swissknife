# SwissKnife Codebase Map for Programming Agents

Generated: 2025-10-29T04:23:27.311Z

## Purpose
Help programming agents understand and interact with the codebase

## Project Structure

### cli
- **Path**: `src/`
- **Description**: CLI tool with P2P integration

### web
- **Path**: `web/`
- **Description**: Virtual desktop with 27+ applications

### ipfs
- **Path**: `ipfs_accelerate_js/`
- **Description**: IPFS acceleration and distributed computing

### docs
- **Path**: `docs/`
- **Description**: Comprehensive documentation suite

## Entry Points

- **cli**: `src/entrypoints/cli.ts`
- **desktop**: `web/main.ts`
- **ipfs**: `ipfs_accelerate_js/src/index.ts`

## Key Features

- P2P collaboration
- AI integration (Hugging Face, OpenRouter)
- Distributed computing
- Virtual desktop environment
- Web workers architecture

## Build Commands

- **all**: `npm run build:all`
- **cli**: `npm run build:cli`
- **web**: `npm run build:web`
- **test**: `npm run test`

## Documentation Locations

- **api**: `docs/api/`
- **userGuide**: `README.md`
- **developer**: `docs/DEVELOPER_GUIDE.md`
- **architecture**: `docs/UNIFIED_ARCHITECTURE.md`

## API Documentation

Full API documentation is available in `docs/api/` generated via TypeDoc.

## For Agents

This codebase follows a unified architecture with:
1. TypeScript for type safety
2. Vite for building
3. Vitest for testing
4. P2P networking via libp2p
5. AI integration with multiple providers

Key patterns to understand:
- Event-driven architecture with custom event system
- Worker-based background processing
- Collaborative real-time state management
- Hybrid local + P2P + cloud computing
