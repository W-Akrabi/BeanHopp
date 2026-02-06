import React from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

type StripeModule = typeof import('@stripe/stripe-react-native');

let cachedStripeModule: StripeModule | null | undefined;

export function getStripeModule(): StripeModule | null {
  if (cachedStripeModule !== undefined) {
    return cachedStripeModule;
  }

  const isExpoGo =
    Constants.executionEnvironment === 'storeClient' ||
    (Constants as { appOwnership?: string }).appOwnership === 'expo';

  if (isExpoGo) {
    cachedStripeModule = null;
    return cachedStripeModule;
  }

  if (Platform.OS === 'web') {
    cachedStripeModule = null;
    return cachedStripeModule;
  }

  try {
    cachedStripeModule = require('@stripe/stripe-react-native') as StripeModule;
  } catch {
    cachedStripeModule = null;
  }

  return cachedStripeModule;
}

export function StripeRootProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: React.ReactNode;
}) {
  const stripeModule = getStripeModule();

  if (!stripeModule || !publishableKey) {
    return <>{children}</>;
  }

  const Provider = stripeModule.StripeProvider;
  return <Provider publishableKey={publishableKey}>{<>{children}</>}</Provider>;
}

export function useOptionalStripe() {
  const stripeModule = getStripeModule();
  if (stripeModule?.useStripe) {
    return {
      available: true,
      ...stripeModule.useStripe(),
    };
  }

  const unavailableResult = {
    code: 'Unavailable',
    message: 'Stripe native module is unavailable in this build.',
  };

  return {
    available: false,
    initPaymentSheet: async () => ({ error: unavailableResult }),
    presentPaymentSheet: async () => ({ error: unavailableResult }),
  };
}
