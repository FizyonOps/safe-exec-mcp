#!/usr/bin/env node
// ^ Ensures the compiled output can be run as a CLI
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';

// Environment-based configuration with safe defaults
const ALLOWED_COMMANDS = (process.env.ALLOWED_COMMANDS || 'git,ls,pwd,cat,node,npm').split(',').map(c => c.trim()).filter(Boolean);
const DEFAULT_TIMEOUT_MS = Number(process.env.EXEC_TIMEOUT_MS || 30000);
const DEFAULT_CWD = process.cwd();

// Utility: execute a command without invoking a shell (prevents injection)
async function execNoShell(command: string, args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string; code: number }>{
  if (!ALLOWED_COMMANDS.includes(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  const cwd = options.cwd || DEFAULT_CWD;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        child.kill('SIGKILL');
        finished = true;
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('error', (err) => {
      if (!finished) {
        clearTimeout(timeout);
        finished = true;
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (!finished) {
        clearTimeout(timeout);
        finished = true;
        resolve({ stdout, stderr, code: code ?? -1 });
      }
    });
  });
}

// Minimal tool schema types
type ExecuteCommandArgs = {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  dryRun?: boolean;
};

class SafeExecMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'safe-exec-mcp', version: '0.1.0' },
      { capabilities: { tools: { listChanged: false } } }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'execute_command',
          description: 'Execute a whitelisted command without using a shell',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: `One of: ${ALLOWED_COMMANDS.join(', ')}` },
              args: { type: 'array', items: { type: 'string' } },
              cwd: { type: 'string' },
              timeoutMs: { type: 'number' },
              dryRun: { type: 'boolean' }
            },
            required: ['command']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = (request as any).params as { name: string; arguments: ExecuteCommandArgs };

      if (name !== 'execute_command') {
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true } as any;
      }

      const { command, args: cmdArgs = [], cwd, timeoutMs, dryRun } = args || ({} as ExecuteCommandArgs);

      // Validate command and args early
      if (!ALLOWED_COMMANDS.includes(command)) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `Command not allowed: ${command}` }) }], isError: true } as any;
      }

      if (dryRun) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, dryRun: true, command, args: cmdArgs, cwd: cwd || DEFAULT_CWD, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS }) }] } as any;
      }

      try {
        const result = await execNoShell(command, cmdArgs, { cwd, timeoutMs });
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, command, args: cmdArgs, ...result }) }] } as any;
      } catch (error: any) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, command, args: cmdArgs, error: String(error?.message || error) }) }], isError: true } as any;
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // eslint-disable-next-line no-console
    console.error(`safe-exec-mcp running. Allowed: ${ALLOWED_COMMANDS.join(', ')}`);
  }
}

// Only run if executed as a script (not required/imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new SafeExecMcpServer();
  server.run().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal:', err);
    process.exit(1);
  });
}

// Export for testing
export { execNoShell, ALLOWED_COMMANDS, DEFAULT_TIMEOUT_MS, SafeExecMcpServer };
