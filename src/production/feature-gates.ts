// 该文件提供本地运行时 Feature Gate 评估，用于灰度、开关和用户分组。

export interface FeatureGateContext {
  userId?: string;
  sessionId?: string;
  attributes?: Record<string, string | number | boolean | undefined>;
}

export interface FeatureGateRule {
  enabled?: boolean;
  rolloutPercent?: number;
  include?: string[];
  exclude?: string[];
}

export type FeatureGateConfig = Record<string, boolean | FeatureGateRule>;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function resolveSubject(context: FeatureGateContext | undefined): string {
  return context?.userId ?? context?.sessionId ?? 'anonymous';
}

function includesSubject(list: string[] | undefined, subject: string): boolean {
  return Array.isArray(list) && list.includes(subject);
}

export class FeatureGateEvaluator {
  constructor(private readonly gates: FeatureGateConfig = {}) {}

  isEnabled(featureKey: string, context?: FeatureGateContext): boolean {
    const rule = this.gates[featureKey];

    if (rule === undefined) {
      return false;
    }

    if (typeof rule === 'boolean') {
      return rule;
    }

    const subject = resolveSubject(context);

    if (includesSubject(rule.exclude, subject)) {
      return false;
    }

    if (includesSubject(rule.include, subject)) {
      return true;
    }

    if (rule.enabled === false) {
      return false;
    }

    const rolloutPercent =
      rule.rolloutPercent === undefined ? 100 : clampPercent(rule.rolloutPercent);

    if (rolloutPercent <= 0) {
      return false;
    }

    if (rolloutPercent >= 100) {
      return true;
    }

    const bucket = stableHash(`${featureKey}:${subject}`) % 100;
    return bucket < rolloutPercent;
  }
}
