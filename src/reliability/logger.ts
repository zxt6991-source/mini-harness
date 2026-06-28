// 该文件集中创建 pino 日志实例，供模型、工具和 MCP 调用记录运行信息。
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});
