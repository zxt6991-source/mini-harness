// 该文件定义对话摘要接口，并提供一个基于截断拼接的简单摘要实现。
import type { Message } from '../core';

export interface Summarizer {
  summarize(messages: Message[]): Promise<string>;
}

export interface SimpleSummarizerOptions {
  maxSummaryCharacters?: number;
}

/** 将文本截断到指定字符数，必要时用省略号表示还有后续内容。 */
function truncate(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }

  if (maxCharacters <= 3) {
    return text.slice(0, maxCharacters);
  }

  return `${text.slice(0, maxCharacters - 1)}...`;
}

/** 基于消息角色和内容拼接摘要的轻量摘要器。 */
export class SimpleSummarizer implements Summarizer {
  private readonly maxSummaryCharacters: number;

  /** 设置摘要的最大字符数，未指定时使用默认上限。 */
  constructor(options: SimpleSummarizerOptions = {}) {
    this.maxSummaryCharacters = options.maxSummaryCharacters ?? 500;
  }

  /** 将非 system 消息拼接成简短文本摘要，并按字符上限截断。 */
  async summarize(messages: Message[]): Promise<string> {
    const summary = messages
      .filter((message) => message.role !== 'system')
      .map((message) => `${message.role}: ${message.content}`)
      .join(' | ');

    return truncate(summary, this.maxSummaryCharacters);
  }
}
