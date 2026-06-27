import { nanoid } from 'nanoid';

export function createId(prefix = 'id'): string {
  return `${prefix}_${nanoid(12)}`;
}
