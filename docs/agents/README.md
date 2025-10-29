# Documentation for Programming Agents

This directory contains documentation specifically designed to help programming agents (like AI assistants, MCP servers, and automated tools) understand and interact effectively with the SwissKnife codebase.

## 📚 Available Documentation

### Codebase Map (`codebase-map.md` / `codebase-map.json`)
A comprehensive overview of the project structure, entry points, key features, and navigation guide. This is the starting point for any programming agent working with this codebase.

**Contents:**
- Project structure and organization
- Entry points for each component (CLI, Web, IPFS)
- Key features and capabilities
- Build commands and workflows
- Documentation locations
- Architecture patterns and conventions

**Format:** Available in both Markdown (human-readable) and JSON (machine-parsable)

**Updated:** Automatically regenerated weekly by the documentation automation workflow

## 🤖 For Programming Agents

When working with the SwissKnife codebase, agents should:

1. **Start with the Codebase Map**: Read `codebase-map.md` or parse `codebase-map.json` to understand the overall structure
2. **Check API Documentation**: Refer to `docs/api/` for detailed TypeScript API documentation generated via TypeDoc
3. **Follow Architecture Patterns**: The codebase uses:
   - Event-driven architecture with custom event system
   - Worker-based background processing (compute, audio, AI, file workers)
   - TypeScript for type safety
   - Vite for building
   - Vitest for testing
   - P2P networking via libp2p
   - Collaborative real-time state management

4. **Key Directories**:
   - `src/` - CLI tool with P2P integration
   - `web/` - Virtual desktop with 27+ collaborative applications
   - `ipfs_accelerate_js/` - IPFS acceleration and distributed computing
   - `docs/` - All documentation
   - `test/` - Test suites

5. **Build & Test**:
   ```bash
   npm run build:all    # Build all components
   npm run test         # Run tests
   npm run test:vite    # Run Vite integration tests
   ```

6. **Documentation**:
   ```bash
   npm run docs:api             # Generate API documentation
   npm run docs:complete-system # Generate comprehensive docs
   ```

## 🔄 Automated Maintenance

This documentation is automatically maintained by the GitHub Actions workflow `.github/workflows/documentation-automation.yml` which runs:

- **Weekly**: Every Sunday at 2 AM UTC
- **On Code Changes**: When files in `src/`, `web/`, or `docs/` are modified
- **Manual Trigger**: Via workflow_dispatch for on-demand updates

### What Gets Updated Automatically:

1. **API Documentation** (`docs/api/`): Generated via TypeDoc from TypeScript source code
2. **Codebase Map** (`docs/agents/codebase-map.{md,json}`): Project structure and navigation guide
3. **Screenshots** (`docs/screenshots/`): Visual documentation of the desktop interface
4. **Application Documentation** (`docs/applications/`): Details about each of the 27+ desktop applications
5. **Quality Reports** (`docs/automation/`): Code quality, performance metrics, and link validation

## 📖 Related Documentation

- **API Reference**: `docs/api/` - Full TypeScript API documentation
- **Developer Guide**: `docs/DEVELOPER_GUIDE.md` - Comprehensive guide for developers
- **Architecture**: `docs/UNIFIED_ARCHITECTURE.md` - System architecture and design patterns
- **Getting Started**: `docs/GETTING_STARTED.md` - Quick start guide
- **User Documentation**: `README.md` - Main user-facing documentation

## 🎯 Purpose

The goal of this agent-specific documentation is to:

1. **Reduce Learning Curve**: Help agents quickly understand the codebase structure
2. **Improve Accuracy**: Provide clear, structured information to reduce hallucinations
3. **Enable Automation**: Support automated code analysis, generation, and maintenance tasks
4. **Facilitate Collaboration**: Help multiple agents work together on the codebase
5. **Maintain Currency**: Ensure documentation stays synchronized with code changes through automation

## 🔗 Integration with Tools

This documentation is designed to work with:

- **GitHub Copilot**: Enhanced code suggestions based on project structure
- **MCP Servers**: Model Context Protocol servers for agent integration
- **AI Assistants**: ChatGPT, Claude, and other AI coding assistants
- **Code Analysis Tools**: Static analysis and automated refactoring tools
- **Documentation Generators**: Automated documentation generation pipelines

## 📝 Contributing

While this documentation is primarily auto-generated, manual improvements are welcome:

1. Update the generation logic in `.github/workflows/documentation-automation.yml`
2. Enhance the codebase structure mapping in the workflow's Node.js inline script
3. Add more agent-friendly metadata to TypeScript files via JSDoc comments
4. Improve the TypeDoc configuration in `package.json` (`docs:api` script)

## 🚀 Quick Reference for Agents

```json
{
  "project": "SwissKnife",
  "type": "Multi-component TypeScript/JavaScript application",
  "components": ["CLI", "Web Desktop", "IPFS Accelerate"],
  "languages": ["TypeScript", "JavaScript"],
  "build_tool": "Vite",
  "test_framework": "Vitest",
  "package_manager": "npm",
  "architecture": "Unified monorepo with P2P collaboration",
  "key_features": [
    "Virtual desktop environment",
    "P2P collaboration",
    "AI integration (Hugging Face, OpenRouter)",
    "Distributed computing",
    "Web workers architecture"
  ],
  "entry_points": {
    "cli": "src/entrypoints/cli.ts",
    "web": "web/main.ts",
    "ipfs": "ipfs_accelerate_js/src/index.ts"
  },
  "documentation_update": "Weekly (Sunday 2 AM UTC) + On code changes"
}
```

---

**Last Updated**: Auto-generated by documentation automation workflow
**Maintainer**: GitHub Actions
**Schedule**: Weekly updates + on-demand via code changes
