import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import api from '../../src/lib/api';

interface Order {
  id: string;
  order_number: string;
  shop_id: string;
  shop_name: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    customizations: Record<string, string>;
  }>;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  points_earned: number;
  pickup_time?: string;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
}

const statusSteps = [
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle' },
  { key: 'preparing', label: 'Preparing', icon: 'cafe' },
  { key: 'ready', label: 'Ready', icon: 'gift' },
  { key: 'completed', label: 'Picked Up', icon: 'checkmark-done' },
];

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FFF3E0', text: COLORS.orange },
  confirmed: { bg: '#E3F2FD', text: COLORS.primaryBlue },
  preparing: { bg: '#FFF8E1', text: '#F57C00' },
  ready: { bg: '#E8F5E9', text: COLORS.green },
  completed: { bg: '#F5F5F5', text: COLORS.gray },
  cancelled: { bg: '#FFEBEE', text: COLORS.red },
};

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrder = async () => {
    try {
      const response = await api.get(`/orders/${id}`);
      setOrder(response.data);
    } catch (error) {
      console.log('Error fetching order:', error);
      // Mock data for demo
      setOrder({
        id: id!,
        order_number: 'ORD-A1B2C3',
        shop_id: 'shop-1',
        shop_name: 'Moonbean Coffee',
        items: [
          { name: 'Latte', quantity: 1, price: 5.50, customizations: { milk: 'Oat', size: 'Large' } },
          { name: 'Croissant', quantity: 1, price: 3.50, customizations: {} },
        ],
        status: 'preparing',
        subtotal: 9.00,
        tax: 1.17,
        total: 10.17,
        points_earned: 9,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    
    // Poll for updates every 10 seconds if order is active
    const interval = setInterval(() => {
      if (order && !['completed', 'cancelled'].includes(order.status)) {
        fetchOrder();
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrder();
    setRefreshing(false);
  }, []);

  const getCurrentStepIndex = () => {
    if (!order) return -1;
    if (order.status === 'pending') return -1;
    return statusSteps.findIndex(step => step.key === order.status);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEstimatedTime = () => {
    if (!order) return '';
    switch (order.status) {
      case 'confirmed':
        return '10-15 minutes';
      case 'preparing':
        return '5-10 minutes';
      case 'ready':
        return 'Ready now!';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primaryBlue} />
      </View>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Order not found</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const currentStepIndex = getCurrentStepIndex();

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
          <Text style={styles.headerTitle}>Order Status</Text>
          <TouchableOpacity style={styles.helpButton}>
            <Ionicons name="help-circle-outline" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Order Number */}
          <View style={styles.orderNumberSection}>
            <Text style={styles.orderNumber}>{order.order_number}</Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: statusColors[order.status]?.bg || '#F5F5F5' }
            ]}>
              <Text style={[
                styles.statusBadgeText,
                { color: statusColors[order.status]?.text || COLORS.gray }
              ]}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Text>
            </View>
          </View>

          {/* Shop Info */}
          <View style={styles.shopCard}>
            <View style={styles.shopIcon}>
              <Ionicons name="cafe" size={24} color={COLORS.primaryBlue} />
            </View>
            <View style={styles.shopInfo}>
              <Text style={styles.shopName}>{order.shop_name}</Text>
              {order.status !== 'completed' && order.status !== 'cancelled' && (
                <Text style={styles.estimatedTime}>
                  Estimated: {getEstimatedTime()}
                </Text>
              )}
            </View>
          </View>

          {/* Progress Tracker */}
          {order.status !== 'cancelled' && (
            <View style={styles.progressSection}>
              <Text style={styles.sectionTitle}>Order Progress</Text>
              <View style={styles.progressTracker}>
                {statusSteps.map((step, index) => (
                  <View key={step.key} style={styles.progressStep}>
                    <View style={[
                      styles.progressIcon,
                      index <= currentStepIndex && styles.progressIconActive,
                      index === currentStepIndex && styles.progressIconCurrent,
                    ]}>
                      <Ionicons
                        name={step.icon as any}
                        size={20}
                        color={index <= currentStepIndex ? COLORS.white : COLORS.lightGray}
                      />
                    </View>
                    <Text style={[
                      styles.progressLabel,
                      index <= currentStepIndex && styles.progressLabelActive,
                    ]}>
                      {step.label}
                    </Text>
                    {index < statusSteps.length - 1 && (
                      <View style={[
                        styles.progressLine,
                        index < currentStepIndex && styles.progressLineActive,
                      ]} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Order Ready Banner */}
          {order.status === 'ready' && (
            <View style={styles.readyBanner}>
              <Ionicons name="checkmark-circle" size={32} color={COLORS.green} />
              <View style={styles.readyBannerContent}>
                <Text style={styles.readyBannerTitle}>Your order is ready!</Text>
                <Text style={styles.readyBannerText}>Please pick it up at the counter</Text>
              </View>
            </View>
          )}

          {/* Order Items */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Items</Text>
            <View style={styles.itemsCard}>
              {order.items.map((item, index) => (
                <View key={index} style={styles.orderItem}>
                  <View style={styles.orderItemLeft}>
                    <View style={styles.quantityBadge}>
                      <Text style={styles.quantityText}>{item.quantity}x</Text>
                    </View>
                    <View>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {Object.keys(item.customizations).length > 0 && (
                        <Text style={styles.itemCustomizations}>
                          {Object.values(item.customizations).join(', ')}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.itemPrice}>
                    ${(item.price * item.quantity).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Order Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>${order.subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax (13%)</Text>
                <Text style={styles.summaryValue}>${order.tax.toFixed(2)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>${order.total.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Points Earned */}
          <View style={styles.pointsBanner}>
            <Ionicons name="star" size={24} color={COLORS.yellow} />
            <Text style={styles.pointsText}>
              You earned {order.points_earned} points with this order!
            </Text>
          </View>

          {/* Order Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Info</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={18} color={COLORS.gray} />
                <Text style={styles.infoLabel}>Placed at</Text>
                <Text style={styles.infoValue}>{formatDate(order.created_at)}</Text>
              </View>
              {order.special_instructions && (
                <View style={styles.infoRow}>
                  <Ionicons name="document-text-outline" size={18} color={COLORS.gray} />
                  <Text style={styles.infoLabel}>Notes</Text>
                  <Text style={styles.infoValue}>{order.special_instructions}</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.bottomBar}>
          {order.status === 'ready' ? (
            <Button
              title="I've Picked Up My Order"
              onPress={() => router.replace('/(tabs)/orders')}
              size="large"
              style={styles.actionButton}
            />
          ) : (
            <Button
              title="Need Help?"
              onPress={() => console.log('Help')}
              variant="outline"
              size="large"
              style={styles.actionButton}
            />
          )}
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  errorText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
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
  helpButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  scrollView: {
    flex: 1,
  },
  orderNumberSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  orderNumber: {
    fontSize: FONTS.h2,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  statusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  statusBadgeText: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.semibold,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
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
  shopInfo: {
    flex: 1,
  },
  shopName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  estimatedTime: {
    fontSize: FONTS.bodySmall,
    color: COLORS.primaryBlue,
    marginTop: 2,
  },
  progressSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  progressTracker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    ...SHADOWS.small,
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  progressIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  progressIconActive: {
    backgroundColor: COLORS.primaryBlue,
  },
  progressIconCurrent: {
    backgroundColor: COLORS.green,
  },
  progressLabel: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  progressLabelActive: {
    color: COLORS.darkNavy,
    fontWeight: FONTS.medium,
  },
  progressLine: {
    position: 'absolute',
    top: 20,
    right: -20,
    width: 40,
    height: 2,
    backgroundColor: COLORS.lightGray,
  },
  progressLineActive: {
    backgroundColor: COLORS.primaryBlue,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  readyBannerContent: {
    marginLeft: SPACING.md,
  },
  readyBannerTitle: {
    fontSize: FONTS.body,
    fontWeight: FONTS.bold,
    color: COLORS.green,
  },
  readyBannerText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.green,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  itemsCard: {
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
  quantityBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  quantityText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  itemName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.medium,
    color: COLORS.darkNavy,
  },
  itemCustomizations: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
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
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
    fontWeight: FONTS.medium,
    marginLeft: SPACING.sm,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.small,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    width: 70,
  },
  infoValue: {
    fontSize: FONTS.bodySmall,
    color: COLORS.darkNavy,
    flex: 1,
  },
  bottomBar: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
  },
  actionButton: {
    width: '100%',
  },
});
