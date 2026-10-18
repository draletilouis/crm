class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

// Express 4 does not catch rejected promises; route handlers go through this.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const str = (v, max = 200) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const intId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fail(404, 'Not found');
};

module.exports = { HttpError, fail, ah, str, isDate, intId };
