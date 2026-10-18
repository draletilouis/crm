// Options shared by the API (validation) and the app (dropdowns). Same wording as the old spreadsheet.

const STAGES = [
  { key: 'new', label: 'New', hint: 'Found, not yet properly spoken to' },
  { key: 'contacted', label: 'Contacted', hint: 'Pitched' },
  { key: 'demo', label: 'Demo done', hint: 'Saw the app working' },
  { key: 'trial', label: 'Trial started', hint: 'Has an account and is entering stock' },
  { key: 'paying', label: 'Paying', hint: 'On a paid plan' },
  { key: 'lost', label: 'Lost', hint: 'Pick a lost reason' },
];

const INTEREST = [
  { key: 'hot', label: 'Hot', hint: 'Wants to start this week' },
  { key: 'warm', label: 'Warm', hint: 'Interested, needs time' },
  { key: 'cold', label: 'Cold', hint: 'Polite but unlikely' },
];

const BUSINESS_TYPES = ['Retail shop', 'Wholesale', 'Pharmacy', 'Hardware', 'Phones & electronics', 'Supermarket',
  'Salon / beauty', 'Restaurant / bar', 'Other'];

const TRACKS_STOCK = ['Notebook', 'Excel', 'Other app', 'Nothing'];

const LOST_REASONS = ['Too expensive', 'Not interested', 'No smartphone / internet', 'Uses another system',
  'Owner not available', 'Closed business', 'Other'];

const VISIT_KINDS = [
  { key: 'visit', label: 'Visit' },
  { key: 'call', label: 'Call' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

const CLOSED_STAGES = ['paying', 'lost'];

module.exports = { STAGES, INTEREST, BUSINESS_TYPES, TRACKS_STOCK, LOST_REASONS, VISIT_KINDS, CLOSED_STAGES };
