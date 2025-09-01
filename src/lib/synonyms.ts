const SYNONYMS: Record<string, string> = {
  // user term -> canonical column or phrasing
  postcode: 'post_code',
  postcodes: 'post_code',
  "post code": 'post_code',
  name: 'account_name',
  "account name": 'account_name',
  cityname: 'city',
  statuscode: 'status',
  country: 'country_id',
  "account number": 'account_no',
  // add more as you learn user phrasing
};

export function normalizeQuestion(q: string) {
  let out = q.toLowerCase();
  for (const [k, v] of Object.entries(SYNONYMS)) {
    const re = new RegExp(`\\b${k}\\b`, 'gi');
    out = out.replace(re, v);
  }
  return out;
}
