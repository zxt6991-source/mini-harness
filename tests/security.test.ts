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

  it('denies network category tools when network access is disabled', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: false,
      allowShell: true,
      allowedShellCommands: [],
    });

    await expect(
      guard.checkToolPermission('web_fetch', {}, {
        category: 'network',
        requiredPermissions: ['network'],
      } as never),
    ).rejects.toThrow('Network tools are disabled by policy: web_fetch');
  });

  it('denies execution category tools when shell access is disabled', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: true,
      allowShell: false,
      allowedShellCommands: [],
    });

    await expect(
      guard.checkToolPermission('shell_exec', {}, {
        category: 'execution',
        requiredPermissions: ['shell'],
      } as never),
    ).rejects.toThrow('Shell tools are disabled by policy: shell_exec');
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
