// Ugandan phone numbers are stored as 2567XXXXXXXX so "0772 123 456", "+256 772123456" and
// "772123456" all match the same lead. Other countries are kept as given digits (with their code).

function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+') || digits.startsWith('00')) {
    digits = digits.replace(/^00/, '');
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (digits.length === 10 && digits.startsWith('0')) return `256${digits.slice(1)}`;
  if (digits.length === 9 && /^[37]/.test(digits)) return `256${digits}`;
  if (digits.length === 12 && digits.startsWith('256')) return digits;
  return null;
}

// 256772123456 -> 0772 123 456
function formatPhone(stored) {
  if (!stored) return '';
  if (stored.startsWith('256') && stored.length === 12) {
    const local = `0${stored.slice(3)}`;
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return `+${stored}`;
}

module.exports = { normalizePhone, formatPhone };
