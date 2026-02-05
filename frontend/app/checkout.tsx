import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input } from '../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../src/constants/theme';
import { useCartStore } from '../src/stores/cartStore';
import { useAuthStore } from '../src/stores/authStore';
import api from '../src/lib/api';

export default function Checkout() {
  const router = useRouter();
  const { items, shopId, shopName, getSubtotal, getTax, getTotal, clearCart } = useCartStore();
  const user = useAuthStore((state) => state.user);
  
  const [loading, setLoading] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [pickupTime, setPickupTime] = useState<'asap' | '15min' | '30min'>('asap');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple' | 'google'>('card');

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

    setLoading(true);
    setProcessingPayment(true);

    try {
      // Step 1: Create payment intent
      const paymentResponse = await api.post('/stripe/create-payment-intent', {
        amount: getTotal(),
      });

      const { clientSecret, paymentIntentId, mock } = paymentResponse.data;

      // Step 2: Create order
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
        total: getTotal(),
        special_instructions: specialInstructions,
        pickup_time: pickupTime,
      };

      const orderResponse = await api.post('/orders', orderData);
      const order = orderResponse.data;

      // Step 3: Confirm payment (mock for now without Stripe secret key)
      if (mock) {
        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Update order status to confirmed
        await api.patch(`/orders/${order.id}/status?status=confirmed`);
      } else {
        // Real Stripe payment would happen here
        await api.post(`/stripe/confirm-payment?payment_intent_id=${paymentIntentId}&order_id=${order.id}`);
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

  const paymentOptions = [
    { id: 'card', label: 'Credit/Debit Card', icon: 'card-outline' },
    { id: 'apple', label: 'Apple Pay', icon: 'logo-apple' },
    { id: 'google', label: 'Google Pay', icon: 'logo-google' },
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
              {paymentOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.paymentOption,
                    paymentMethod === option.id && styles.paymentOptionActive,
                  ]}
                  onPress={() => setPaymentMethod(option.id as typeof paymentMethod)}
                >
                  <View style={styles.paymentOptionLeft}>
                    <Ionicons
                      name={option.icon as any}
                      size={24}
                      color={paymentMethod === option.id ? COLORS.primaryBlue : COLORS.darkNavy}
                    />
                    <Text style={[
                      styles.paymentOptionText,
                      paymentMethod === option.id && styles.paymentOptionTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </View>
                  <View style={[
                    styles.radioButton,
                    paymentMethod === option.id && styles.radioButtonActive,
                  ]}>
                    {paymentMethod === option.id && (
                      <Ionicons name="checkmark" size={14} color={COLORS.white} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
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
                <Text style={styles.totalValue}>${getTotal().toFixed(2)}</Text>
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
            <Text style={styles.secureText}>Secure payment powered by Stripe</Text>
          </View>
        </ScrollView>

        {/* Place Order Button */}
        <View style={styles.bottomBar}>
          <Button
            title={`Pay $${getTotal().toFixed(2)}`}
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
  paymentOptionTextActive: {
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
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
