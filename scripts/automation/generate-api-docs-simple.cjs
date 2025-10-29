#!/usr/bin/env node

/**
 * Simple API Documentation Generator
 * Creates basic API documentation when TypeDoc fails
 */

const fs = require('fs');
const path = require('path');

const apiDocsDir = path.join(__dirname, '../../docs/api');

// Ensure directory exists
fs.mkdirSync(apiDocsDir, { recursive: true });

// Read package.json for project info
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

const apiDocs = `# SwissKnife API Documentation

**Version**: ${packageJson.version}
**Generated**: ${new Date().toISOString()}

## Overview

SwissKnife is a ${packageJson.description || 'revolutionary collaborative virtual desktop environment'}.

## Project Structure

This is a TypeScript/JavaScript project with multiple components:

### Main Components

1. **CLI Tool** (\`src/\`)
   - Entry point: \`src/entrypoints/cli.tsx\`
   - P2P integration and distributed task execution
   - AI-powered command assistance

2. **Web Desktop** (\`web/\`)
   - Entry point: \`web/main.ts\`
   - 27+ professional applications
   - Real-time collaboration features

3. **IPFS Accelerate** (\`ipfs_accelerate_js/\`)
   - Entry point: \`ipfs_accelerate_js/src/index.ts\`
   - Distributed computing
   - AI inference acceleration

## Key Modules

### AI Integration
- \`src/ai/service.ts\` - AI service integration
- \`src/ai/types.ts\` - AI type definitions

### Commands
- \`src/commands/\` - CLI command implementations
- Over 30+ commands for various operations

### Workers
- \`src/workers/\` - Background worker implementations
- \`web/workers/\` - Browser-side workers

### P2P Networking
- \`src/collaboration/\` - P2P collaboration engine
- Real-time state synchronization

### Utilities
- \`src/utils/\` - Shared utility functions
- \`web/src/utils/\` - Web-specific utilities

## Build Commands

\`\`\`bash
npm run build:all    # Build all components
npm run build:cli    # Build CLI only
npm run build:web    # Build web GUI only
npm run build:ipfs   # Build IPFS module only
\`\`\`

## Test Commands

\`\`\`bash
npm run test              # Run tests
npm run test:vite        # Vite integration tests
npm run test:browser     # Browser tests
npm run test:collaborative # P2P collaboration tests
\`\`\`

## Documentation Commands

\`\`\`bash
npm run docs:api             # Generate API documentation
npm run docs:complete-system # Generate comprehensive docs
\`\`\`

## Dependencies

### Main Dependencies
${Object.entries(packageJson.dependencies || {}).slice(0, 20).map(([name, version]) => 
  `- **${name}**: ${version}`
).join('\n')}

### Dev Dependencies
${Object.entries(packageJson.devDependencies || {}).slice(0, 20).map(([name, version]) => 
  `- **${name}**: ${version}`
).join('\n')}

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
   \`\`\`bash
   git clone https://github.com/endomorphosis/swissknife.git
   cd swissknife
   npm install --legacy-peer-deps
   \`\`\`

2. **Run Development Server**:
   \`\`\`bash
   npm run desktop:collaborative
   \`\`\`

3. **Build for Production**:
   \`\`\`bash
   npm run build:all
   \`\`\`

## For Programming Agents

When working with this codebase:

1. **Start with the codebase map**: See \`docs/agents/codebase-map.md\`
2. **Check TypeScript definitions**: All major types are defined in \`**/types.ts\` files
3. **Follow existing patterns**: Look at existing files in the same directory as examples
4. **Test your changes**: Run appropriate tests before committing
5. **Use the build system**: Always use npm scripts rather than direct tools

## Additional Resources

- **User Guide**: [README.md](../../README.md)
- **Developer Guide**: [docs/DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md)
- **Architecture**: [docs/UNIFIED_ARCHITECTURE.md](../UNIFIED_ARCHITECTURE.md)
- **Agent Documentation**: [docs/agents/README.md](../agents/README.md)

## License

${packageJson.license || 'AGPL-3.0'}

---

**Note**: For detailed API documentation of individual functions and classes, please refer to the inline JSDoc comments in the source code. This overview provides a high-level understanding of the project structure and key components.

**TypeDoc**: Full API documentation generation via TypeDoc requires proper TypeScript project references. If TypeDoc generation fails, refer to this overview for project structure understanding.
`;

fs.writeFileSync(path.join(apiDocsDir, 'README.md'), apiDocs);

console.log('✅ Basic API documentation generated successfully');
console.log('📁 Generated: docs/api/README.md');
