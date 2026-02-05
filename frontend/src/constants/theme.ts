export const COLORS = {
  // Primary colors from BEANZ design
  primaryBlue: '#1E90FF',
  darkNavy: '#1B3A52',
  background: '#F8F9FA',
  white: '#FFFFFF',
  gray: '#8E8E93',
  lightGray: '#E5E5EA',
  orange: '#FF6B35',
  green: '#34C759',
  yellow: '#FFD60A',
  red: '#FF3B30',
  
  // Text colors
  textPrimary: '#1B3A52',
  textSecondary: '#8E8E93',
  textLight: '#FFFFFF',
  
  // Background variants
  cardBackground: '#FFFFFF',
  inputBackground: '#F2F2F7',
  
  // Gradient colors for rewards
  goldGradientStart: '#FFE4B5',
  goldGradientEnd: '#FFF8DC',
};

export const FONTS = {
  // Font sizes
  h1: 32,
  h2: 24,
  h3: 20,
  h4: 18,
  body: 16,
  bodySmall: 14,
  caption: 12,
  
  // Font weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};
