import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// AppSync's Int is 32-bit: a millisecond timestamp stored as a.integer() is rejected at runtime (the bed
// holds failed this way), so every *Ms field must be a float.
describe('data schema', () => {
  it('never stores a millisecond timestamp in a 32-bit integer', () => {
    const schema = readFileSync(resolve(__dirname, '../amplify/data/resource.ts'), 'utf8');
    expect(schema).not.toMatch(/Ms:\s*a\.integer\(/);
  });
});
