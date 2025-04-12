# Contributing to SwissKnife

Thank you for your interest in contributing to the SwissKnife project! This document provides guidelines for contributors to ensure a smooth collaboration process.

## Getting Started

1. Make sure you've read the [Getting Started guide](./GETTING_STARTED.md) to set up your development environment.
2. Familiarize yourself with the project structure and coding conventions as outlined in the main [CLAUDE.md](../CLAUDE.md) file.

## Development Workflow

### 1. Setting Up Your Environment

Make sure your development environment is properly set up:

```bash
# Install dependencies
npm install  # or pnpm install

# Run the development server
npm run dev  # or pnpm run dev
```

### 2. Writing Code

When writing code for SwissKnife, follow these guidelines:

- **Use TypeScript**: All code should be written in TypeScript with proper type annotations.
- **Follow Code Style**: Adhere to the code style guidelines in [CLAUDE.md](../CLAUDE.md).
- **Component Structure**: 
  - React components should be functional components with hooks.
  - Components should be in PascalCase (e.g., `ModelSelector.tsx`).
  - Utility functions should be in camelCase.

### 3. Testing Your Changes

Always test your changes before submitting a pull request:

```bash
# Run the linter
npm run lint

# Run unit tests
npm test

# Format code
npm run format
```

### 4. Handling API Keys and Configuration

When working with API keys and configuration:

- Never hardcode API keys
- Always check environment variables first
- Add keys to the configuration when found
- Handle missing keys gracefully
- Use session state for temporary values only
- Reset session state when changing configuration

## Build Process

Please read [BUILD_PROCESS.md](./BUILD_PROCESS.md) for detailed information about the SwissKnife build process, including:

- Different build approaches (`dev`, `build`, `build:tsx`, `build:bun`, etc.)
- Common build issues and solutions
- Best practices for handling dependencies

If you encounter issues during development or building, refer to [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for solutions to common problems.

### Build Guidelines

When working with the SwissKnife codebase, follow these build guidelines:

1. **Use appropriate build scripts**:
   - `npm run dev` for local development
   - `npm run build` for production builds
   - `npm run build:tsx` if you encounter bundling issues

2. **Handle dependencies carefully**:
   - Be cautious with terminal UI libraries (chalk, ink, kleur)
   - Properly handle Node.js built-in modules
   - Test thoroughly after adding new dependencies

3. **Test all builds**:
   - Verify color formatting works correctly
   - Check that all commands and features function as expected
   - Test on different platforms if possible

## Making Changes to Models

### Adding a New Model Provider

1. Update `src/constants/models.ts`:
   - Add new models to the provider's array
   - Include all required fields (tokens, costs, capabilities)
   - Add the provider to the `providers` object with name and baseURL

2. Update `ModelSelector.tsx`:
   - Add provider-specific handling if needed
   - Ensure API key handling works correctly

3. Add any necessary API client code.

### Updating Existing Models

When updating existing model information:

1. Ensure all properties are consistent with other models
2. Update pricing information if needed
3. Add new capability flags as required
4. Test the model selection and API key handling

## Common Issues and Solutions

### API Key Persistence

When implementing features that use API keys:

- Store API keys in the config, not session state
- Use `addApiKey()` to add keys to the config
- Check both config and environment variables
- Reset session state indices when changing providers

### URL Consistency

For Lilypad API endpoints:
- Always use `https://anura-testnet.lilypad.tech/` in both code and documentation
- Update any references to other URLs to maintain consistency

## Pull Request Process

1. **Fork the Repository**: Create your own fork of the repository.
2. **Create a Branch**: Work on a feature branch named according to what you're implementing.
3. **Write Code**: Implement your changes following the coding guidelines.
4. **Test**: Make sure all tests pass and add new tests for new functionality.
5. **Document**: Update or add documentation as needed.
6. **Submit PR**: Create a pull request with a clear description of your changes.

## Code Review Process

Pull requests will be reviewed for:

1. **Code Quality**: Does the code follow our style guidelines?
2. **Functionality**: Does it work as expected?
3. **Tests**: Are there appropriate tests?
4. **Documentation**: Is the code and functionality well-documented?

## Documentation

Good documentation is essential:

1. **Code Comments**: Use JSDoc-style comments for functions and complex logic.
2. **Markdown Files**: Update or add markdown files in the `docs/` directory for major features.
3. **TypeScript Types**: Ensure proper type definitions that serve as documentation.

## Best Practices

### Configuration Management

- Use the `getGlobalConfig()` and `saveGlobalConfig()` functions
- Check if configuration exists before using it
- Provide useful error messages for missing configuration

### Session State

- Use session state for temporary values only
- Reset session state values when appropriate
- Don't rely on session state for persistent data

### API Integration

- Handle API errors gracefully
- Provide useful error messages to users
- Use environment variables for API keys when available
- Add timeouts and retry logic for unreliable endpoints

## Questions?

If you have questions about contributing, please:

1. Check existing documentation
2. Review code for similar patterns
3. Ask for help if needed

Thank you for contributing to SwissKnife!
