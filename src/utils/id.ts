// 该文件提供带前缀的唯一 ID 生成函数，用于消息、工具调用等实体标识。
import { nanoid } from 'nanoid';

/** 生成带指定前缀的短唯一 ID，默认前缀为 id。 */
export function createId(prefix = 'id'): string {
  return `${prefix}_${nanoid(12)}`;
}
