export interface PaymentCardTheme {
  background: string;
  accentOne: string;
  accentTwo: string;
  accentThree: string;
  logoText: string;
  pattern: 'aurora' | 'diagonal' | 'rings' | 'mesh';
}

const patterns: PaymentCardTheme['pattern'][] = ['aurora', 'diagonal', 'rings', 'mesh'];

const fallbackThemes: Omit<PaymentCardTheme, 'logoText' | 'pattern'>[] = [
  { background: '#D93B7A', accentOne: '#FF7DB3', accentTwo: '#FFBEDB', accentThree: '#FFD9EA' },
  { background: '#744BDE', accentOne: '#A083FF', accentTwo: '#D7CCFF', accentThree: '#EAE2FF' },
  { background: '#2E7D5A', accentOne: '#63C999', accentTwo: '#C4F6DD', accentThree: '#E8FFF3' },
  { background: '#0F8B8D', accentOne: '#48C9C9', accentTwo: '#A9F1EE', accentThree: '#D8FFFA' },
];

const visaThemes: Omit<PaymentCardTheme, 'logoText' | 'pattern'>[] = [
  { background: '#2B4EFF', accentOne: '#6F8BFF', accentTwo: '#A6B8FF', accentThree: '#D5DEFF' },
  { background: '#1C2EB8', accentOne: '#4A6CFF', accentTwo: '#88A2FF', accentThree: '#BDCCFF' },
];

const mastercardThemes: Omit<PaymentCardTheme, 'logoText' | 'pattern'>[] = [
  { background: '#1E1E1E', accentOne: '#FF6A3D', accentTwo: '#FFC14D', accentThree: '#FFE2AD' },
  { background: '#2E0F0F', accentOne: '#FF8B66', accentTwo: '#FFD081', accentThree: '#FFE7B8' },
];

const amexThemes: Omit<PaymentCardTheme, 'logoText' | 'pattern'>[] = [
  { background: '#0F8B8D', accentOne: '#3CCFCF', accentTwo: '#9CF8E8', accentThree: '#D6FFF7' },
  { background: '#0B5F8B', accentOne: '#49B9FF', accentTwo: '#9CDBFF', accentThree: '#D8F1FF' },
];

function pickTheme(
  pool: Omit<PaymentCardTheme, 'logoText' | 'pattern'>[],
  index: number
): Omit<PaymentCardTheme, 'logoText' | 'pattern'> {
  return pool[index % pool.length];
}

export function getPaymentCardTheme(brand: string | null, index: number): PaymentCardTheme {
  const normalized = (brand || '').toLowerCase();
  const pattern = patterns[index % patterns.length];

  if (normalized === 'visa') {
    const palette = pickTheme(visaThemes, index);
    return {
      ...palette,
      logoText: 'VISA',
      pattern,
    };
  }

  if (normalized === 'mastercard') {
    const palette = pickTheme(mastercardThemes, index);
    return {
      ...palette,
      logoText: 'MASTERCARD',
      pattern,
    };
  }

  if (normalized === 'amex') {
    const palette = pickTheme(amexThemes, index);
    return {
      ...palette,
      logoText: 'AMEX',
      pattern,
    };
  }

  const palette = pickTheme(fallbackThemes, index);
  return {
    ...palette,
    logoText: 'CARD',
    pattern,
  };
}
