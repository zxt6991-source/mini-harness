// 该文件提供 PGE 独立评估结果的轻量解析，供编排层标准化 evaluator 输出。
export interface EvaluationInput {
  criteria: string[];
  output: string;
  evaluationText: string;
}

export interface EvaluationResult {
  passed: boolean;
  confidence: 'low' | 'medium' | 'high';
  issues: string[];
}

/** 解析独立 evaluator 输出，采用保守通过标准。 */
export function evaluateOutput(input: EvaluationInput): EvaluationResult {
  const lines = input.evaluationText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0]?.toLowerCase() ?? '';
  const issues = lines
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-+\s*/, ''));
  const confidenceLine = lines.find((line) =>
    line.toLowerCase().startsWith('confidence:'),
  );

  return {
    passed: firstLine === 'pass' && issues.length === 0,
    confidence: parseConfidence(confidenceLine),
    issues,
  };
}

function parseConfidence(line: string | undefined): EvaluationResult['confidence'] {
  const value = line?.split(':')[1]?.trim().toLowerCase();

  if (value === 'high' || value === 'medium' || value === 'low') {
    return value;
  }

  return 'low';
}
