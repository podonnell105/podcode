import { spawn, ChildProcess } from 'child_process';
import readline from 'readline';
import chalk from 'chalk';

/**
 * Options for interactive terminal execution
 */
interface InteractiveTerminalOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in seconds (0 for no timeout) */
  timeout?: number;
  /** Whether to show command output in real-time */
  showOutput?: boolean;
  /** Whether to show prompts for user input */
  showPrompts?: boolean;
  /** Optional abort signal */
  signal?: AbortSignal;
}

/**
 * Result of an interactive terminal execution
 */
interface InteractiveTerminalResult {
  /** Whether the command succeeded */
  success: boolean;
  /** The output of the command */
  output: string;
  /** Any error message */
  error?: string;
  /** The exit code of the command */
  exitCode?: number;
  /** The user inputs provided during execution */
  userInputs?: string[];
}

/**
 * Utility for executing commands in an interactive terminal
 * that can handle user input during execution
 */
export class InteractiveTerminal {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private output: string = '';
  private error: string = '';
  private userInputs: string[] = [];
  private options: InteractiveTerminalOptions;
  private timer: NodeJS.Timeout | null = null;
  private isWaitingForInput: boolean = false;
  private inputPrompt: string = '';
  private resolveInput: ((input: string) => void) | null = null;

  /**
   * Create a new interactive terminal
   * @param options Options for the terminal
   */
  constructor(options: InteractiveTerminalOptions = {}) {
    this.options = {
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-color' },
      timeout: 120, // Default timeout: 2 minutes
      showOutput: true,
      showPrompts: true,
      ...options
    };
  }

  /**
   * Execute a command interactively
   * @param command The command to execute
   * @param args The arguments to pass to the command
   * @returns A promise that resolves with the result of the command
   */
  async execute(command: string, args: string[] = []): Promise<InteractiveTerminalResult> {
    return new Promise((resolve) => {
      // Set up readline interface for user input
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      // Spawn the process
      this.process = spawn(command, args, {
        cwd: this.options.cwd,
        env: this.options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up timeout if specified
      if (this.options.timeout && this.options.timeout > 0) {
        this.timer = setTimeout(() => {
          this.killProcess('Command timed out');
          resolve(this.getResult(false, 'Command timed out'));
        }, this.options.timeout * 1000);
      }

      // Handle abort signal
      if (this.options.signal) {
        this.options.signal.addEventListener('abort', () => {
          this.killProcess('Command aborted');
          resolve(this.getResult(false, 'Command aborted'));
        });
      }

      // Handle process stdout
      this.process.stdout?.on('data', (data) => {
        const text = data.toString();
        this.output += text;
        
        if (this.options.showOutput) {
          process.stdout.write(text);
        }
        
        // Check if the output is asking for user input
        this.checkForInputPrompt(text);
      });

      // Handle process stderr
      this.process.stderr?.on('data', (data) => {
        const text = data.toString();
        this.error += text;
        
        if (this.options.showOutput) {
          process.stderr.write(chalk.red(text));
        }
        
        // Check if the error output is asking for user input
        this.checkForInputPrompt(text);
      });

      // Handle process completion
      this.process.on('close', (code) => {
        this.cleanup();
        // Convert null to undefined for exitCode parameter
        const exitCode = code === null ? undefined : code;
        resolve(this.getResult(code === 0, code !== 0 ? `Command exited with code ${code}` : undefined, exitCode));
      });

      // Handle process error
      this.process.on('error', (err) => {
        this.cleanup();
        resolve(this.getResult(false, `Failed to execute command: ${err.message}`));
      });
    });
  }

  /**
   * Check if the output is asking for user input
   * @param text The output text to check
   */
  private checkForInputPrompt(text: string): void {
    // Common patterns that indicate the process is waiting for user input
    const inputPatterns = [
      /password.*:/i,
      /passphrase.*:/i,
      /verification code.*:/i,
      /enter.*code.*:/i,
      /token.*:/i,
      /username.*:/i,
      /login.*:/i,
      /continue.*(y\/n).*:/i,
      /(y\/n).*:/i,
      /press enter.*:/i,
      /press any key.*:/i,
      /\?.*:/i,
    ];

    // Check if the text matches any input pattern
    const isInputPrompt = inputPatterns.some(pattern => pattern.test(text));
    
    if (isInputPrompt && !this.isWaitingForInput) {
      this.isWaitingForInput = true;
      this.inputPrompt = text.trim();
      
      // Prompt for user input
      this.promptForInput();
    }
  }

  /**
   * Prompt the user for input
   */
  private promptForInput(): void {
    if (this.options.showPrompts) {
      console.log(chalk.cyan('\n⌨️  Input required: ') + chalk.yellow(this.inputPrompt));
    }

    // Create a promise that will be resolved when the user provides input
    const inputPromise = new Promise<string>((resolve) => {
      this.resolveInput = resolve;
      
      this.rl?.question(chalk.green('> '), (answer) => {
        this.userInputs.push(answer);
        this.isWaitingForInput = false;
        this.inputPrompt = '';
        
        if (this.resolveInput) {
          this.resolveInput(answer);
          this.resolveInput = null;
        }
        
        // Send the input to the process
        if (this.process && this.process.stdin) {
          this.process.stdin.write(answer + '\n');
        }
      });
    });

    // Wait for input and then continue
    inputPromise.then(() => {
      // Continue processing
    });
  }

  /**
   * Kill the process
   * @param reason The reason for killing the process
   */
  private killProcess(reason: string): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.cleanup();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Get the result of the command execution
   * @param success Whether the command succeeded
   * @param error Any error message
   * @param exitCode The exit code of the command
   * @returns The result of the command execution
   */
  private getResult(success: boolean, error?: string, exitCode?: number): InteractiveTerminalResult {
    return {
      success,
      output: this.output,
      error: error || (this.error ? this.error : undefined),
      exitCode,
      userInputs: this.userInputs
    };
  }
}

/**
 * Execute a command interactively
 * @param command The command to execute
 * @param args The arguments to pass to the command
 * @param options Options for the terminal
 * @returns A promise that resolves with the result of the command
 */
export async function executeInteractive(
  command: string,
  args: string[] = [],
  options: InteractiveTerminalOptions = {}
): Promise<InteractiveTerminalResult> {
  const terminal = new InteractiveTerminal(options);
  return terminal.execute(command, args);
}
