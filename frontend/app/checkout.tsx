import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { useCartStore } from '../src/stores/cartStore';
import { useAuthStore } from '../src/stores/authStore';
import api from '../src/lib/api';
import { useOptionalStripe } from '../src/lib/stripeCompat';

interface SavedPaymentMethod {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

type CheckoutPaymentSelection = 'wallet' | 'saved' | 'new';

export default function Checkout() {
  const router = useRouter();
  const { items, shopId, shopName, getSubtotal, getTax, getTotal, clearCart } = useCartStore();
  const user = useAuthStore((state) => state.user);
  const stripe = useOptionalStripe();
  const { initPaymentSheet, presentPaymentSheet } = stripe;
  
  const [loading, setLoading] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [pickupTime, setPickupTime] = useState<'asap' | '15min' | '30min'>('asap');
  const [walletBalance, setWalletBalance] = useState(0);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [selectedPaymentType, setSelectedPaymentType] = useState<CheckoutPaymentSelection>('new');
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState<string | null>(null);
  const [saveNewPaymentMethod, setSaveNewPaymentMethod] = useState(true);

  const total = getTotal();
  const applePayMerchantIdentifier = process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID || '';
  const canUseWallet = walletBalance >= total;
  const selectedSavedMethod = savedPaymentMethods.find((pm) => pm.id === selectedSavedMethodId) || null;

  useEffect(() => {
    if (user?.id) {
      fetchPaymentContext();
    }
  }, [user?.id]);

  const fetchPaymentContext = async () => {
    if (!user?.id) {
      return;
    }

    setPaymentsLoading(true);
    try {
      const [walletResponse, methodsResponse] = await Promise.all([
        api.get(`/wallet/${user.id}`),
        api.get(`/payments/methods/${user.id}`, {
          params: { email: user.email },
        }),
      ]);

      const nextWalletBalance = walletResponse.data.balance || 0;
      const methods: SavedPaymentMethod[] = methodsResponse.data.payment_methods || [];
      setWalletBalance(nextWalletBalance);
      setSavedPaymentMethods(methods);

      if (methods.length > 0) {
        const defaultMethod = methods.find((pm) => pm.is_default) || methods[0];
        setSelectedSavedMethodId(defaultMethod.id);
        setSelectedPaymentType('saved');
      } else if (nextWalletBalance >= total) {
        setSelectedPaymentType('wallet');
      } else {
        setSelectedPaymentType('new');
      }
    } catch (error) {
      console.log('Error fetching checkout payment context:', error);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const getPaymentSheetBaseConfig = () => ({
    merchantDisplayName: 'BeanHop',
    allowsDelayedPaymentMethods: false,
    returnURL: 'beanhop://stripe-redirect',
    applePay: Platform.OS === 'ios' && applePayMerchantIdentifier
      ? { merchantCountryCode: 'CA' }
      : undefined,
    googlePay: Platform.OS === 'android'
      ? { merchantCountryCode: 'CA', testEnv: __DEV__ }
      : undefined,
  });

  const handlePlaceOrder = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to place an order', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }

    if (items.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart');
      return;
    }

    if (selectedPaymentType === 'wallet' && !canUseWallet) {
      Alert.alert('Insufficient Wallet Balance', 'Please add funds or choose card payment.');
      return;
    }

    if (selectedPaymentType === 'saved' && !selectedSavedMethodId) {
      Alert.alert('Select Payment Method', 'Please select a saved card or choose Add new payment method.');
      return;
    }

    const usingNewCardPayment = selectedPaymentType === 'new';
    if (usingNewCardPayment) {
      if (Platform.OS === 'web') {
        Alert.alert('Unsupported', 'Checkout payment is available on iOS/Android only.');
        return;
      }

      if (!stripe.available) {
        Alert.alert('Stripe Unavailable', 'Checkout payment requires a development build (not Expo Go).');
        return;
      }
    }

    setLoading(true);
    setProcessingPayment(true);
    let createdOrderId: string | null = null;
    let orderConfirmed = false;

    try {
      // Step 1: Create order (pending)
      const orderData = {
        user_id: user.id,
        shop_id: shopId,
        items: items.map((item) => ({
          menu_item_id: item.menuItemId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          customizations: item.customizations,
        })),
        subtotal: getSubtotal(),
        tax: getTax(),
        total,
        special_instructions: specialInstructions,
        pickup_time: pickupTime,
      };

      const orderResponse = await api.post('/orders', orderData);
      const order = orderResponse.data;
      createdOrderId = order.id;

      if (selectedPaymentType === 'wallet') {
        await api.post('/wallet/pay', null, {
          params: {
            user_id: user.id,
            amount: total,
            order_id: order.id,
          },
        });
        await api.patch(`/orders/${order.id}/status?status=confirmed`);
        orderConfirmed = true;
        setWalletBalance((prev) => Math.max(0, prev - total));
      } else if (selectedPaymentType === 'saved' && selectedSavedMethodId) {
        const savedPaymentResponse = await api.post('/stripe/pay-with-saved-method', {
          amount: total,
          order_id: order.id,
          user_id: user.id,
          email: user.email,
          payment_method_id: selectedSavedMethodId,
          purpose: 'order',
        });

        const { paymentIntentId } = savedPaymentResponse.data;
        await api.post(`/stripe/confirm-payment?payment_intent_id=${paymentIntentId}&order_id=${order.id}`);
        orderConfirmed = true;
        await fetchPaymentContext();
      } else {
        // Step 2: Create payment intent for this order
        const paymentResponse = await api.post('/stripe/create-payment-intent', {
          amount: total,
          order_id: order.id,
          user_id: user.id,
          email: user.email,
          purpose: 'order',
          save_payment_method: selectedPaymentType === 'new' ? saveNewPaymentMethod : false,
          preferred_payment_method_id: selectedPaymentType === 'saved' ? selectedSavedMethodId : undefined,
        });

        const { clientSecret, paymentIntentId } = paymentResponse.data;

        // Step 3: Complete payment
        const initResult = await initPaymentSheet({
          ...getPaymentSheetBaseConfig(),
          paymentIntentClientSecret: clientSecret,
        });

        if (initResult.error) {
          throw new Error(initResult.error.message);
        }

        const paymentResult = await presentPaymentSheet();
        if (paymentResult.error) {
          if (paymentResult.error.code === 'Canceled') {
            await api.patch(`/orders/${order.id}/status?status=cancelled`);
            Alert.alert('Payment Cancelled', 'Your order was not charged.');
            return;
          }
          throw new Error(paymentResult.error.message);
        }

        await api.post(`/stripe/confirm-payment?payment_intent_id=${paymentIntentId}&order_id=${order.id}`);
        orderConfirmed = true;
        await fetchPaymentContext();
      }

      // Step 4: Clear cart and navigate to order
      clearCart();
      
      Alert.alert(
        'Order Placed!',
        `Your order #${order.order_number} has been placed successfully.`,
        [
          {
            text: 'Track Order',
            onPress: () => router.replace(`/order/${order.id}`),
          },
        ]
      );
    } catch (error: any) {
      if (createdOrderId && !orderConfirmed) {
        try {
          await api.patch(`/orders/${createdOrderId}/status?status=cancelled`);
        } catch {
          // Ignore cancellation cleanup failures
        }
      }
      console.error('Order error:', error);
      Alert.alert(
        'Order Failed',
        error.response?.data?.detail || 'Failed to place order. Please try again.'
      );
    } finally {
      setLoading(false);
      setProcessingPayment(false);
    }
  };

  const pickupOptions = [
    { id: 'asap', label: 'ASAP', sublabel: '10-15 min' },
    { id: '15min', label: '15 min', sublabel: 'Schedule' },
    { id: '30min', label: '30 min', sublabel: 'Schedule' },
  ];

  if (processingPayment) {
    return (
      <SafeAreaView style={styles.processingContainer}>
        <View style={styles.processingContent}>
          <ActivityIndicator size="large" color={COLORS.primaryBlue} />
          <Text style={styles.processingTitle}>Processing Payment</Text>
          <Text style={styles.processingText}>Please wait while we process your order...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Shop Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pickup Location</Text>
            <View style={styles.shopCard}>
              <View style={styles.shopIcon}>
                <Ionicons name="cafe" size={24} color={COLORS.primaryBlue} />
              </View>
              <View style={styles.shopDetails}>
                <Text style={styles.shopName}>{shopName}</Text>
                <Text style={styles.shopAddress}>Ready for pickup</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
            </View>
          </View>

          {/* Pickup Time */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pickup Time</Text>
            <View style={styles.pickupOptions}>
              {pickupOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.pickupOption,
                    pickupTime === option.id && styles.pickupOptionActive,
                  ]}
                  onPress={() => setPickupTime(option.id as typeof pickupTime)}
                >
                  <Text style={[
                    styles.pickupOptionLabel,
                    pickupTime === option.id && styles.pickupOptionLabelActive,
                  ]}>
                    {option.label}
                  </Text>
                  <Text style={[
                    styles.pickupOptionSublabel,
                    pickupTime === option.id && styles.pickupOptionSublabelActive,
                  ]}>
                    {option.sublabel}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Order Items */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Items ({items.length})</Text>
            <View style={styles.orderItems}>
              {items.map((item) => (
                <View key={item.id} style={styles.orderItem}>
                  <View style={styles.orderItemLeft}>
                    <View style={styles.orderItemQuantity}>
                      <Text style={styles.orderItemQuantityText}>{item.quantity}x</Text>
                    </View>
                    <View>
                      <Text style={styles.orderItemName}>{item.name}</Text>
                      {Object.keys(item.customizations).length > 0 && (
                        <Text style={styles.orderItemCustomizations}>
                          {Object.values(item.customizations).join(', ')}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.orderItemPrice}>
                    ${(item.price * item.quantity).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Special Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Instructions</Text>
            <Input
              placeholder="Any special requests? (optional)"
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              multiline
              numberOfLines={3}
              containerStyle={styles.instructionsInput}
            />
          </View>

          {/* Payment Method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              <TouchableOpacity
                style={[
                  styles.paymentOption,
                  selectedPaymentType === 'wallet' && styles.paymentOptionActive,
                  !canUseWallet && styles.paymentOptionDisabled,
                ]}
                onPress={() => {
                  if (canUseWallet) {
                    setSelectedPaymentType('wallet');
                  }
                }}
                disabled={!canUseWallet}
              >
                <View style={styles.paymentOptionLeft}>
                  <Ionicons
                    name="wallet-outline"
                    size={24}
                    color={selectedPaymentType === 'wallet' ? COLORS.primaryBlue : COLORS.darkNavy}
                  />
                  <View>
                    <Text style={[
                      styles.paymentOptionText,
                      selectedPaymentType === 'wallet' && styles.paymentOptionTextActive,
                      !canUseWallet && styles.paymentOptionTextMuted,
                    ]}>
                      Wallet (${walletBalance.toFixed(2)})
                    </Text>
                    {!canUseWallet && (
                      <Text style={styles.paymentOptionSubtext}>
                        Need ${(total - walletBalance).toFixed(2)} more
                      </Text>
                    )}
                  </View>
                </View>
                <View style={[
                  styles.radioButton,
                  selectedPaymentType === 'wallet' && styles.radioButtonActive,
                ]}>
                  {selectedPaymentType === 'wallet' && (
                    <Ionicons name="checkmark" size={14} color={COLORS.white} />
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.paymentSectionHeader}>
                <Text style={styles.paymentSectionHeaderText}>Saved payment methods</Text>
              </View>

              {paymentsLoading ? (
                <View style={styles.paymentLoadingRow}>
                  <ActivityIndicator size="small" color={COLORS.primaryBlue} />
                  <Text style={styles.paymentLoadingText}>Loading methods...</Text>
                </View>
              ) : (
                <>
                  {savedPaymentMethods.map((method) => (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.paymentOption,
                        selectedPaymentType === 'saved' &&
                          selectedSavedMethodId === method.id &&
                          styles.paymentOptionActive,
                      ]}
                      onPress={() => {
                        setSelectedSavedMethodId(method.id);
                        setSelectedPaymentType('saved');
                      }}
                    >
                      <View style={styles.paymentOptionLeft}>
                        <Ionicons
                          name="card-outline"
                          size={24}
                          color={
                            selectedPaymentType === 'saved' && selectedSavedMethodId === method.id
                              ? COLORS.primaryBlue
                              : COLORS.darkNavy
                          }
                        />
                        <View>
                          <Text style={[
                            styles.paymentOptionText,
                            selectedPaymentType === 'saved' &&
                              selectedSavedMethodId === method.id &&
                              styles.paymentOptionTextActive,
                          ]}>
                            {(method.brand || 'Card').toUpperCase()} •••• {method.last4 || '----'}
                          </Text>
                          <Text style={styles.paymentOptionSubtext}>
                            Expires {String(method.exp_month || '--').padStart(2, '0')}/{method.exp_year || '----'}
                            {method.is_default ? ' • Default' : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={[
                        styles.radioButton,
                        selectedPaymentType === 'saved' &&
                          selectedSavedMethodId === method.id &&
                          styles.radioButtonActive,
                      ]}>
                        {selectedPaymentType === 'saved' && selectedSavedMethodId === method.id && (
                          <Ionicons name="checkmark" size={14} color={COLORS.white} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}

                  <TouchableOpacity
                    style={[
                      styles.paymentOption,
                      selectedPaymentType === 'new' && styles.paymentOptionActive,
                    ]}
                    onPress={() => setSelectedPaymentType('new')}
                  >
                    <View style={styles.paymentOptionLeft}>
                      <Ionicons
                        name="add-circle-outline"
                        size={24}
                        color={selectedPaymentType === 'new' ? COLORS.primaryBlue : COLORS.darkNavy}
                      />
                      <Text style={[
                        styles.paymentOptionText,
                        selectedPaymentType === 'new' && styles.paymentOptionTextActive,
                      ]}>
                        Add new payment method
                      </Text>
                    </View>
                    <View style={[
                      styles.radioButton,
                      selectedPaymentType === 'new' && styles.radioButtonActive,
                    ]}>
                      {selectedPaymentType === 'new' && (
                        <Ionicons name="checkmark" size={14} color={COLORS.white} />
                      )}
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {selectedPaymentType === 'new' && (
              <View style={styles.saveMethodRow}>
                <View>
                  <Text style={styles.saveMethodTitle}>Save this payment method</Text>
                  <Text style={styles.saveMethodSubtitle}>Use it again for future orders</Text>
                </View>
                <Switch
                  value={saveNewPaymentMethod}
                  onValueChange={setSaveNewPaymentMethod}
                  trackColor={{ false: COLORS.lightGray, true: '#BBD7FF' }}
                  thumbColor={saveNewPaymentMethod ? COLORS.primaryBlue : '#f4f3f4'}
                />
              </View>
            )}
          </View>

          {/* Order Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>${getSubtotal().toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax (13%)</Text>
                <Text style={styles.summaryValue}>${getTax().toFixed(2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Points Banner */}
          <View style={styles.pointsBanner}>
            <Ionicons name="star" size={20} color={COLORS.yellow} />
            <Text style={styles.pointsText}>
              You'll earn {Math.floor(getSubtotal())} points with this order
            </Text>
          </View>

          {/* Secure Payment Badge */}
          <View style={styles.secureBadge}>
            <Ionicons name="lock-closed" size={16} color={COLORS.green} />
            <Text style={styles.secureText}>
              {selectedPaymentType === 'wallet'
                ? 'Paying with your BeanHop wallet balance'
                : 'Secure card payment powered by Stripe'}
            </Text>
          </View>
        </ScrollView>

        {/* Place Order Button */}
        <View style={styles.bottomBar}>
          <Button
            title={
              selectedPaymentType === 'wallet'
                ? `Pay $${total.toFixed(2)} with Wallet`
                : selectedPaymentType === 'saved' && selectedSavedMethod
                  ? `Pay $${total.toFixed(2)} with ${String(selectedSavedMethod.brand || 'CARD').toUpperCase()}`
                  : `Pay $${total.toFixed(2)}`
            }
            onPress={handlePlaceOrder}
            loading={loading}
            size="large"
            style={styles.placeOrderButton}
          />
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  processingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingContent: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  processingTitle: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginTop: SPACING.lg,
  },
  processingText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  headerTitle: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.small,
  },
  shopIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  shopDetails: {
    flex: 1,
  },
  shopName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  shopAddress: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  pickupOptions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  pickupOption: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickupOptionActive: {
    borderColor: COLORS.primaryBlue,
    backgroundColor: '#E3F2FD',
  },
  pickupOptionLabel: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  pickupOptionLabelActive: {
    color: COLORS.primaryBlue,
  },
  pickupOptionSublabel: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  pickupOptionSublabelActive: {
    color: COLORS.primaryBlue,
  },
  orderItems: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    ...SHADOWS.small,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  orderItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  orderItemQuantity: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  orderItemQuantityText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  orderItemName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.medium,
    color: COLORS.darkNavy,
  },
  orderItemCustomizations: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  instructionsInput: {
    marginBottom: 0,
  },
  paymentMethods: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    ...SHADOWS.small,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  paymentOptionDisabled: {
    opacity: 0.6,
  },
  paymentOptionActive: {
    backgroundColor: '#E3F2FD',
  },
  paymentOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentOptionText: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
    marginLeft: SPACING.md,
  },
  paymentOptionTextMuted: {
    color: COLORS.textSecondary,
  },
  paymentOptionTextActive: {
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
  },
  paymentOptionSubtext: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginLeft: SPACING.md,
    marginTop: 2,
  },
  paymentSectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  paymentSectionHeaderText: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    fontWeight: FONTS.semibold,
  },
  paymentLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  paymentLoadingText: {
    marginLeft: SPACING.sm,
    color: COLORS.textSecondary,
    fontSize: FONTS.bodySmall,
  },
  saveMethodRow: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveMethodTitle: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
    fontWeight: FONTS.semibold,
  },
  saveMethodSubtitle: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonActive: {
    backgroundColor: COLORS.primaryBlue,
    borderColor: COLORS.primaryBlue,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.small,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  summaryLabel: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  totalValue: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.primaryBlue,
  },
  pointsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8DC',
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  pointsText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.darkNavy,
    marginLeft: SPACING.sm,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  secureText: {
    fontSize: FONTS.caption,
    color: COLORS.green,
    marginLeft: SPACING.xs,
  },
  bottomBar: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
  },
  placeOrderButton: {
    width: '100%',
  },
});
