import type { Message } from '../core';

export interface Summarizer {
  summarize(messages: Message[]): Promise<string>;
}

export interface SimpleSummarizerOptions {
  maxSummaryCharacters?: number;
}

function truncate(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }

  if (maxCharacters <= 3) {
    return text.slice(0, maxCharacters);
  }

  return `${text.slice(0, maxCharacters - 1)}...`;
}

export class SimpleSummarizer implements Summarizer {
  private readonly maxSummaryCharacters: number;

  constructor(options: SimpleSummarizerOptions = {}) {
    this.maxSummaryCharacters = options.maxSummaryCharacters ?? 500;
  }

  async summarize(messages: Message[]): Promise<string> {
    const summary = messages
      .filter((message) => message.role !== 'system')
      .map((message) => `${message.role}: ${message.content}`)
      .join(' | ');

    return truncate(summary, this.maxSummaryCharacters);
  }
}
