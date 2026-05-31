import { uuidv7 } from 'uuidv7';

/**
 * Port for generating sortable, exposable identifiers (ADR-003).
 * Injected so tests can supply a deterministic generator (§14.4).
 */
export interface IdGenerator {
  next(): string;
}

export const uuidv7Generator: IdGenerator = {
  next: () => uuidv7(),
};
