// src/cli/commands/agent/chat.ts
import { Command } from 'commander';
import { createReadlineInterface } from '../../../utils/readline';
import { AIService } from '../../../ai/service';
import { createExecutionContext } from '../../../commands/context';
import { logger } from '../../../utils/logger';
import chalk from 'chalk';

interface ChatCommandOptions {
  model?: string;
  system?: string;
  temp?: number;
  noHistory?: boolean;
  debug?: boolean;
}

/**
 * Chat Command - Interactive AI agent chat interface
 * 
 * This command provides an interactive chat interface with the AI agent,
 * allowing you to have conversations, save chat history, and adjust model
 * parameters on the fly.
 * 
 * Special commands:
 * /exit - Exit the chat session
 * /clear - Clear the current conversation history
 * /help - Display available commands
 * /info - Display information about the current session
 * /model <modelId> - Switch to a different AI model
 * /temp <number> - Adjust the temperature setting
 * /save <filename> - Save conversation history to a file
 *                   (use .json extension for structured data)
 * 
 * Performance features:
 * - Response caching for frequently asked questions
 * - Token usage tracking (with --debug flag)
 * - Detailed error reporting for common failure modes
 */
const chatCommand = new Command('chat')
  .description('Start an interactive chat session with the AI agent. Use /help for chat commands')
  .option('--model <id>', 'Specify the model to use')
  .option('--system <prompt>', 'Provide a custom system prompt')
  .option('--temp <number>', 'Override the temperature setting', parseFloat)
  .option('--no-history', 'Do not load or save chat history')
  .option('--debug', 'Enable debug output for performance metrics');

const handler = async (options: ChatCommandOptions) => {
  const context = createExecutionContext();
  const agentService = AIService.getInstance();
  const readlineInterface = createReadlineInterface({ historySize: 100 });
  const history: string[] = [];
  let chatActive = true;
  // Track whether we should do an auto-save
  let lastAutoSaveLength = 0;
  let autoSaveInterval: NodeJS.Timeout | null = null;
  // Track session start time for duration information
  const startTime = Date.now();

  try {
    // Initialize chat session
    const modelId = options.model || context.config.get('agent.defaultModel');
    const systemPrompt = options.system || context.config.get('agent.systemPrompt');
    const temperature = options.temp || context.config.get('agent.temperature');

    agentService.initSession(modelId, systemPrompt, temperature);
    
    console.log(chalk.cyan(`Chat session initialized with model: ${chalk.bold(modelId)}`));
    console.log(chalk.gray('Type /help for available commands or /exit to quit\n'));

    if (!options.noHistory) {
      // Load history
      const savedHistory = context.config.get('agent.chatHistory') || [];
      if (savedHistory.length > 0) {
        console.log(chalk.gray('--- Loading previous conversation ---'));
        savedHistory.forEach((message: string) => {
          history.push(message);
          console.log(chalk.gray(message));
        });
        console.log(chalk.gray('--- End of previous conversation ---\n'));
      }
      
      // Set up auto-save every 5 minutes
      lastAutoSaveLength = history.length;
      autoSaveInterval = setInterval(() => {
        // Only save if there are new messages since last auto-save
        if (history.length > lastAutoSaveLength) {
          try {
            context.config.set('agent.chatHistory', history);
            lastAutoSaveLength = history.length;
            
            if (options.debug) {
              console.log(chalk.gray('\n[Debug] Auto-saved chat history'));
              readlineInterface.prompt(true); // Restore prompt after message
            }
          } catch (error) {
            if (options.debug) {
              console.log(chalk.red('\n[Debug] Failed to auto-save chat history'));
              readlineInterface.prompt(true); // Restore prompt after message
            }
          }
        }
      }, 5 * 60 * 1000); // Auto-save every 5 minutes
    }

    readlineInterface.setPrompt(chalk.green('You: '));
    readlineInterface.prompt();

    readlineInterface.on('line', async (line: string) => {
      const input = line.trim();
      
      // Handle special commands
      if (input === '/exit') {
        chatActive = false;
        readlineInterface.close();
        return;
      } else if (input === '/clear') {
        console.log(chalk.yellow('Conversation history cleared'));
        history.length = 0;
        readlineInterface.prompt();
        return;
      } else if (input === '/help') {
        displayHelp();
        readlineInterface.prompt();
        return;
      } else if (input.startsWith('/model ')) {
        const newModel = input.substring(7).trim();
        try {
          await agentService.setModel(newModel);
          console.log(chalk.cyan(`Model switched to: ${chalk.bold(newModel)}`));
        } catch (error) {
          console.log(chalk.red(`Failed to switch model: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
        readlineInterface.prompt();
        return;
      } else if (input.startsWith('/temp ')) {
        const newTemp = parseFloat(input.substring(6).trim());
        if (isNaN(newTemp) || newTemp < 0 || newTemp > 2) {
          console.log(chalk.red('Invalid temperature value. Use a number between 0 and 2.'));
        } else {
          agentService.setTemperature(newTemp);
          console.log(chalk.cyan(`Temperature set to: ${newTemp}`));
        }
        readlineInterface.prompt();
        return;
      } else if (input.startsWith('/save ')) {
        const filename = input.substring(6).trim();
        if (!filename) {
          console.log(chalk.red('Please provide a filename to save the chat history.'));
        } else {
          try {
            const fs = await import('fs/promises');
            const path = await import('path');
            
            // Use the appropriate extension based on the format
            const ext = path.extname(filename).toLowerCase();
            
            if (ext === '.json') {
              // Save as structured JSON with full metadata
              const jsonHistory = JSON.stringify(history, null, 2);
              await fs.writeFile(filename, jsonHistory, 'utf8');
            } else {
              // Save as plain text (default)
              const content = history.join('\n');
              await fs.writeFile(filename, content, 'utf8');
            }
            
            console.log(chalk.green(`Chat history saved to ${filename}`));
          } catch (error) {
            console.log(chalk.red(`Failed to save chat history: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        }
        readlineInterface.prompt();
        return;
      } else if (input === '/info') {
        // Display information about the current chat session
        console.log(chalk.cyan('\nChat Session Information:'));
        console.log(chalk.cyan('  Model:') + ` ${options.model || context.config.get('agent.defaultModel')}`);
        console.log(chalk.cyan('  Temperature:') + ` ${options.temp || context.config.get('agent.temperature')}`);
        console.log(chalk.cyan('  Message count:') + ` ${history.length} messages`);
        console.log(chalk.cyan('  Debug mode:') + ` ${options.debug ? 'Enabled' : 'Disabled'}`);
        console.log(chalk.cyan('  Auto-save:') + ` ${!options.noHistory && autoSaveInterval ? 'Enabled (every 5 minutes)' : 'Disabled'}`);
        
        // Include memory usage information when in debug mode
        if (options.debug) {
          const memoryUsage = process.memoryUsage();
          console.log(chalk.cyan('\n  Memory Usage:'));
          console.log(chalk.cyan('    RSS:') + ` ${Math.round(memoryUsage.rss / 1024 / 1024)} MB`);
          console.log(chalk.cyan('    Heap Total:') + ` ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`);
          console.log(chalk.cyan('    Heap Used:') + ` ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`);
          
          // Show session duration
          const sessionDuration = Math.round((Date.now() - startTime) / 1000 / 60);
          console.log(chalk.cyan('\n  Session Duration:') + ` ${sessionDuration} minutes`);
        }
        
        console.log(); // Add an empty line at the end
        readlineInterface.prompt();
        return;
      } else if (input === '/cache' || input.startsWith('/cache ')) {
        // Handle cache management commands
        const parts = input.split(' ');
        const subCommand = parts[1] || 'stats';
        
        if (subCommand === 'stats') {
          // Show cache statistics
          const stats = agentService.getCacheStats();
          console.log(chalk.cyan('\nCache Statistics:'));
          console.log(chalk.cyan('  Cache size:') + ` ${stats.cacheSize} entries`);
          console.log(chalk.cyan('  Total requests:') + ` ${stats.totalRequests}`);
          console.log(chalk.cyan('  Cache hits:') + ` ${stats.hits}`);
          console.log(chalk.cyan('  Cache misses:') + ` ${stats.misses}`);
          console.log(chalk.cyan('  Hit rate:') + ` ${Math.round(stats.hitRate * 100)}%`);
          console.log(chalk.cyan('  Evictions:') + ` ${stats.evictions}`);
        } else if (subCommand === 'clear') {
          // Clear the cache
          agentService.clearCache();
          console.log(chalk.green('Response cache cleared'));
        } else {
          // Unknown subcommand
          console.log(chalk.red(`Unknown cache command: ${subCommand}`));
          console.log(chalk.gray('Available commands: /cache stats, /cache clear'));
        }
        
        console.log(); // Add an empty line
        readlineInterface.prompt();
        return;
      } else if (input.startsWith('/benchmark')) {
        // Run a simple benchmark to test response performance
        console.log(chalk.cyan('\nRunning benchmark test...'));
        
        // Parse benchmark options
        const parts = input.split(' ');
        const benchmarkCount = parts.length > 1 ? parseInt(parts[1], 10) || 3 : 3;
        const benchmarkPrompt = "Give a one sentence response about AI";
        
        console.log(chalk.gray(`Running ${benchmarkCount} iterations with prompt: "${benchmarkPrompt}"`));
        
        // Track metrics
        const responseTimes: number[] = [];
        let totalTokens = 0;
        let cachedResponses = 0;
        
        // Run benchmark
        for (let i = 0; i < benchmarkCount; i++) {
          console.log(chalk.gray(`\nIteration ${i+1}/${benchmarkCount}...`));
          const startTime = Date.now();
          try {
            const response = await agentService.processMessage(benchmarkPrompt);
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            responseTimes.push(responseTime);
            if (response.cached) cachedResponses++;
            if (response.usage) {
              totalTokens += response.usage.totalTokens || 0;
            }
            
            console.log(chalk.gray(`Response time: ${responseTime}ms${response.cached ? ' (cached)' : ''}`));
          } catch (error) {
            console.log(chalk.red(`Error in benchmark iteration ${i+1}: ${error}`));
          }
        }
        
        // Calculate and display results
        if (responseTimes.length > 0) {
          const avgTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
          const minTime = Math.min(...responseTimes);
          const maxTime = Math.max(...responseTimes);
          
          console.log(chalk.cyan('\nBenchmark Results:'));
          console.log(chalk.cyan('  Average response time:') + ` ${avgTime}ms`);
          console.log(chalk.cyan('  Fastest response:') + ` ${minTime}ms`);
          console.log(chalk.cyan('  Slowest response:') + ` ${maxTime}ms`);
          console.log(chalk.cyan('  Cached responses:') + ` ${cachedResponses}/${benchmarkCount}`);
          
          if (totalTokens > 0) {
            console.log(chalk.cyan('  Total tokens used:') + ` ${totalTokens}`);
            console.log(chalk.cyan('  Avg. tokens per request:') + ` ${Math.round(totalTokens / (benchmarkCount - cachedResponses))}`);
          }
        } else {
          console.log(chalk.red('\nBenchmark failed: No successful responses'));
        }
        
        console.log(); // Add an empty line at the end
        readlineInterface.prompt();
        return;
      }

      // Process normal message
      if (input) {
        const userMessage = `You: ${input}`;
        history.push(userMessage);
        
        try {
          // Show an enhanced loading indicator with stage information
          const loadingIndicator = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
          const loadingStages = [
            "Processing your message...",
            "Thinking about your question...",
            "Analyzing context...",
            "Generating response..."
          ];
          let i = 0;
          let stageIndex = 0;
          let stageCounter = 0;
          const loadingInterval = setInterval(() => {
            // Change the stage message periodically
            if (stageCounter >= 12) { // Switch message approximately every ~1.2 seconds
              stageIndex = (stageIndex + 1) % loadingStages.length;
              stageCounter = 0;
            }
            
            process.stdout.write(`\r${chalk.yellow(loadingIndicator[i])} ${chalk.cyan(loadingStages[stageIndex])}`);
            i = (i + 1) % loadingIndicator.length;
            stageCounter++;
          }, 100);
          
          const startTime = Date.now();
          const responseData = await agentService.processMessage(input);
          const responseTime = Date.now() - startTime;
          
          clearInterval(loadingInterval);
          // Clear the loading indicators
          process.stdout.write('\r\x1b[K');
          
          // Check if there was an error in processing
          if (responseData.error) {
            console.log(chalk.yellow(`Agent: ${responseData.content}`));
            
            if (options.debug) {
              console.log(chalk.red(`[Debug] Error details: ${responseData.error}`));
            }
            
            // If there's a retryAfter value, inform the user
            if (responseData.retryAfter) {
              console.log(chalk.cyan(`You can try again in ${responseData.retryAfter} seconds`));
            }
            
            // Don't add errors to history unless they're part of the conversation
            // history.push(`Agent: ${responseData.content}`);
          } else {
            const agentMessage = `Agent: ${responseData.content}`;
            console.log(chalk.blue(agentMessage));
            history.push(agentMessage);
          }
          
          if (options.debug) {
            console.log(chalk.gray(`[Debug] Response time: ${responseTime}ms${responseData.cached ? ' (cached)' : ''}`));
            if (responseData.usage) {
              const { promptTokens, completionTokens, totalTokens } = responseData.usage;
              console.log(chalk.gray(`[Debug] Tokens: ${promptTokens || 0} prompt + ${completionTokens || 0} completion = ${totalTokens || 0} total`));
            }
          }
        } catch (error) {
          console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
          if (options.debug && error instanceof Error) {
            console.log(chalk.red(error.stack));
          }
          logger.error(`Chat command error: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
        }
      }
      
      readlineInterface.prompt();
    });

    // Add keyboard event handling
    readlineInterface.input.on('keypress', (_, key) => {
      // Support for keyboard shortcuts
      if (key && key.ctrl) {
        // Ctrl+C is already handled by Node's readline
        
        // Ctrl+L clears the screen while preserving the current line
        if (key.name === 'l') {
          process.stdout.write('\x1Bc');
          readlineInterface.prompt();
          readlineInterface._refreshLine();
        }
        
        // Ctrl+K shows the help text
        if (key.name === 'k') {
          displayHelp();
          readlineInterface.prompt();
          readlineInterface._refreshLine();
        }
      }
    });
    
    // We'll implement alternative keyboard shortcuts handling
    // without direct stdin manipulation to avoid TypeScript errors
    try {
      // Set up a simpler keyboard shortcut handler
      // Listen for specific control sequences in line input instead
      readlineInterface.on('line', (input) => {
        // Don't process empty lines or handle control characters here
        if (input === '\x0c') { // Ctrl+L character
          console.clear();
          readlineInterface.prompt();
          return;
        }
        
        // Regular line processing continues in the existing 'line' handler
        // This handler just catches direct control character inputs
      });
      
      // Note: we won't be able to properly handle all keyboard shortcuts
      // but the critical functionality is preserved in the regular commands
    } catch (error) {
      // Silently ignore keyboard shortcut setup errors
      logger.debug('Could not set up keyboard shortcuts', { error });
    }
    
    readlineInterface.on('close', () => {
      if (chatActive) {
        console.log(chalk.yellow('\nChat session ended'));
      }
      
      // Clear the auto-save interval if it's running
      if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
      }
      
      if (!options.noHistory && history.length > 0) {
        // Save history
        try {
          context.config.set('agent.chatHistory', history);
          if (options.debug) {
            console.log(chalk.gray('Chat history saved'));
          }
        } catch (error) {
          logger.error(`Failed to save chat history: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
        }
      }
      
      process.exit(0);
    });
  } catch (error) {
    console.log(chalk.red(`Failed to initialize chat: ${error instanceof Error ? error.message : 'Unknown error'}`));
    logger.error('Chat initialization error', { error });
    process.exit(1);
  }
};

/**
 * Display help information for chat commands
 */
function displayHelp(): void {
  console.log(chalk.cyan('\nAvailable Commands:'));
  console.log(chalk.cyan('  /exit') + '            - Exit the chat session');
  console.log(chalk.cyan('  /clear') + '           - Clear conversation history');
  console.log(chalk.cyan('  /help') + '            - Show this help information');
  console.log(chalk.cyan('  /info') + '            - Display current session information');
  console.log(chalk.cyan('  /model <modelId>') + '   - Switch to a different AI model');
  console.log(chalk.cyan('  /temp <number>') + '    - Adjust temperature (0.0-2.0)');
  console.log(chalk.cyan('  /save <filename>') + '   - Save conversation history to a file');
  console.log(chalk.gray('                        Use .json extension for structured data'));
  console.log(chalk.cyan('  /benchmark [n]') + '    - Run performance benchmark (n iterations)');
  console.log(chalk.cyan('  /cache [command]') + '  - Manage response cache (stats, clear)\n');
  
  console.log(chalk.cyan('Keyboard Shortcuts:'));
  console.log(chalk.cyan('  Ctrl+C') + '           - Exit the chat session');
  console.log(chalk.cyan('  Ctrl+L') + '           - Clear the screen (preserves history)');
  console.log(chalk.cyan('  Ctrl+K') + '           - Show this help information');
  console.log(chalk.cyan('  ↑/↓ arrows') + '       - Navigate through command history\n');
  
  if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
    console.log(chalk.gray('Advanced Features:'));
    console.log(chalk.gray('  - Response caching optimizes performance for repeated questions'));
    console.log(chalk.gray('  - Token usage metrics shown in debug mode (use --debug flag)'));
    console.log(chalk.gray('  - Enhanced error handling with helpful recovery suggestions'));
    console.log(chalk.gray('  - Auto-save every 5 minutes to prevent data loss\n'));
  }
}

chatCommand.action(handler);

export default chatCommand;
