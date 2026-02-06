import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/stores/authStore';
import { COLORS } from '../src/constants/theme';
import { StripeRootProvider } from '../src/lib/stripeCompat';

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);
  const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const applePayMerchantIdentifier = process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID || '';

  useEffect(() => {
    initialize();
  }, []);

  return (
    <StripeRootProvider
      publishableKey={stripePublishableKey}
      merchantIdentifier={applePayMerchantIdentifier || undefined}
    >
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </StripeRootProvider>
  );
}
