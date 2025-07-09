import { Command, CommandExecutionContext } from '../../command-registry';
import { StorageProvider } from '../../types/storage'; // Need StorageProvider
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import parse from 'yargs-parser'; 

export class StorageAddCommand implements Command {
  readonly name = 'storage:add';
  readonly description = 'Adds a local file to the configured storage provider.';
  
  readonly argumentParserOptions = {
    // No specific options needed, path is positional
  };

  parseArguments(args: string[]): Record<string, any> {
    const parsed = parse(args, this.argumentParserOptions);
    if (parsed._.length !== 1) {
      throw new Error('Usage: storage:add <file_path>');
    }
    const filePath = path.resolve(parsed._[0] as string); // Resolve to absolute path
    return { filePath };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    // StorageProvider might be directly on context or accessed via Agent
    // Let's assume it might be needed directly for storage commands
    // We need to update CommandExecutionContext if we want direct access
    // For now, access via agent (assuming agent has storage property)
    const agent = context.agent; 
    // Or, if we modify context: const storage = context.storage;
    const storage = (agent as any).storage as StorageProvider; // Accessing private member for now, needs refactor if context doesn't have storage
    
    if (!storage) {
         throw new Error('StorageProvider is not available in the execution context.');
    }

    const filePath = parsedArgs.filePath as string;

    logger.info(`Executing ${this.name} command for file: "${filePath}"`);
    
    try {
      // Check if file exists
      await fs.access(filePath); 
      
      // Read file content
      const fileContent = await fs.readFile(filePath);
      logger.debug(`Read ${fileContent.length} bytes from ${filePath}`);

      // Add content to storage
      const cid = await storage.add(fileContent);
      
      return {
        message: `File added successfully.`,
        filePath: filePath,
        cid: cid,
      };
    } catch (error: any) {
      logger.error(`Error adding file to storage:`, error);
      if (error.code === 'ENOENT') {
         throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to add file: ${error.message}`);
    }
  }
}
