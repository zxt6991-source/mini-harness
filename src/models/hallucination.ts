// 该文件提供模型工具调用幻觉检测所需的轻量工具名建议逻辑。
/** 根据编辑距离为不存在的工具名生成纠正建议。 */
export function suggestToolName(
  name: string,
  available: string[],
): string | undefined {
  const best = available
    .map((candidate) => ({ candidate, score: similarity(name, candidate) }))
    .sort((left, right) => right.score - left.score)[0];

  if (best && best.score >= 0.6) {
    return `Use '${best.candidate}' instead of '${name}'.`;
  }

  return available.length
    ? `Available tools: ${available.slice(0, 5).join(', ')}`
    : undefined;
}

function similarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 1;
  }

  return (maxLength - levenshtein(left, right)) / maxLength;
}

function levenshtein(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);

  for (let column = 1; column <= right.length; column++) {
    rows[0][column] = column;
  }

  for (let row = 1; row <= left.length; row++) {
    for (let column = 1; column <= right.length; column++) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost,
      );
    }
  }

  return rows[left.length][right.length];
}
