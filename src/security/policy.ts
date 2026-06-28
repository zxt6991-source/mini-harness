// 该文件定义安全策略配置结构，用于约束工具、网络、Shell 和沙箱目录访问。
export interface SecurityPolicy {
  allowTools: string[];
  denyTools: string[];
  sandboxDir: string;
  allowNetwork: boolean;
  allowShell: boolean;
  allowedShellCommands: string[];
}
