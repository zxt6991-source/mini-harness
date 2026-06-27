export interface SecurityPolicy {
  allowTools: string[];
  denyTools: string[];
  sandboxDir: string;
  allowNetwork: boolean;
  allowShell: boolean;
  allowedShellCommands: string[];
}
