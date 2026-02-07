export interface PaymentCardTheme {
  background: string;
  accentOne: string;
  accentTwo: string;
  accentThree: string;
  logoText: string;
  pattern:
    | 'prism'
    | 'ribbons'
    | 'matrix'
    | 'sunset'
    | 'neonframe'
    | 'topo'
    | 'chrome'
    | 'paper'
    | 'aurora'
    | 'diagonal'
    | 'rings'
    | 'mesh';
}

const designSet: PaymentCardTheme[] = [
  {
    background: '#4A3FA8',
    accentOne: '#8B83E8',
    accentTwo: '#6E63CC',
    accentThree: '#C5BEFF',
    logoText: 'PRISM',
    pattern: 'prism',
  },
  {
    background: '#1B2534',
    accentOne: '#6D7681',
    accentTwo: '#394352',
    accentThree: '#A3ADB8',
    logoText: 'RIBBON',
    pattern: 'ribbons',
  },
  {
    background: '#1A6A4F',
    accentOne: '#2E8A65',
    accentTwo: '#4CA77F',
    accentThree: '#8FD4B5',
    logoText: 'MATRIX',
    pattern: 'matrix',
  },
  {
    background: '#D75885',
    accentOne: '#FF8AA9',
    accentTwo: '#FF5E8D',
    accentThree: '#CF82DB',
    logoText: 'SUNSET',
    pattern: 'sunset',
  },
  {
    background: '#2F4F8B',
    accentOne: '#7095D8',
    accentTwo: '#4F73B2',
    accentThree: '#A8C5FF',
    logoText: 'NEON',
    pattern: 'neonframe',
  },
  {
    background: '#2B3D6A',
    accentOne: '#4F638F',
    accentTwo: '#3B4F78',
    accentThree: '#8CA4D6',
    logoText: 'TOPO',
    pattern: 'topo',
  },
  {
    background: '#171B24',
    accentOne: '#3A4256',
    accentTwo: '#252C3B',
    accentThree: '#6A7591',
    logoText: 'CHROME',
    pattern: 'chrome',
  },
  {
    background: '#2D3447',
    accentOne: '#454F66',
    accentTwo: '#394257',
    accentThree: '#7782A1',
    logoText: 'PAPER',
    pattern: 'paper',
  },
];

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getStableDesignIndex(stableKey?: string | number | null): number {
  if (typeof stableKey === 'number' && Number.isFinite(stableKey)) {
    return Math.abs(Math.floor(stableKey)) % designSet.length;
  }

  const key = String(stableKey || '').trim();
  if (key.length > 0) {
    return stableHash(key) % designSet.length;
  }

  return 0;
}

export function getPaymentCardTheme(
  _brand: string | null,
  stableKey?: string | number | null
): PaymentCardTheme {
  return designSet[getStableDesignIndex(stableKey)];
}
