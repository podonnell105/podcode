import { Command } from 'commander';
import chalk from 'chalk';
import { AIOrchestrator } from '../orchestrator.js';
import { AIClient } from '../client.js';
import { sessionManager } from '../session/manager.js';
import { toolRegistry } from '../tools/registry.js';
import { UIFormatter } from '../utils/ui-formatter.js';
import { config } from '../config.js';

export function createPlanCommand(): Command {
  const planCommand = new Command('plan');
  
  planCommand
    .description('Generate execution plan without running it')
    .argument('<task>', 'Task to plan for')
    .option('-v, --verbose', 'Show detailed plan information')
    .option('-j, --json', 'Output raw JSON plan')
    .action(async (task: string, options: any) => {
      try {
        // Load configuration
        await config.load();
        
        // Initialize AI client
        const aiClient = new AIClient();
        
        // Create session for planning
        const session = sessionManager.createSession(process.cwd());
        
        // Initialize orchestrator
        const orchestrator = new AIOrchestrator(aiClient);
        
        // Get available tools
        const toolNames = toolRegistry.getNames();
        
        console.log(chalk.cyan('🎯 Generating execution plan...'));
        console.log(chalk.gray(`Task: ${task}`));
        console.log(chalk.gray(`Working directory: ${process.cwd()}`));
        
        // Generate plan using orchestrator
        const planResult = await orchestrator.generatePlan(
          task,
          `User requested plan for: ${task}`,
          toolNames,
          process.cwd()
        );
        
        if (options.json) {
          // Output raw JSON
          console.log(JSON.stringify(planResult, null, 2));
        } else {
          // Display formatted plan
          console.log('\n' + UIFormatter.createPlanTable(planResult));
          
          if (options.verbose) {
            console.log('\n' + chalk.gray('Raw Plan JSON:'));
            console.log(JSON.stringify(planResult, null, 2));
          }
        }
        
        console.log(chalk.green('\n✅ Plan generated successfully'));
        
      } catch (error) {
        console.error(chalk.red('❌ Planning failed:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
    
  return planCommand;
}
