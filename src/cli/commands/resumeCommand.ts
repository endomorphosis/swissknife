import { Command, CommandExecutionContext } from '../../command-registry';
import { REPL } from '../../../src/screens/REPL';
import { ResumeConversation } from '../../../src/screens/ResumeConversation';
import { render } from 'ink';
import { logEvent } from '../../services/statsig';
import { cwd } from 'process';
import { existsSync } from 'fs';
import { getTools } from '../../tools';
import { getCommands } from '../../commands';
import { loadLogList, getNextAvailableLogForkNumber, parseLogFilename } from '../../utils/log';
import { loadMessagesFromLog } from '../../utils/conversationRecovery';
import { getClients } from '../../services/mcpClient';
import { isDefaultSlowAndCapableModel } from '../../utils/model';
import { CACHE_PATHS } from '../../utils/log';
import { getCurrentProjectConfig } from '../../utils/config';

export class ResumeCommand implements Command {
  readonly id = 'resume';
  readonly name = 'resume';
  readonly description = 'Resume a previous conversation.';
  readonly help = 'Usage: swissknife resume [identifier] [--cwd <cwd>] [--enable-architect] [--verbose] [--dangerously-skip-permissions]';

  parseArguments(args: string[]): Record<string, any> {
    const identifier = args[0];
    const cwdArgIndex = args.indexOf('--cwd');
    const cwdValue = cwdArgIndex !== -1 ? args[cwdArgIndex + 1] : cwd();
    const enableArchitect = args.includes('--enable-architect') || args.includes('-e');
    const verbose = args.includes('--verbose') || args.includes('-v');
    const dangerouslySkipPermissions = args.includes('--dangerously-skip-permissions');
    return { identifier, cwd: cwdValue, enableArchitect, verbose, dangerouslySkipPermissions };
  }

  async execute(parsedArgs: Record<string, any>, context: CommandExecutionContext): Promise<any> {
    const { identifier, cwd: currentCwd, enableArchitect, verbose, dangerouslySkipPermissions } = parsedArgs;

    // Assuming setup is handled externally or can be called here if needed
    // await setup(currentCwd, dangerouslySkipPermissions);

    const [tools, commands, logs, mcpClients] = await Promise.all([
      getTools(enableArchitect ?? getCurrentProjectConfig().enableArchitectTool),
      getCommands(),
      loadLogList(CACHE_PATHS.messages()),
      getClients(),
    ]);

    if (identifier !== undefined) {
      const number = Math.abs(parseInt(identifier));
      const isNumber = !isNaN(number);
      let messages, date, forkNumber;

      try {
        if (isNumber) {
          logEvent('tengu_resume', { number: number.toString() });
          const log = logs[number];
          if (!log) {
            console.error('No conversation found at index', number);
            process.exit(1);
          }
          messages = await loadMessagesFromLog(log.fullPath, tools);
          ({ date, forkNumber } = log);
        } else {
          logEvent('tengu_resume', { filePath: identifier });
          if (!existsSync(identifier)) {
            console.error('File does not exist:', identifier);
            process.exit(1);
          }
          messages = await loadMessagesFromLog(identifier, tools);
          const pathSegments = identifier.split('/');
          const filename = pathSegments[pathSegments.length - 1] ?? 'unknown';
          ({ date, forkNumber } = parseLogFilename(filename));
        }
        const fork = getNextAvailableLogForkNumber(date, forkNumber ?? 1, 0);
        const isDefaultModel = await isDefaultSlowAndCapableModel();
        render(
          REPL({
            initialPrompt: "",
            messageLogName: date,
            initialForkNumber: fork,
            shouldShowPromptInput: true,
            verbose: verbose,
            commands: commands,
            tools: tools,
            initialMessages: messages,
            mcpClients: mcpClients,
            isDefaultModel: isDefaultModel,
          }),
          { exitOnCtrlC: false },
        );
      } catch (error) {
        console.error(`Failed to load conversation: ${error}`);
        process.exit(1);
      }
    } else {
      const inkContext: { unmount?: () => void } = {};
      const { unmount } = render(
        ResumeConversation({
          context: inkContext,
          commands: commands,
          logs: logs,
          tools: tools,
          verbose: verbose,
        }),
        { exitOnCtrlC: true },
      );
      inkContext.unmount = unmount;
    }
    return "Resume command executed.";
  }
}