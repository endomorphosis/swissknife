import { logger } from '../utils/logger';

/**
 * Manages the registration and retrieval of CLI commands.
 */
export class CommandRegistry {
  /**
   * @private
   * @type {Map<string, import('../types/cli.js').Command>}
   */
  #commands = new Map();

  /**
   * @private
   * @type {Map<string, string>}
   */
  #aliases = new Map();

  /**
   * Register a command in the registry.
   * @param {import('../types/cli.js').Command} command - The command to register
   * @throws {Error} If the command has invalid properties
   */
  register(command) {
    // Validate command properties
    if (!command.name || command.name.trim() === '') {
      throw new Error('Command registration failed: Command name cannot be empty.');
    }

    if (!command.description || command.description.trim() === '') {
      throw new Error(`Command registration failed: Command description cannot be empty for command '${command.name}'.`);
    }

    if (!command.handler || typeof command.handler !== 'function') {
      throw new Error(`Command registration failed: Command handler is required for command '${command.name}'.`);
    }

    // If command already exists, log warning and overwrite
    if (this.#commands.has(command.name)) {
      logger.warn(`Command '${command.name}' already registered. Overwriting.`);
    }

    // Register command
    this.#commands.set(command.name, command);
  }

  /**
   * Register an alias for an existing command.
   * @param {string} alias - The alias name
   * @param {string} commandName - The name of the target command
   * @returns {boolean} Whether the alias was successfully registered
   */
  registerAlias(alias, commandName) {
    // Check if alias conflicts with an existing command
    if (this.#commands.has(alias)) {
      logger.warn(`Alias '${alias}' conflicts with an existing command name. Alias not registered.`);
      return false;
    }

    // Check if the target command exists
    if (!this.#commands.has(commandName)) {
      logger.warn(`Cannot register alias '${alias}': Target command '${commandName}' not found.`);
      return false;
    }

    // Register the alias
    this.#aliases.set(alias, commandName);
    return true;
  }

  /**
   * Get a command by name or alias.
   * @param {string} nameOrAlias - The command name or alias
   * @returns {import('../types/cli.js').Command|undefined} The command if found, undefined otherwise
   */
  getCommand(nameOrAlias) {
    // Direct lookup by command name
    if (this.#commands.has(nameOrAlias)) {
      return this.#commands.get(nameOrAlias);
    }

    // Lookup by alias
    const targetCommand = this.#aliases.get(nameOrAlias);
    if (targetCommand) {
      return this.#commands.get(targetCommand);
    }

    return undefined;
  }

  /**
   * List all registered commands.
   * @returns {import('../types/cli.js').Command[]} Array of all registered commands
   */
  listCommands() {
    return Array.from(this.#commands.values());
  }
}
