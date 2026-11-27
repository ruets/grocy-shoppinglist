import { pruneStocked } from '../local';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('pruneStocked', () => {
  it('drops markers older than 7 days', () => {
    const now = 1_000_000_000_000;
    const day = 86_400_000;
    expect(pruneStocked({ 1: now - 8 * day, 2: now - 6 * day, 3: now }, now)).toEqual({ 2: now - 6 * day, 3: now });
  });
});
