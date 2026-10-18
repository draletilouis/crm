const { normalizePhone, formatPhone } = require('../src/phone');

describe('phone numbers', () => {
  test.each([
    ['0772 123 456', '256772123456'],
    ['0772-123-456', '256772123456'],
    ['772123456', '256772123456'],
    ['+256 772 123456', '256772123456'],
    ['256772123456', '256772123456'],
    ['00256772123456', '256772123456'],
    ['+254 712 345678', '254712345678'],
  ])('%s becomes %s', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  test.each(['', '   ', 'abc', '0772', '12345678901234567', null, undefined])('rejects %p', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  test('formats for display', () => {
    expect(formatPhone('256772123456')).toBe('0772 123 456');
    expect(formatPhone('254712345678')).toBe('+254712345678');
    expect(formatPhone(null)).toBe('');
  });
});
