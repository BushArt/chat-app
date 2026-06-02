const { isTokenRevoked, getTokenIssuedAt } = require('../../../utils/tokenRevocation');

describe('tokenRevocation', () => {
  test('getTokenIssuedAt prefers loginAt over iat', () => {
    expect(getTokenIssuedAt({ loginAt: 5000, iat: 1 })).toBe(5000);
  });

  test('getTokenIssuedAt falls back to iat seconds', () => {
    expect(getTokenIssuedAt({ iat: 10 })).toBe(10000);
  });

  test('isTokenRevoked is false when lastLogout is null', () => {
    expect(isTokenRevoked({ loginAt: 1000 }, null)).toBe(false);
  });

  test('isTokenRevoked rejects token issued before logout', () => {
    const logout = new Date('2026-01-01T12:00:00.500Z');
    expect(isTokenRevoked({ loginAt: logout.getTime() - 1000 }, logout)).toBe(true);
  });

  test('isTokenRevoked accepts token issued after logout in same second', () => {
    const logout = new Date('2026-01-01T12:00:00.500Z');
    expect(isTokenRevoked({ loginAt: logout.getTime() + 100 }, logout)).toBe(false);
  });
});
