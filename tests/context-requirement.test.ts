import { describe, expect, it } from 'vitest';
import { analyzeContextRequirement } from '../src/memory/context-requirement';

describe('analyzeContextRequirement', () => {
  it('detects project, history, reference, feedback, and lesson needs in Chinese and English', () => {
    expect(analyzeContextRequirement('上次项目进度和架构是什么')).toMatchObject({
      needsProjectContext: true,
      needsRecentHistory: true,
    });
    expect(analyzeContextRequirement('show me an example pattern')).toMatchObject({
      needsReferences: true,
    });
    expect(analyzeContextRequirement('记录这个错误教训')).toMatchObject({
      needsLessons: true,
    });
    expect(analyzeContextRequirement('that suggestion was rejected feedback')).toMatchObject({
      needsFeedback: true,
    });
  });

  it('falls back to user, project, and recent context for unknown queries', () => {
    expect(analyzeContextRequirement('hello')).toMatchObject({
      needsUserProfile: true,
      needsProjectContext: true,
      needsRecentHistory: true,
    });
  });
});
