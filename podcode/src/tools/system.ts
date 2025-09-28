import { z } from 'zod';
import { spawn } from 'child_process';
import { Tool, ToolContext, ToolResult } from './types.js';

const SystemCheckParametersSchema = z.object({
  tool: z.string().describe('The tool/command to check for availability (e.g., "node", "git", "python", "docker")'),
  install_if_missing: z.boolean().optional().default(false).describe('Automatically install if missing')
});

export class SystemCheckTool implements Tool {
  name = 'system_check';
  description = 'Check if a system tool/command is available and optionally install it if missing. Supports common development tools like node, git, python, docker, etc.';
  parameters = SystemCheckParametersSchema;

  async execute(args: z.infer<typeof SystemCheckParametersSchema>, context: ToolContext): Promise<ToolResult> {
    const { tool, install_if_missing } = args;
    
    // Check if tool exists
    const checkResult = await this.checkCommand(`which ${tool}`, context);
    
    if (checkResult.success) {
      // Get version info if available
      const versionResult = await this.checkCommand(`${tool} --version || ${tool} -v || echo "Version check not supported"`, context);
      
      return {
        success: true,
        output: `✅ ${tool} is installed\nLocation: ${checkResult.output}\nVersion: ${versionResult.output}`
      };
    }
    
    if (!install_if_missing) {
      return {
        success: false,
        output: `❌ ${tool} is not installed`,
        error: `Tool '${tool}' not found in PATH`
      };
    }
    
    // Attempt to install based on tool name and platform
    const installResult = await this.installTool(tool, context);
    
    if (installResult.success) {
      // Verify installation
      const verifyResult = await this.checkCommand(`which ${tool}`, context);
      if (verifyResult.success) {
        return {
          success: true,
          output: `✅ Successfully installed ${tool}\n${installResult.output}\nLocation: ${verifyResult.output}`
        };
      }
    }
    
    return {
      success: false,
      output: installResult.output,
      error: `Failed to install ${tool}: ${installResult.error}`
    };
  }
  
  private async checkCommand(command: string, context: ToolContext): Promise<ToolResult> {
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', command], {
        cwd: context.workingDirectory,
        stdio: 'pipe',
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          output: stdout.trim(),
          error: code !== 0 ? stderr.trim() : undefined
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          output: '',
          error: error.message
        });
      });
    });
  }
  
  private async installTool(tool: string, context: ToolContext): Promise<ToolResult> {
    const platform = process.platform;
    let installCommand = '';
    
    // Common installation commands based on tool and platform
    const installMap: Record<string, Record<string, string>> = {
      node: {
        darwin: 'brew install node',
        linux: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs'
      },
      npm: {
        darwin: 'brew install node', // npm comes with node
        linux: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs'
      },
      git: {
        darwin: 'brew install git',
        linux: 'sudo apt-get update && sudo apt-get install -y git'
      },
      brew: {
        darwin: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        linux: 'echo "Homebrew not available on Linux, try apt-get or other package managers"'
      },
      python: {
        darwin: 'brew install python',
        linux: 'sudo apt-get update && sudo apt-get install -y python3 python3-pip'
      },
      pip: {
        darwin: 'brew install python', // pip comes with python
        linux: 'sudo apt-get update && sudo apt-get install -y python3-pip'
      },
      docker: {
        darwin: 'brew install --cask docker',
        linux: 'curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh'
      }
    };
    
    if (installMap[tool] && installMap[tool][platform]) {
      installCommand = installMap[tool][platform];
    } else {
      // Try common package managers
      if (platform === 'darwin') {
        installCommand = `brew install ${tool}`;
      } else if (platform === 'linux') {
        installCommand = `sudo apt-get update && sudo apt-get install -y ${tool}`;
      } else {
        return {
          success: false,
          output: '',
          error: `Don't know how to install '${tool}' on platform '${platform}'`
        };
      }
    }
    
    return this.checkCommand(installCommand, context);
  }

  toOpenAITool() {
    return {
      type: 'function' as const,
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description: 'The tool/command to check for availability (e.g., "node", "git", "python", "docker")'
            },
            install_if_missing: {
              type: 'boolean',
              description: 'Automatically install if missing',
              default: false
            }
          },
          required: ['tool']
        }
      }
    };
  }
}
