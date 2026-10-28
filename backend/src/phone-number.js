import parsePhoneNumber from 'libphonenumber-js/max';

const LIMITATIONS = [
  'Numbering-plan validation does not establish that a number is assigned, active, reachable, or controlled by a particular person.',
  'No carrier, subscriber, identity, call, or message records are queried.',
  'Metadata can lag real-world numbering changes; confirm material findings with an authorized primary source.'
];

export function inspectPhoneNumber(input, defaultCountry = 'NG') {
  if (typeof input !== 'string' || input.length > 160) {
    throw Object.assign(new Error('Provide a phone number no longer than 160 characters.'), { statusCode: 400, code: 'INVALID_PHONE_INPUT' });
  }
  const value = input.trim();
  if (!value || !/^[+()0-9.\\s-]+$/.test(value)) {
    throw Object.assign(new Error('Use digits and common phone-number separators only.'), { statusCode: 400, code: 'INVALID_PHONE_INPUT' });
  }
  const parsed = parsePhoneNumber(value, defaultCountry, { extract: false });
  if (!parsed) return { input: value, parsed: false, possible: false, valid: false, limitations: LIMITATIONS };
  return {
    input: value, parsed: true, e164: parsed.number,
    internationalFormat: parsed.formatInternational(), nationalFormat: parsed.formatNational(),
    countryCallingCode: parsed.countryCallingCode, country: parsed.country || null,
    countryCallingRegion: parsed.country || 'non-geographic or undetermined',
    possible: parsed.isPossible(), valid: parsed.isValid(), numberType: parsed.getType() || 'unknown',
    metadataSource: 'libphonenumber-js/max (Google libphonenumber numbering-plan metadata)',
    checkedAt: new Date().toISOString(), limitations: LIMITATIONS
  };
}
