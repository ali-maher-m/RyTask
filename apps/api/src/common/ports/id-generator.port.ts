import { uuidv7 } from 'uuidv7';

/** Port for sortable, exposable id generation (ADR-003) — injectable for tests. */
export interface IdGenerator {
  next(): string;
}

/** DI token for the IdGenerator port. */
export const ID_GENERATOR = Symbol('ID_GENERATOR');

export const systemIdGenerator: IdGenerator = {
  next: () => uuidv7(),
};
