import { describe, expect, it } from 'vitest';
import { SecurityGuard } from '../src/security/guard';
import { validateSandboxPath } from '../src/security/path';

describe('SecurityGuard', () => {
  it('denies tools listed in denyTools', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: ['shell'],
      sandboxDir: '.',
      allowNetwork: false,
      allowShell: false,
      allowedShellCommands: [],
    });

    await expect(guard.checkToolPermission('shell', {})).rejects.toThrow(
      'Tool denied by policy: shell',
    );
  });

  it('denies tools outside a non-empty allowTools list', async () => {
    const guard = new SecurityGuard({
      allowTools: ['echo'],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: false,
      allowShell: false,
      allowedShellCommands: [],
    });

    await expect(guard.checkToolPermission('http', {})).rejects.toThrow(
      'Tool not allowed by policy: http',
    );
  });

  it('allows tools inside allowTools', async () => {
    const guard = new SecurityGuard({
      allowTools: ['echo'],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: false,
      allowShell: false,
      allowedShellCommands: [],
    });

    await expect(guard.checkToolPermission('echo', {})).resolves.toBeUndefined();
  });
});

describe('validateSandboxPath', () => {
  it('resolves paths inside the sandbox', () => {
    expect(validateSandboxPath('/tmp/workspace', 'notes/a.txt')).toBe(
      '/tmp/workspace/notes/a.txt',
    );
  });

  it('allows the sandbox root', () => {
    expect(validateSandboxPath('/tmp/workspace', '.')).toBe('/tmp/workspace');
  });

  it('rejects paths outside the sandbox', () => {
    expect(() => validateSandboxPath('/tmp/workspace', '../secret.txt')).toThrow(
      'Path escapes sandbox: ../secret.txt',
    );
  });
});
