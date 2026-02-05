import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  shadow?: 'none' | 'small' | 'medium' | 'large';
  padding?: 'none' | 'small' | 'medium' | 'large';
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  shadow = 'small',
  padding = 'medium',
}) => {
  const shadowStyle = shadow !== 'none' ? SHADOWS[shadow] : {};
  const paddingStyle = paddingStyles[padding];

  return (
    <View style={[styles.card, shadowStyle, paddingStyle, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: RADIUS.lg,
  },
});

const paddingStyles: Record<string, ViewStyle> = {
  none: {},
  small: { padding: SPACING.sm },
  medium: { padding: SPACING.md },
  large: { padding: SPACING.lg },
};
