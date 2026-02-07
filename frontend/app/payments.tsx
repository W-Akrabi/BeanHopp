import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  LayoutAnimation,
  UIManager,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button } from '../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { useAuthStore } from '../src/stores/authStore';
import api from '../src/lib/api';
import { useOptionalStripe } from '../src/lib/stripeCompat';
import { getPaymentCardTheme, type PaymentCardTheme } from '../src/lib/paymentCardTheme';

interface SavedPaymentMethod {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

const CARD_HEIGHT = 196;
const CARD_PEEK = 58;
const MATRIX_H_LINES = Array.from({ length: 8 }, (_, idx) => idx);
const MATRIX_V_LINES = Array.from({ length: 12 }, (_, idx) => idx);
const TOPO_DOTS = Array.from({ length: 26 }, (_, idx) => idx);
const PAPER_LINES = Array.from({ length: 20 }, (_, idx) => idx);
const CARD_BRAND_LABELS: Record<string, string> = {
  amex: 'American Express',
  carte_bancaire: 'Carte Bancaire',
  diners: 'Diners Club',
  discover: 'Discover',
  eftpos_au: 'Eftpos AU',
  jcb: 'JCB',
  mastercard: 'Mastercard',
  unionpay: 'UnionPay',
  visa: 'Visa',
};

export default function PaymentsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const stripe = useOptionalStripe();
  const { initPaymentSheet, presentPaymentSheet } = stripe;

  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [addingPaymentMethod, setAddingPaymentMethod] = useState(false);
  const [deletingPaymentMethodId, setDeletingPaymentMethodId] = useState<string | null>(null);
  const [settingDefaultPaymentMethodId, setSettingDefaultPaymentMethodId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const applePayMerchantIdentifier = process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID || '';

  const flow = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    const flowLoop = Animated.loop(
      Animated.timing(flow, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    flowLoop.start();
    pulseLoop.start();

    return () => {
      flowLoop.stop();
      pulseLoop.stop();
      flow.setValue(0);
      pulse.setValue(0);
    };
  }, [flow, pulse]);

  useEffect(() => {
    if (user?.id) {
      fetchPaymentMethods();
    }
  }, [user?.id]);

  const fetchPaymentMethods = async () => {
    if (!user?.id) {
      return;
    }

    setPaymentsLoading(true);
    try {
      const response = await api.get(`/payments/methods/${user.id}`, {
        params: {
          email: user.email,
        },
      });

      const methods: SavedPaymentMethod[] = response.data.payment_methods || [];
      const defaultMethod = methods.find((method) => method.is_default) || methods[0] || null;
      setSavedPaymentMethods(methods);
      setActiveCardId(defaultMethod?.id || null);
    } catch {
      setSavedPaymentMethods([]);
      setActiveCardId(null);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const getPaymentSheetBaseConfig = () => ({
    merchantDisplayName: 'BeanHop',
    allowsDelayedPaymentMethods: false,
    returnURL: 'beanhop://stripe-redirect',
    applePay:
      Platform.OS === 'ios' && applePayMerchantIdentifier
        ? { merchantCountryCode: 'CA' }
        : undefined,
    googlePay:
      Platform.OS === 'android'
        ? { merchantCountryCode: 'CA', testEnv: __DEV__ }
        : undefined,
  });

  const handleAddPaymentMethod = async () => {
    if (!user?.id) {
      Alert.alert('Sign In Required', 'Please sign in to add payment methods');
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert('Unsupported', 'Adding payment methods is available on iOS/Android only.');
      return;
    }

    if (!stripe.available) {
      Alert.alert('Stripe Unavailable', 'This feature requires a development build (not Expo Go).');
      return;
    }

    setAddingPaymentMethod(true);
    try {
      const response = await api.post('/payments/setup-intent', {
        user_id: user.id,
        email: user.email,
      });

      const { clientSecret } = response.data;
      const initResult = await initPaymentSheet({
        ...getPaymentSheetBaseConfig(),
        setupIntentClientSecret: clientSecret,
      });

      if (initResult.error) {
        Alert.alert('Payment Setup Failed', initResult.error.message);
        return;
      }

      const presentResult = await presentPaymentSheet();
      if (presentResult.error) {
        if (presentResult.error.code === 'Canceled') {
          return;
        }
        Alert.alert('Add Payment Method Failed', presentResult.error.message);
        return;
      }

      await fetchPaymentMethods();
      Alert.alert('Success', 'Payment method added successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add payment method');
    } finally {
      setAddingPaymentMethod(false);
    }
  };

  const handleDeletePaymentMethod = (paymentMethodId: string) => {
    if (!user?.id) {
      return;
    }

    Alert.alert('Remove Payment Method', 'Are you sure you want to remove this payment method?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setDeletingPaymentMethodId(paymentMethodId);
          try {
            await api.delete(`/payments/methods/${user.id}/${paymentMethodId}`, {
              params: {
                email: user.email,
              },
            });

            await fetchPaymentMethods();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          } catch (error: any) {
            Alert.alert('Delete Failed', error.response?.data?.detail || 'Could not remove payment method.');
          } finally {
            setDeletingPaymentMethodId(null);
          }
        },
      },
    ]);
  };

  const getExpiryText = (method: SavedPaymentMethod) => {
    const month = String(method.exp_month || '--').padStart(2, '0');
    const year = method.exp_year ? String(method.exp_year).slice(-2) : '--';
    return `${month}/${year}`;
  };

  const getCardBrandLabel = (brand: string | null) => {
    if (!brand) {
      return 'Card';
    }

    const normalized = brand.toLowerCase();
    if (CARD_BRAND_LABELS[normalized]) {
      return CARD_BRAND_LABELS[normalized];
    }

    return normalized
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
  };

  const handleShowPaymentMethodDetails = (method: SavedPaymentMethod) => {
    Alert.alert(
      'Card Details',
      `Brand: ${getCardBrandLabel(method.brand)}\nCard: •••• ${method.last4 || '----'}\nExpires: ${getExpiryText(
        method
      )}\nDefault: ${method.is_default ? 'Yes' : 'No'}`
    );
  };

  const getUserName = () => {
    if (user?.user_metadata?.name) {
      return user.user_metadata.name;
    }
    return 'Card Holder';
  };

  const stackedCards = useMemo(() => {
    if (!savedPaymentMethods.length) {
      return [];
    }

    const defaultCard = savedPaymentMethods.find((method) => method.is_default) || savedPaymentMethods[0];
    const activeCard = savedPaymentMethods.find((method) => method.id === activeCardId) || defaultCard;
    const rest = savedPaymentMethods.filter((method) => method.id !== activeCard.id);
    return [...rest, activeCard];
  }, [savedPaymentMethods, activeCardId]);

  const defaultCard = savedPaymentMethods.find((method) => method.is_default) || savedPaymentMethods[0] || null;
  const activeCard = savedPaymentMethods.find((method) => method.id === activeCardId) || defaultCard;
  const stackHeight = CARD_HEIGHT + Math.max(0, stackedCards.length - 1) * CARD_PEEK + SPACING.sm;

  const handleSelectCard = async (paymentMethodId: string) => {
    if (paymentMethodId === activeCardId) {
      return;
    }

    const selectedMethod = savedPaymentMethods.find((method) => method.id === paymentMethodId);
    const previousDefaultId = savedPaymentMethods.find((method) => method.is_default)?.id || activeCardId;
    setActiveCardId(paymentMethodId);

    if (!selectedMethod || selectedMethod.is_default) {
      return;
    }

    if (!user?.id) {
      return;
    }

    setSettingDefaultPaymentMethodId(paymentMethodId);
    try {
      await api.post('/payments/default', {
        user_id: user.id,
        payment_method_id: paymentMethodId,
        email: user.email,
      });

      setSavedPaymentMethods((prev) =>
        prev.map((method) => ({
          ...method,
          is_default: method.id === paymentMethodId,
        }))
      );
      Alert.alert('New Default Payment', 'This card is now your default payment method.');
    } catch (error: any) {
      if (previousDefaultId) {
        setActiveCardId(previousDefaultId);
      }
      Alert.alert(
        'Default Update Failed',
        error.response?.data?.detail || 'Could not set this card as your default payment method.'
      );
    } finally {
      setSettingDefaultPaymentMethodId(null);
    }
  };

  const sweepX = flow.interpolate({
    inputRange: [0, 1],
    outputRange: [-260, 260],
  });
  const sweepXSoft = flow.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 180],
  });
  const sweepXWide = flow.interpolate({
    inputRange: [0, 1],
    outputRange: [-320, 320],
  });
  const rotate360 = flow.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const rotateReverse = flow.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });
  const scanY = flow.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 220],
  });
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const pulseScaleLarge = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const renderPaymentCardPattern = (theme: PaymentCardTheme) => {
    switch (theme.pattern) {
      case 'prism':
        return (
          <>
            <Animated.View
              style={[
                styles.prismA,
                {
                  backgroundColor: theme.accentOne,
                  transform: [{ translateX: sweepXSoft }, { rotate: rotate360 }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.prismB,
                {
                  backgroundColor: theme.accentTwo,
                  transform: [{ translateX: sweepXWide }, { rotate: rotateReverse }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.prismC,
                {
                  backgroundColor: theme.accentThree,
                  opacity: pulseOpacity,
                  transform: [{ rotate: rotate360 }, { scale: pulseScaleLarge }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.prismBeam,
                {
                  backgroundColor: theme.accentThree,
                  transform: [{ translateX: sweepXWide }, { rotate: '-16deg' }],
                },
              ]}
            />
            <View style={styles.grainOverlay} />
          </>
        );

      case 'ribbons':
        return (
          <>
            <Animated.View
              style={[
                styles.ribbonOne,
                { backgroundColor: theme.accentOne, transform: [{ translateX: sweepX }, { rotate: '-12deg' }] },
              ]}
            />
            <Animated.View
              style={[
                styles.ribbonTwo,
                {
                  backgroundColor: theme.accentTwo,
                  transform: [{ translateX: sweepXWide }, { rotate: '-12deg' }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.ribbonThree,
                { backgroundColor: theme.accentThree, transform: [{ translateX: sweepX }, { rotate: '-12deg' }] },
              ]}
            />
            <View style={styles.ribbonSpecular} />
          </>
        );

      case 'matrix':
        return (
          <>
            <View style={[styles.matrixGridTint, { backgroundColor: theme.accentThree }]} />
            <View style={styles.matrixGrid}>
              {MATRIX_H_LINES.map((idx) => (
                <View key={`h-${idx}`} style={[styles.matrixHLine, { top: idx * 24 }]} />
              ))}
              {MATRIX_V_LINES.map((idx) => (
                <View key={`v-${idx}`} style={[styles.matrixVLine, { left: idx * 28 }]} />
              ))}
            </View>
            <Animated.View
              style={[
                styles.matrixScanline,
                {
                  backgroundColor: theme.accentTwo,
                  transform: [{ translateY: scanY }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.matrixGlow,
                {
                  backgroundColor: theme.accentOne,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.matrixGlowSecondary,
                {
                  backgroundColor: theme.accentThree,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScaleLarge }],
                },
              ]}
            />
          </>
        );

      case 'sunset':
        return (
          <>
            <Animated.View
              style={[
                styles.sunsetHalo,
                {
                  backgroundColor: theme.accentTwo,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.sunsetDuneOne,
                { backgroundColor: theme.accentOne, transform: [{ translateX: sweepX }, { rotate: '-8deg' }] },
              ]}
            />
            <Animated.View
              style={[
                styles.sunsetDuneTwo,
                {
                  backgroundColor: theme.accentThree,
                  transform: [{ translateX: sweepXWide }, { rotate: '-5deg' }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.sunsetFlare,
                {
                  backgroundColor: theme.accentThree,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <View style={styles.sunsetVeil} />
          </>
        );

      case 'neonframe':
        return (
          <>
            <Animated.View
              style={[
                styles.neonPulse,
                {
                  backgroundColor: theme.accentThree,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.neonSweep,
                { backgroundColor: theme.accentTwo, transform: [{ translateX: sweepXWide }, { rotate: '-10deg' }] },
              ]}
            />
            <Animated.View style={[styles.neonFrame, { borderColor: theme.accentOne, opacity: pulseOpacity }]} />
            <Animated.View
              style={[
                styles.neonInnerGlow,
                {
                  backgroundColor: theme.accentOne,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScaleLarge }],
                },
              ]}
            />
            <View style={[styles.neonCornerTL, { borderColor: theme.accentOne }]} />
            <View style={[styles.neonCornerTR, { borderColor: theme.accentOne }]} />
            <View style={[styles.neonCornerBL, { borderColor: theme.accentOne }]} />
            <View style={[styles.neonCornerBR, { borderColor: theme.accentOne }]} />
          </>
        );

      case 'topo':
        return (
          <>
            <Animated.View
              style={[styles.topoRingOne, { borderColor: theme.accentOne, transform: [{ rotate: rotate360 }] }]}
            />
            <Animated.View
              style={[styles.topoRingTwo, { borderColor: theme.accentTwo, transform: [{ rotate: rotateReverse }] }]}
            />
            <Animated.View style={[styles.topoRingThree, { borderColor: theme.accentThree }]} />
            <View style={[styles.topoContourOne, { borderColor: theme.accentThree }]} />
            <View style={[styles.topoContourTwo, { borderColor: theme.accentOne }]} />
            <View style={styles.topoDotField}>
              {TOPO_DOTS.map((idx) => (
                <View
                  key={`topo-dot-${idx}`}
                  style={[
                    styles.topoDot,
                    {
                      left: (idx * 37) % 360 - 20,
                      top: (idx * 59) % 220 - 20,
                      backgroundColor: theme.accentThree,
                    },
                  ]}
                />
              ))}
            </View>
            <Animated.View
              style={[
                styles.topoBlob,
                {
                  backgroundColor: theme.accentTwo,
                  opacity: pulseOpacity,
                  transform: [{ translateX: sweepXSoft }, { scale: pulseScale }],
                },
              ]}
            />
            <View style={styles.grainOverlay} />
          </>
        );

      case 'chrome':
        return (
          <>
            <Animated.View
              style={[
                styles.chromeSheen,
                {
                  backgroundColor: theme.accentTwo,
                  transform: [{ translateX: sweepXWide }, { rotate: '-8deg' }],
                },
              ]}
            />
            <Animated.View style={[styles.chromeGlow, { backgroundColor: theme.accentOne, opacity: pulseOpacity }]} />
            <Animated.View
              style={[styles.chromeRingOne, { borderColor: theme.accentOne, transform: [{ rotate: rotate360 }] }]}
            />
            <Animated.View
              style={[styles.chromeRingTwo, { borderColor: theme.accentThree, transform: [{ rotate: rotateReverse }] }]}
            />
            <View style={styles.grainOverlay} />
          </>
        );

      case 'paper':
        return (
          <>
            <View style={[styles.paperTexture, { backgroundColor: theme.accentThree }]} />
            <View style={styles.paperLineField}>
              {PAPER_LINES.map((idx) => (
                <View key={`paper-line-${idx}`} style={[styles.paperLine, { left: idx * 22 }]} />
              ))}
            </View>
            <Animated.View
              style={[
                styles.paperFold,
                { backgroundColor: theme.accentOne, transform: [{ translateX: sweepXWide }, { rotate: '18deg' }] },
              ]}
            />
            <Animated.View
              style={[
                styles.paperStamp,
                {
                  borderColor: theme.accentOne,
                  backgroundColor: theme.accentTwo,
                  opacity: pulseOpacity,
                  transform: [{ rotate: '10deg' }],
                },
              ]}
            />
            <View style={styles.grainOverlay} />
          </>
        );

      // Backward compatibility with older pattern names.
      case 'diagonal':
        return (
          <>
            <Animated.View
              style={[
                styles.ribbonOne,
                { backgroundColor: theme.accentOne, transform: [{ translateX: sweepX }, { rotate: '-12deg' }] },
              ]}
            />
            <Animated.View
              style={[
                styles.ribbonTwo,
                {
                  backgroundColor: theme.accentTwo,
                  transform: [{ translateX: sweepXWide }, { rotate: '-12deg' }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.ribbonThree,
                { backgroundColor: theme.accentThree, transform: [{ translateX: sweepX }, { rotate: '-12deg' }] },
              ]}
            />
            <View style={styles.ribbonSpecular} />
          </>
        );

      case 'rings':
        return (
          <>
            <Animated.View style={[styles.topoRingOne, { borderColor: theme.accentOne, transform: [{ rotate: rotate360 }] }]} />
            <Animated.View style={[styles.topoRingTwo, { borderColor: theme.accentTwo, transform: [{ rotate: rotateReverse }] }]} />
            <Animated.View style={[styles.topoRingThree, { borderColor: theme.accentThree }]} />
          </>
        );

      case 'mesh':
        return (
          <>
            <Animated.View
              style={[
                styles.topoBlob,
                {
                  backgroundColor: theme.accentTwo,
                  opacity: pulseOpacity,
                  transform: [{ translateX: sweepXSoft }, { scale: pulseScale }],
                },
              ]}
            />
            <View style={styles.grainOverlay} />
          </>
        );

      case 'aurora':
      default:
        return (
          <>
            <Animated.View
              style={[
                styles.sunsetHalo,
                {
                  backgroundColor: theme.accentTwo,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.sunsetDuneOne,
                { backgroundColor: theme.accentOne, transform: [{ translateX: sweepX }, { rotate: '-8deg' }] },
              ]}
            />
            <Animated.View
              style={[
                styles.sunsetDuneTwo,
                {
                  backgroundColor: theme.accentThree,
                  transform: [{ translateX: sweepXWide }, { rotate: '-5deg' }],
                },
              ]}
            />
          </>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.darkNavy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionCircle} onPress={handleAddPaymentMethod}>
            <Ionicons name="add" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {paymentsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={COLORS.primaryBlue} />
            <Text style={styles.loadingText}>Loading your cards...</Text>
          </View>
        ) : stackedCards.length > 0 ? (
          <View style={[styles.stackContainer, { height: stackHeight }]}>
            {stackedCards.map((method, index) => {
              const theme = getPaymentCardTheme(method.brand, method.id);
              const isActive = method.id === activeCard?.id;
              const isSettingDefault = settingDefaultPaymentMethodId === method.id;

              return (
                <TouchableOpacity
                  key={method.id}
                  activeOpacity={0.95}
                  onPress={() => handleSelectCard(method.id)}
                  disabled={Boolean(settingDefaultPaymentMethodId)}
                  style={[
                    styles.paymentCardVisual,
                    {
                      backgroundColor: theme.background,
                      top: index * CARD_PEEK,
                      zIndex: index + 1,
                      opacity: 1,
                      transform: [{ translateY: isActive ? -4 : 0 }],
                    },
                  ]}
                >
                  {renderPaymentCardPattern(theme)}

                  <View style={styles.paymentCardTopRow}>
                    <Text style={styles.paymentCardBrand}>{getCardBrandLabel(method.brand)}</Text>
                    <View style={styles.paymentCardHeaderActions}>
                      {method.is_default && (
                        <View style={styles.paymentCardDefaultBadge}>
                          <Text style={styles.paymentCardDefaultText}>Default</Text>
                        </View>
                      )}
                      {isSettingDefault && <ActivityIndicator size="small" color={COLORS.white} />}
                      <TouchableOpacity
                        style={styles.paymentCardMenuButton}
                        onPress={() => handleShowPaymentMethodDetails(method)}
                        disabled={Boolean(settingDefaultPaymentMethodId)}
                      >
                        <Ionicons name="ellipsis-horizontal" size={16} color={COLORS.white} />
                      </TouchableOpacity>
                      {isActive && (
                        <>
                          <TouchableOpacity
                            style={styles.paymentCardDeleteButton}
                            onPress={() => handleDeletePaymentMethod(method.id)}
                            disabled={deletingPaymentMethodId === method.id || Boolean(settingDefaultPaymentMethodId)}
                          >
                            {deletingPaymentMethodId === method.id ? (
                              <ActivityIndicator size="small" color={COLORS.white} />
                            ) : (
                              <Ionicons name="trash-outline" size={16} color={COLORS.white} />
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>

                  <View style={styles.paymentCardChipRow}>
                    <View style={styles.paymentCardChip}>
                      <View style={styles.paymentCardChipLine} />
                      <View style={styles.paymentCardChipLine} />
                      <View style={styles.paymentCardChipLine} />
                    </View>
                    <Ionicons name="wifi" size={18} color="rgba(255,255,255,0.9)" style={styles.tapIcon} />
                  </View>

                  <Text style={styles.paymentCardNumber}>•••• •••• •••• {method.last4 || '----'}</Text>

                  <View style={styles.paymentCardBottomRow}>
                    <View>
                      <Text style={styles.paymentCardMetaLabel}>CARDHOLDER</Text>
                      <Text style={styles.paymentCardMetaValue}>{getUserName().toUpperCase()}</Text>
                    </View>
                    <View style={styles.paymentCardRightMeta}>
                      <Text style={styles.paymentCardMetaLabel}>EXPIRES</Text>
                      <Text style={styles.paymentCardMetaValue}>{getExpiryText(method)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={52} color={COLORS.lightGray} />
            <Text style={styles.emptyTitle}>No saved payment methods</Text>
            <Text style={styles.emptySubtitle}>Add a new payment method to start paying faster.</Text>
          </View>
        )}

        <Button
          title={addingPaymentMethod ? 'Adding...' : 'Add Payment Method'}
          onPress={handleAddPaymentMethod}
          disabled={addingPaymentMethod}
          variant="outline"
          style={styles.addButton}
          textStyle={styles.addButtonText}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  loadingText: {
    marginTop: SPACING.sm,
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  stackContainer: {
    position: 'relative',
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  paymentCardVisual: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 20,
    padding: SPACING.lg,
    minHeight: CARD_HEIGHT,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    ...SHADOWS.medium,
  },

  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  prismA: {
    position: 'absolute',
    width: 290,
    height: 290,
    borderRadius: 56,
    top: -130,
    left: -84,
    opacity: 0.28,
  },
  prismB: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 54,
    bottom: -122,
    right: -58,
    opacity: 0.24,
  },
  prismC: {
    position: 'absolute',
    width: 192,
    height: 192,
    borderRadius: 52,
    right: 58,
    top: 4,
    opacity: 0.24,
  },
  prismBeam: {
    position: 'absolute',
    width: 170,
    height: '170%',
    top: -68,
    opacity: 0.16,
    borderRadius: 22,
  },

  ribbonOne: {
    position: 'absolute',
    left: '-34%',
    width: '170%',
    height: 84,
    borderRadius: 999,
    top: 16,
    opacity: 0.26,
  },
  ribbonTwo: {
    position: 'absolute',
    left: '-30%',
    width: '170%',
    height: 74,
    borderRadius: 999,
    top: 88,
    opacity: 0.19,
  },
  ribbonThree: {
    position: 'absolute',
    left: '-25%',
    width: '170%',
    height: 58,
    borderRadius: 999,
    top: 148,
    opacity: 0.16,
  },
  ribbonSpecular: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    left: -90,
    top: -110,
    backgroundColor: 'rgba(255,255,255,0.24)',
    opacity: 0.16,
  },

  matrixGridTint: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  matrixGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  matrixHLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  matrixVLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  matrixScanline: {
    position: 'absolute',
    left: -14,
    right: -14,
    height: 58,
    borderRadius: 30,
    opacity: 0.2,
  },
  matrixGlow: {
    position: 'absolute',
    width: 256,
    height: 256,
    borderRadius: 128,
    right: -80,
    top: -90,
  },
  matrixGlowSecondary: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    left: -88,
    bottom: -96,
  },

  sunsetHalo: {
    position: 'absolute',
    width: 296,
    height: 296,
    borderRadius: 148,
    left: -96,
    top: -124,
    opacity: 0.22,
  },
  sunsetDuneOne: {
    position: 'absolute',
    width: '152%',
    height: 114,
    borderRadius: 60,
    bottom: 10,
    left: '-24%',
    opacity: 0.26,
  },
  sunsetDuneTwo: {
    position: 'absolute',
    width: '152%',
    height: 92,
    borderRadius: 60,
    bottom: -22,
    left: '-18%',
    opacity: 0.2,
  },
  sunsetFlare: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    right: -94,
    top: -108,
    opacity: 0.26,
  },
  sunsetVeil: {
    position: 'absolute',
    left: -24,
    right: -24,
    top: 0,
    height: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
  },

  neonFrame: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 14,
    bottom: 14,
    borderRadius: 17,
    borderWidth: 1.4,
  },
  neonSweep: {
    position: 'absolute',
    width: 230,
    height: '170%',
    opacity: 0.22,
    top: -45,
    borderRadius: 22,
  },
  neonPulse: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    left: 48,
    top: -76,
  },
  neonInnerGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    left: 88,
    top: 16,
  },
  neonCornerTL: {
    position: 'absolute',
    left: 14,
    top: 14,
    width: 28,
    height: 28,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 10,
  },
  neonCornerTR: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 28,
    height: 28,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 10,
  },
  neonCornerBL: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    width: 28,
    height: 28,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 10,
  },
  neonCornerBR: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 28,
    height: 28,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 10,
  },

  topoRingOne: {
    position: 'absolute',
    width: 248,
    height: 248,
    borderRadius: 124,
    borderWidth: 1.4,
    left: -96,
    top: -112,
    opacity: 0.26,
  },
  topoRingTwo: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 1.25,
    right: -88,
    bottom: -98,
    opacity: 0.24,
  },
  topoRingThree: {
    position: 'absolute',
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 1.2,
    left: '42%',
    top: 52,
    opacity: 0.22,
  },
  topoContourOne: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1,
    borderStyle: 'dashed',
    left: -150,
    top: -160,
    opacity: 0.14,
  },
  topoContourTwo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderStyle: 'dashed',
    right: -130,
    bottom: -138,
    opacity: 0.12,
  },
  topoDotField: {
    ...StyleSheet.absoluteFillObject,
  },
  topoDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.28,
  },
  topoBlob: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -56,
    right: -42,
    opacity: 0.22,
  },

  chromeSheen: {
    position: 'absolute',
    width: 160,
    height: '180%',
    top: -84,
    opacity: 0.24,
    borderRadius: 22,
  },
  chromeGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    right: -84,
    top: -84,
  },
  chromeRingOne: {
    position: 'absolute',
    width: 235,
    height: 235,
    borderRadius: 118,
    borderWidth: 1,
    top: -96,
    left: -72,
    opacity: 0.36,
  },
  chromeRingTwo: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 1,
    right: -88,
    bottom: -94,
    opacity: 0.28,
  },

  paperTexture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.07,
  },
  paperLineField: {
    ...StyleSheet.absoluteFillObject,
  },
  paperLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    opacity: 0.58,
  },
  paperFold: {
    position: 'absolute',
    width: 132,
    height: '170%',
    top: -44,
    opacity: 0.2,
  },
  paperStamp: {
    position: 'absolute',
    right: 16,
    top: 52,
    width: 88,
    height: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.2,
  },

  paymentCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentCardBrand: {
    color: COLORS.white,
    fontSize: FONTS.caption,
    fontWeight: FONTS.bold,
    letterSpacing: 2,
  },
  paymentCardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  paymentCardDefaultBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  paymentCardDefaultText: {
    color: COLORS.white,
    fontSize: FONTS.caption,
    fontWeight: FONTS.semibold,
  },
  paymentCardDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  paymentCardMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  paymentCardChipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  paymentCardChip: {
    width: 48,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.28)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'space-between',
  },
  paymentCardChipLine: {
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  tapIcon: {
    transform: [{ rotate: '90deg' }],
  },
  paymentCardNumber: {
    marginTop: SPACING.lg,
    color: COLORS.white,
    fontSize: FONTS.h4,
    fontWeight: FONTS.semibold,
    letterSpacing: 1.4,
  },
  paymentCardBottomRow: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  paymentCardMetaLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  paymentCardMetaValue: {
    color: COLORS.white,
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.semibold,
    marginTop: 4,
  },
  paymentCardRightMeta: {
    alignItems: 'flex-end',
  },
  emptyState: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.small,
  },
  emptyTitle: {
    marginTop: SPACING.md,
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
    fontWeight: FONTS.semibold,
  },
  emptySubtitle: {
    marginTop: SPACING.xs,
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  addButton: {
    width: '100%',
    borderColor: COLORS.darkNavy,
    marginTop: SPACING.sm,
  },
  addButtonText: {
    color: COLORS.darkNavy,
  },
});
