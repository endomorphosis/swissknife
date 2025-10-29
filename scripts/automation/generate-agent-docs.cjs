#!/usr/bin/env node

/**
 * Generate Agent Codebase Map
 * Creates structured documentation for programming agents
 */

const fs = require('fs');
const path = require('path');

try {
  // Create agent-friendly documentation
  const agentDocs = {
    generated: new Date().toISOString(),
    purpose: 'Help programming agents understand and interact with the codebase',
    structure: {
      cli: { path: 'src/', description: 'CLI tool with P2P integration' },
      web: { path: 'web/', description: 'Virtual desktop with 27+ applications' },
      ipfs: { path: 'ipfs_accelerate_js/', description: 'IPFS acceleration and distributed computing' },
      docs: { path: 'docs/', description: 'Comprehensive documentation suite' }
    },
    entryPoints: {
      cli: 'src/entrypoints/cli.ts',
      desktop: 'web/main.ts',
      ipfs: 'ipfs_accelerate_js/src/index.ts'
    },
    keyFeatures: [
      'P2P collaboration',
      'AI integration (Hugging Face, OpenRouter)',
      'Distributed computing',
      'Virtual desktop environment',
    'Web workers architecture'
  ],
  buildCommands: {
    all: 'npm run build:all',
    cli: 'npm run build:cli',
    web: 'npm run build:web',
    test: 'npm run test'
  },
  documentation: {
    api: 'docs/api/',
    userGuide: 'README.md',
    developer: 'docs/DEVELOPER_GUIDE.md',
    architecture: 'docs/UNIFIED_ARCHITECTURE.md'
  }
};

// Create directory with error handling
try {
  fs.mkdirSync('docs/agents', { recursive: true });
} catch (error) {
  console.error('❌ Failed to create docs/agents directory:', error.message);
  process.exit(1);
}

// Write JSON file with error handling
try {
  fs.writeFileSync(
    'docs/agents/codebase-map.json',
    JSON.stringify(agentDocs, null, 2)
  );
} catch (error) {
  console.error('❌ Failed to write codebase-map.json:', error.message);
  process.exit(1);
}

// Create markdown version for easy reading
const mdContent = `# SwissKnife Codebase Map for Programming Agents

Generated: ${agentDocs.generated}

## Purpose
${agentDocs.purpose}

## Project Structure

${Object.entries(agentDocs.structure).map(([key, val]) => 
  `### ${key}\n- **Path**: \`${val.path}\`\n- **Description**: ${val.description}`
).join('\n\n')}

## Entry Points

${Object.entries(agentDocs.entryPoints).map(([key, val]) => 
  `- **${key}**: \`${val}\``
).join('\n')}

## Key Features

${agentDocs.keyFeatures.map(f => `- ${f}`).join('\n')}

## Build Commands

${Object.entries(agentDocs.buildCommands).map(([key, val]) => 
  `- **${key}**: \`${val}\``
).join('\n')}

## Documentation Locations

${Object.entries(agentDocs.documentation).map(([key, val]) => 
  `- **${key}**: \`${val}\``
).join('\n')}

## API Documentation

Full API documentation is available in \`docs/api/\` generated via TypeDoc.

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
`;

// Write markdown file with error handling
try {
  fs.writeFileSync('docs/agents/codebase-map.md', mdContent);
  console.log('✅ Agent documentation generated successfully');
} catch (error) {
  console.error('❌ Failed to write codebase-map.md:', error.message);
  process.exit(1);
}

} catch (error) {
  console.error('❌ Unexpected error during agent documentation generation:', error.message);
  console.error(error.stack);
  process.exit(1);
}
