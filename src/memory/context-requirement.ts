// 该文件提供轻量级上下文需求分析，用于决定本轮请求应加载哪些记忆源。
import type { MemoryEntryType } from './types';

export interface ContextRequirement {
  needsUserProfile: boolean;
  needsProjectContext: boolean;
  needsRecentHistory: boolean;
  needsReferences: boolean;
  needsFeedback: boolean;
  needsLessons: boolean;
  explicitTypes: MemoryEntryType[];
}

function containsAny(query: string, words: string[]): boolean {
  return words.some((word) => query.includes(word));
}

function emptyRequirement(): ContextRequirement {
  return {
    needsUserProfile: false,
    needsProjectContext: false,
    needsRecentHistory: false,
    needsReferences: false,
    needsFeedback: false,
    needsLessons: false,
    explicitTypes: [],
  };
}

export function analyzeContextRequirement(input: string): ContextRequirement {
  const query = input.toLowerCase();
  const requirement = emptyRequirement();

  if (
    containsAny(query, [
      'prefer',
      'style',
      'habit',
      'like',
      '偏好',
      '习惯',
      '风格',
      '记住',
    ])
  ) {
    requirement.needsUserProfile = true;
    requirement.explicitTypes.push('user');
  }

  if (
    containsAny(query, [
      'project',
      'task',
      'status',
      'progress',
      'architecture',
      '项目',
      '任务',
      '进度',
      '架构',
    ])
  ) {
    requirement.needsProjectContext = true;
    requirement.explicitTypes.push('project');
  }

  if (
    containsAny(query, [
      'previous',
      'before',
      'last time',
      'remember',
      '上次',
      '之前',
      '刚才',
      '历史',
    ])
  ) {
    requirement.needsRecentHistory = true;
    requirement.explicitTypes.push('episodic');
  }

  if (
    containsAny(query, [
      'example',
      'sample',
      'pattern',
      'how to',
      '示例',
      '模式',
      '参考',
      '怎么做',
    ])
  ) {
    requirement.needsReferences = true;
    requirement.explicitTypes.push('reference');
  }

  if (
    containsAny(query, [
      'feedback',
      'rejected',
      'approved',
      '拒绝',
      '采纳',
      '反馈',
    ])
  ) {
    requirement.needsFeedback = true;
    requirement.explicitTypes.push('feedback');
  }

  if (
    containsAny(query, [
      'bug',
      'error',
      'failure',
      'lesson',
      '错误',
      '失败',
      '教训',
    ])
  ) {
    requirement.needsLessons = true;
    requirement.explicitTypes.push('lesson');
  }

  if (
    !requirement.needsUserProfile &&
    !requirement.needsProjectContext &&
    !requirement.needsRecentHistory &&
    !requirement.needsReferences &&
    !requirement.needsFeedback &&
    !requirement.needsLessons
  ) {
    requirement.needsUserProfile = true;
    requirement.needsProjectContext = true;
    requirement.needsRecentHistory = true;
    requirement.explicitTypes.push('user', 'project', 'episodic');
  }

  requirement.explicitTypes = [...new Set(requirement.explicitTypes)];
  return requirement;
}
