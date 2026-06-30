import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectDangerousCommand } from '../src/security/command';
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
      path.join(realpathSync.native('/tmp'), 'workspace', 'notes', 'a.txt'),
    );
  });

  it('allows the sandbox root', () => {
    expect(validateSandboxPath('/tmp/workspace', '.')).toBe(
      path.join(realpathSync.native('/tmp'), 'workspace'),
    );
  });

  it('rejects paths outside the sandbox', () => {
    expect(() => validateSandboxPath('/tmp/workspace', '../secret.txt')).toThrow(
      'Path escapes sandbox: ../secret.txt',
    );
  });

  it('rejects URL encoded path traversal', () => {
    expect(() => validateSandboxPath('/tmp/workspace', '..%2fsecret.txt')).toThrow(
      'Path escapes sandbox',
    );
  });

  it('rejects double URL encoded path traversal', () => {
    expect(() =>
      validateSandboxPath('/tmp/workspace', '..%252fsecret.txt'),
    ).toThrow('Path escapes sandbox');
  });

  it('rejects backslash traversal on every platform', () => {
    expect(() =>
      validateSandboxPath('/tmp/workspace', 'subdir\\..\\..\\secret.txt'),
    ).toThrow('Path escapes sandbox');
  });

  it('rejects absolute paths that only share the sandbox prefix', () => {
    expect(() =>
      validateSandboxPath('/tmp/workspace', '/tmp/workspace-evil/file.txt'),
    ).toThrow('Path escapes sandbox');
  });

  it('rejects symlinks that resolve outside the sandbox', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'miniharness-security-'));
    const sandbox = path.join(root, 'workspace');
    const secret = path.join(root, 'secret.txt');
    const link = path.join(sandbox, 'secret-link');
    mkdirSync(sandbox);
    writeFileSync(secret, 'secret');
    symlinkSync(secret, link);

    expect(() => validateSandboxPath(sandbox, 'secret-link')).toThrow(
      'Path escapes sandbox',
    );
  });
});

describe('detectDangerousCommand', () => {
  it('allows a simple read-only command', () => {
    expect(detectDangerousCommand('ls -la ./notes')).toEqual({
      dangerous: false,
    });
  });

  it('blocks direct dangerous commands', () => {
    expect(detectDangerousCommand('rm -rf /')).toMatchObject({
      dangerous: true,
      command: 'rm',
    });
  });

  it('blocks dangerous commands hidden behind a pipe', () => {
    expect(detectDangerousCommand('cat file.txt | rm -rf /tmp/data')).toMatchObject({
      dangerous: true,
      command: 'rm',
    });
  });

  it('blocks inline interpreter execution', () => {
    expect(detectDangerousCommand('bash -c "rm -rf /"')).toMatchObject({
      dangerous: true,
      command: 'bash',
    });
  });

  it('allows explicitly safe package manager subcommands', () => {
    expect(detectDangerousCommand('apt list')).toEqual({
      dangerous: false,
    });
  });

  it('blocks package manager subcommands that mutate the system', () => {
    expect(detectDangerousCommand('apt install curl')).toMatchObject({
      dangerous: true,
      command: 'apt',
    });
  });
});

describe('SecurityGuard guardrails', () => {
  it('uses allowedShellCommands to restrict execution tools', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: true,
      allowShell: true,
      allowedShellCommands: ['ls'],
    });

    await expect(
      guard.checkToolPermission(
        'shell_exec',
        { command: 'cat package.json' },
        { category: 'execution', requiredPermissions: ['shell'] } as never,
      ),
    ).rejects.toThrow('Shell command not allowed by policy: cat');
  });

  it('blocks dangerous execution tool commands before the tool runs', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: true,
      allowShell: true,
      allowedShellCommands: [],
    });

    await expect(
      guard.checkToolPermission(
        'shell_exec',
        { command: 'rm -rf /' },
        { category: 'execution', requiredPermissions: ['shell'] } as never,
      ),
    ).rejects.toThrow('Dangerous shell command blocked');
  });

  it('validates file tool path parameters against the sandbox', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: [],
      sandboxDir: '/tmp/workspace',
      allowNetwork: true,
      allowShell: false,
      allowedShellCommands: [],
    });

    await expect(
      guard.checkToolPermission(
        'read_file',
        { path: '..%2fsecret.txt' },
        { category: 'file', requiredPermissions: ['file'] } as never,
      ),
    ).rejects.toThrow('Path escapes sandbox');
  });

  it('rejects unsafe resource parameter ranges', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: true,
      allowShell: true,
      allowedShellCommands: [],
    });

    await expect(
      guard.checkToolPermission(
        'shell_exec',
        { command: 'ls', timeoutMs: 600_000 },
        { category: 'execution', requiredPermissions: ['shell'] } as never,
      ),
    ).rejects.toThrow('Parameter timeoutMs out of allowed range');
  });
});
