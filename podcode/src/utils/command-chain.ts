import chalk from 'chalk';
import { executeInteractive } from './interactive-terminal.js';

/**
 * Options for a command in the chain
 */
export interface ChainCommandOptions {
  /** The command to execute */
  command: string;
  /** Arguments for the command */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Timeout in seconds */
  timeout?: number;
  /** Condition to run this command */
  condition?: (prevOutput: string, prevExitCode?: number) => boolean;
  /** Transform function to modify command based on previous output */
  transform?: (cmd: string, prevOutput: string) => string;
  /** Whether to continue chain if this command fails */
  continueOnError?: boolean;
}

/**
 * Result of a command chain execution
 */
export interface CommandChainResult {
  /** Overall success of the chain */
  success: boolean;
  /** Results of each command in the chain */
  results: {
    command: string;
    output: string;
    success: boolean;
    error?: string;
    exitCode?: number;
  }[];
  /** Combined output of all commands */
  combinedOutput: string;
  /** Error message if chain failed */
  error?: string;
}

/**
 * Execute a chain of commands, with each command potentially depending on the output of previous commands
 * @param commands Array of command options to execute in sequence
 * @returns Result of the command chain execution
 */
export async function executeCommandChain(commands: ChainCommandOptions[]): Promise<CommandChainResult> {
  const results: CommandChainResult['results'] = [];
  let previousOutput = '';
  let previousExitCode: number | undefined;
  let combinedOutput = '';
  let chainSuccess = true;

  console.log(chalk.cyan(`🔗 Starting command chain with ${commands.length} commands`));

  for (let i = 0; i < commands.length; i++) {
    let cmd = commands[i];
    
    // Check condition if provided
    if (cmd.condition && !cmd.condition(previousOutput, previousExitCode)) {
      console.log(chalk.yellow(`⏭️ Skipping command ${i + 1}/${commands.length}: condition not met`));
      continue;
    }

    // Transform command if needed
    let commandToRun = cmd.command;
    if (cmd.transform) {
      commandToRun = cmd.transform(commandToRun, previousOutput);
    }

    // Execute the command
    console.log(chalk.cyan(`▶️ Executing command ${i + 1}/${commands.length}: ${commandToRun}`));
    
    try {
      const result = await executeInteractive(
        commandToRun,
        cmd.args || [],
        {
          cwd: cmd.cwd,
          timeout: cmd.timeout,
          showOutput: true,
          showPrompts: true
        }
      );

      // Store result
      results.push({
        command: commandToRun + (cmd.args ? ' ' + cmd.args.join(' ') : ''),
        output: result.output,
        success: result.success,
        error: result.error,
        exitCode: result.exitCode
      });

      // Update previous output and exit code for next command
      previousOutput = result.output;
      previousExitCode = result.exitCode;
      combinedOutput += result.output;

      // Check if we should continue on error
      if (!result.success && !cmd.continueOnError) {
        console.log(chalk.red(`❌ Command failed: ${result.error}`));
        chainSuccess = false;
        break;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`❌ Command execution error: ${errorMessage}`));
      
      results.push({
        command: commandToRun + (cmd.args ? ' ' + cmd.args.join(' ') : ''),
        output: '',
        success: false,
        error: errorMessage
      });

      if (!cmd.continueOnError) {
        chainSuccess = false;
        break;
      }
    }
  }

  return {
    success: chainSuccess,
    results,
    combinedOutput,
    error: chainSuccess ? undefined : 'One or more commands in the chain failed'
  };
}

/**
 * Create a command chain builder for easier chaining
 */
export class CommandChainBuilder {
  private commands: ChainCommandOptions[] = [];

  /**
   * Add a command to the chain
   * @param options Command options
   */
  addCommand(options: ChainCommandOptions): CommandChainBuilder {
    this.commands.push(options);
    return this;
  }

  /**
   * Add a simple command to the chain
   * @param command The command to execute
   * @param continueOnError Whether to continue chain if this command fails
   */
  add(command: string, continueOnError = false): CommandChainBuilder {
    const [cmd, ...args] = command.split(' ');
    return this.addCommand({
      command: cmd,
      args,
      continueOnError
    });
  }

  /**
   * Add a command that only runs if the previous command succeeded
   * @param command The command to execute
   */
  then(command: string): CommandChainBuilder {
    const [cmd, ...args] = command.split(' ');
    return this.addCommand({
      command: cmd,
      args,
      condition: (_, exitCode) => exitCode === 0
    });
  }

  /**
   * Add a command that only runs if the previous command failed
   * @param command The command to execute
   */
  orElse(command: string): CommandChainBuilder {
    const [cmd, ...args] = command.split(' ');
    return this.addCommand({
      command: cmd,
      args,
      condition: (_, exitCode) => exitCode !== 0
    });
  }

  /**
   * Add a command that runs if the previous output contains a specific string
   * @param text Text to search for in previous output
   * @param command Command to execute if text is found
   */
  ifOutputContains(text: string, command: string): CommandChainBuilder {
    const [cmd, ...args] = command.split(' ');
    return this.addCommand({
      command: cmd,
      args,
      condition: (output) => output.includes(text)
    });
  }

  /**
   * Execute the command chain
   */
  async execute(): Promise<CommandChainResult> {
    return executeCommandChain(this.commands);
  }
}
