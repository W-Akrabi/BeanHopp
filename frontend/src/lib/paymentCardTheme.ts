export interface PaymentCardTheme {
  background: string;
  accentOne: string;
  accentTwo: string;
  logoText: string;
}

const fallbackThemes: PaymentCardTheme[] = [
  { background: '#D93B7A', accentOne: '#FF7DB3', accentTwo: '#FFBEDB', logoText: 'CARD' },
  { background: '#744BDE', accentOne: '#A083FF', accentTwo: '#D7CCFF', logoText: 'CARD' },
  { background: '#2E7D5A', accentOne: '#63C999', accentTwo: '#C4F6DD', logoText: 'CARD' },
];

export function getPaymentCardTheme(brand: string | null, index: number): PaymentCardTheme {
  const normalized = (brand || '').toLowerCase();

  if (normalized === 'visa') {
    return {
      background: '#2B4EFF',
      accentOne: '#6F8BFF',
      accentTwo: '#A6B8FF',
      logoText: 'VISA',
    };
  }

  if (normalized === 'mastercard') {
    return {
      background: '#1E1E1E',
      accentOne: '#FF6A3D',
      accentTwo: '#FFC14D',
      logoText: 'MASTERCARD',
    };
  }

  if (normalized === 'amex') {
    return {
      background: '#0F8B8D',
      accentOne: '#3CCFCF',
      accentTwo: '#9CF8E8',
      logoText: 'AMEX',
    };
  }

  return fallbackThemes[index % fallbackThemes.length];
}
