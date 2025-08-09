import { describe, it, expect } from 'vitest';
import { execNoShell } from './server.js';

// Ensure environment allows commands used in tests
process.env.ALLOWED_COMMANDS = process.env.ALLOWED_COMMANDS || 'node,echo,ls,pwd';

describe('execNoShell', () => {
  it('executes a simple allowed command', async () => {
    const result = await execNoShell('node', ['-e', 'process.stdout.write("ok")']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('ok');
  });

  it('rejects disallowed commands', async () => {
    await expect(execNoShell('rm', ['-rf', '/'])).rejects.toThrow(/Command not allowed/);
  });

  it('times out long-running commands', async () => {
    const start = Date.now();
    await expect(execNoShell('node', ['-e', 'setTimeout(()=>{}, 2000)'], { timeoutMs: 200 })).rejects.toThrow(/timed out/);
    expect(Date.now() - start).toBeLessThan(1500);
  });
});
