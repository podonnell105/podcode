import chalk from 'chalk';

type ChalkColor = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray' | 'grey';

export class UIFormatter {
  private static readonly BOX_CHARS = {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    topT: '┬',
    bottomT: '┴',
    leftT: '├',
    rightT: '┤'
  };

  /**
   * Creates a box around text with optional title
   */
  static createBox(content: string, title?: string, color: ChalkColor = 'cyan'): string {
    const lines = content.split('\n');
    const maxWidth = Math.max(
      ...lines.map(line => line.length),
      title ? title.length + 2 : 0
    );
    
    const boxWidth = maxWidth + 4; // 2 spaces padding on each side
    const horizontalLine = this.BOX_CHARS.horizontal.repeat(boxWidth - 2);
    
    let result = '';
    
    // Get the chalk color function
    const chalkColor = (chalk as any)[color] as typeof chalk.cyan;
    
    // Top border
    if (title) {
      const titleLine = ` ${title} `;
      const titlePadding = Math.max(0, boxWidth - titleLine.length - 2);
      result += chalkColor(`${this.BOX_CHARS.topLeft}${titleLine}${' '.repeat(titlePadding)}${this.BOX_CHARS.topRight}\n`);
    } else {
      result += chalkColor(`${this.BOX_CHARS.topLeft}${horizontalLine}${this.BOX_CHARS.topRight}\n`);
    }
    
    // Content lines
    for (const line of lines) {
      const padding = ' '.repeat(boxWidth - line.length - 2);
      result += chalkColor(`${this.BOX_CHARS.vertical} `) + line + chalkColor(` ${padding}${this.BOX_CHARS.vertical}\n`);
    }
    
    // Bottom border
    result += chalkColor(`${this.BOX_CHARS.bottomLeft}${horizontalLine}${this.BOX_CHARS.bottomRight}`);
    
    return result;
  }

  /**
   * Creates a task box with step information
   */
  static createTaskBox(stepNumber: number, totalSteps: number, stepContent: string): string {
    const title = `Step ${stepNumber}/${totalSteps}`;
    const content = stepContent;
    return this.createBox(content, title, 'yellow');
  }

  /**
   * Creates a command box for CLI commands
   */
  static createCommandBox(command: string, status: 'running' | 'success' | 'error' = 'running'): string {
    const statusIcon = status === 'success' ? '✅' : status === 'error' ? '❌' : '🚀';
    const title = `${statusIcon} Command`;
    const content = command;
    const color: ChalkColor = status === 'success' ? 'green' : status === 'error' ? 'red' : 'blue';
    return this.createBox(content, title, color);
  }

  /**
   * Creates an output box for command results
   */
  static createOutputBox(output: string, title: string = 'Output'): string {
    return this.createBox(output, title, 'gray');
  }

  /**
   * Creates a plan box for execution plans
   */
  static createPlanBox(planTitle: string, planId: string, steps: string[]): string {
    const content = [
      `Plan ID: ${planId}`,
      '',
      'Steps:',
      ...steps.map((step, index) => `  ${index + 1}. ${step}`)
    ].join('\n');
    
    return this.createBox(content, planTitle, 'cyan');
  }

  /**
   * Creates a decision box for orchestrator decisions
   */
  static createDecisionBox(action: string, reason: string): string {
    const content = `${action} - ${reason}`;
    return this.createBox(content, 'Decision', 'magenta');
  }

  /**
   * Creates a tool box for tool execution
   */
  static createToolBox(toolName: string, args?: any): string {
    let content = toolName;
    if (args && Object.keys(args).length > 0) {
      if (toolName === 'bash') {
        content += `\nCommand: ${args.command}`;
      } else {
        content += `\nArgs: ${JSON.stringify(args, null, 2)}`;
      }
    }
    return this.createBox(content, 'Tool', 'blue');
  }

  /**
   * Creates a status box for step completion
   */
  static createStatusBox(status: 'completed' | 'failed' | 'in_progress', message: string): string {
    const icon = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳';
    const color: ChalkColor = status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'yellow';
    const title = `${icon} ${status.charAt(0).toUpperCase() + status.slice(1)}`;
    return this.createBox(message, title, color);
  }

  /**
   * Creates a separator line
   */
  static createSeparator(char: string = '─', length: number = 60): string {
    return chalk.gray(char.repeat(length));
  }

  /**
   * Creates a section header
   */
  static createSectionHeader(title: string, icon?: string): string {
    const iconText = icon ? `${icon} ` : '';
    return chalk.bold.cyan(`\n${iconText}${title.toUpperCase()}\n${this.createSeparator('═', title.length + (icon ? 2 : 0))}`);
  }

  /**
   * Creates a progress indicator
   */
  static createProgressBar(current: number, total: number, width: number = 30): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percentage}% (${current}/${total})`;
  }

  /**
   * Creates a welcome message with logo
   */
  static createWelcomeBox(): string {
    const content = [
      'Welcome to PodCode! 🚀',
      '',
      'Available commands:',
      '  help         - Show available tools and commands',
      '  status       - Show session information',
      '  clear        - Start a new session',
      '  clear-memory - Clear all memory and start fresh',
      '  exit         - Quit PodCode',
      '',
      'Ready to help with your coding tasks!'
    ].join('\n');
    
    return this.createBox(content, 'Welcome', 'green');
  }

  /**
   * Creates a formatted table display for execution plans
   */
  static createPlanTable(plan: any): string {
    const table = [
      chalk.cyan('┌─ Plan Details ──────────────────────────────────────────┐'),
      `│ ID: ${plan.planId || 'N/A'}`,
      `│ Title: ${plan.title || 'Untitled Plan'}`,
      `│ Steps: ${plan.steps?.length || 0}`,
      chalk.cyan('├─ Execution Steps ───────────────────────────────────────┤')
    ];
    
    if (plan.steps && Array.isArray(plan.steps)) {
      plan.steps.forEach((step: any, idx: number) => {
        const stepNum = idx + 1;
        if (typeof step === 'string') {
          // Handle legacy string format
          table.push(`│ ${stepNum}. ${step}`);
        } else if (step.id && step.tool) {
          // Handle new JSON schema format
          const why = step.args?.why || 'Execute step';
          table.push(`│ ${stepNum}. ${step.id}: ${step.tool} - ${why}`);
        } else {
          table.push(`│ ${stepNum}. Unknown step format`);
        }
      });
    } else {
      table.push('│ No steps defined');
    }
    
    if (plan.success_criteria && Array.isArray(plan.success_criteria)) {
      table.push(chalk.cyan('├─ Success Criteria ──────────────────────────────────────┤'));
      plan.success_criteria.forEach((criterion: string) => {
        table.push(`│ ✓ ${criterion}`);
      });
    }
    
    table.push(chalk.cyan('└─────────────────────────────────────────────────────────┘'));
    return table.join('\n');
  }

  // ========== MINIMAL / CLAUDE-CODE STYLE FORMATTERS ==========
  
  /**
   * Minimal tool execution message (ClaudeCode style)
   */
  static minimal_toolExecution(toolName: string, command?: string): string {
    if (toolName === 'bash' && command) {
      return chalk.gray(`Running: ${command}`);
    }
    return chalk.gray(`Using ${toolName}`);
  }

  /**
   * Minimal success message
   */
  static minimal_success(message?: string): string {
    return chalk.green(`✓ ${message || 'Completed'}`);
  }

  /**
   * Minimal error message (no box, just the error)
   */
  static minimal_error(error: string): string {
    return chalk.red(error);
  }

  /**
   * Minimal step indicator
   */
  static minimal_step(stepNum: number, total: number, description: string): string {
    return chalk.cyan(`[${stepNum}/${total}] ${description}`);
  }

  /**
   * Minimal output display (raw, no box)
   */
  static minimal_output(output: string): string {
    return output;
  }

  /**
   * Inline decision (no box)
   */
  static minimal_decision(action: string, reason: string): string {
    return chalk.gray(`→ ${action}: ${reason}`);
  }
}
