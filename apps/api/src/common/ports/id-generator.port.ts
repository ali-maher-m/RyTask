import { uuidv7 } from 'uuidv7';

/** Port for sortable, exposable id generation (ADR-003) — injectable for tests. */
export interface IdGenerator {
  next(): string;
}

export const systemIdGenerator: IdGenerator = {
  next: () => uuidv7(),
};
