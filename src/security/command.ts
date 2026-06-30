// 该文件提供 Shell 命令护栏，用于在 execution 工具真正执行前识别高风险命令。
import path from 'node:path';

export interface CommandGuardrailOptions {
  dangerousCommands?: string[];
  safeSubcommands?: Record<string, string[]>;
  blockShellControlOperators?: boolean;
  blockInlineExecution?: boolean;
}

export interface CommandDetectionResult {
  dangerous: boolean;
  reason?: string;
  command?: string;
}

const DEFAULT_DANGEROUS_COMMANDS = [
  'rm',
  'dd',
  'mkfs',
  'shred',
  'sysctl',
  'iptables',
  'insmod',
  'rmmod',
  'reboot',
  'shutdown',
  'chown',
  'chmod',
  'sudo',
  'passwd',
  'useradd',
  'userdel',
  'groupadd',
  'crontab',
  'visudo',
  'at',
  'mount',
  'umount',
  'cryptsetup',
  'gdisk',
  'mdadm',
  'lvcreate',
  'lvremove',
  'apt',
  'yum',
  'zypper',
];

const DEFAULT_SAFE_SUBCOMMANDS: Record<string, string[]> = {
  apt: ['list', 'search', 'show'],
  yum: ['list', 'search', 'info'],
  zypper: ['search', 'info'],
};

const INLINE_EXEC_FLAGS: Record<string, string[]> = {
  bash: ['-c'],
  sh: ['-c'],
  zsh: ['-c'],
  python: ['-c'],
  python3: ['-c'],
  node: ['-e', '--eval'],
};

const SHELL_CONTROL_PATTERNS = [
  { pattern: /(^|[^|])&&([^|]|$)/, label: '&&' },
  { pattern: /\|\|/, label: '||' },
  { pattern: /;/, label: ';' },
  { pattern: /\$\(/, label: '$(' },
  { pattern: /`/, label: '`' },
  { pattern: /(^|\s)&(\s|$)/, label: '&' },
  { pattern: /[\r\n]/, label: 'newline' },
];

/** 检测 Shell 命令是否包含已知高风险操作。 */
export function detectDangerousCommand(
  command: string,
  options: CommandGuardrailOptions = {},
): CommandDetectionResult {
  const trimmed = command.trim();

  if (!trimmed) {
    return { dangerous: false };
  }

  if (options.blockShellControlOperators !== false) {
    const controlOperator = findShellControlOperator(trimmed);
    if (controlOperator) {
      return {
        dangerous: true,
        reason: `Shell control operator is blocked: ${controlOperator}`,
      };
    }
  }

  let tokens: string[];

  try {
    tokens = tokenizeShellCommand(trimmed);
  } catch (error) {
    return {
      dangerous: true,
      reason: error instanceof Error ? error.message : 'Shell command parse failed',
    };
  }
  const commands = extractCommandSegments(tokens);
  const dangerousCommands = new Set(
    options.dangerousCommands ?? DEFAULT_DANGEROUS_COMMANDS,
  );
  const safeSubcommands = options.safeSubcommands ?? DEFAULT_SAFE_SUBCOMMANDS;

  for (const segment of commands) {
    const executable = basenameCommand(segment.command);

    if (!executable) {
      continue;
    }

    if (
      options.blockInlineExecution !== false &&
      INLINE_EXEC_FLAGS[executable]?.some((flag) => segment.args.includes(flag))
    ) {
      return {
        dangerous: true,
        reason: `Inline interpreter execution is blocked: ${executable}`,
        command: executable,
      };
    }

    const allowedSubcommands = safeSubcommands[executable];
    if (allowedSubcommands) {
      const subcommand = segment.args.find((arg) => !arg.startsWith('-'));

      if (!subcommand || !allowedSubcommands.includes(subcommand)) {
        return {
          dangerous: true,
          reason: `Unsafe subcommand: ${executable} ${subcommand ?? ''}`.trim(),
          command: executable,
        };
      }

      continue;
    }

    if (dangerousCommands.has(executable)) {
      return {
        dangerous: true,
        reason: `Dangerous command: ${executable}`,
        command: executable,
      };
    }
  }

  return { dangerous: false };
}

/** 提取命令链中实际执行的命令名，供 allowlist 策略复用。 */
export function extractShellCommands(command: string): string[] {
  return extractCommandSegments(tokenizeShellCommand(command))
    .map((segment) => basenameCommand(segment.command))
    .filter((name): name is string => name.length > 0);
}

interface CommandSegment {
  command: string;
  args: string[];
}

function findShellControlOperator(command: string): string | undefined {
  for (const item of SHELL_CONTROL_PATTERNS) {
    if (item.pattern.test(command)) {
      return item.label;
    }
  }

  return undefined;
}

function tokenizeShellCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;

  const pushCurrent = () => {
    if (current) {
      tokens.push(current);
      current = '';
    }
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

    if (char === '|') {
      pushCurrent();
      tokens.push('|');
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += '\\';
  }

  if (quote) {
    throw new Error('Unterminated quoted string in shell command');
  }

  pushCurrent();
  return tokens;
}

function extractCommandSegments(tokens: string[]): CommandSegment[] {
  const segments: CommandSegment[] = [];
  let current: string[] = [];

  const flush = () => {
    const commandTokens = stripLeadingAssignments(current);
    if (commandTokens.length > 0) {
      segments.push({
        command: commandTokens[0],
        args: commandTokens.slice(1),
      });
    }
    current = [];
  };

  for (const token of tokens) {
    if (token === '|') {
      flush();
      continue;
    }

    current.push(token);
  }

  flush();
  return segments;
}

function stripLeadingAssignments(tokens: string[]): string[] {
  let index = 0;

  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    index++;
  }

  return tokens.slice(index);
}

function basenameCommand(command: string): string {
  return path.basename(command).trim();
}
