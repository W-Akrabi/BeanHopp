import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuthStore } from '../../src/stores/authStore';
import api from '../../src/lib/api';

interface Order {
  id: string;
  order_number: string;
  shop_name: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  total: number;
  created_at: string;
  items_count: number;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FFF3E0', text: COLORS.orange },
  confirmed: { bg: '#E3F2FD', text: COLORS.primaryBlue },
  preparing: { bg: '#FFF8E1', text: '#F57C00' },
  ready: { bg: '#E8F5E9', text: COLORS.green },
  completed: { bg: '#F5F5F5', text: COLORS.gray },
  cancelled: { bg: '#FFEBEE', text: COLORS.red },
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready for Pickup',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function Orders() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders');
      setOrders(response.data);
    } catch (error) {
      console.log('Error fetching orders:', error);
      // Mock data for now
      setOrders([
        {
          id: '1',
          order_number: 'ORD-A1B2C3',
          shop_name: 'Moonbean Coffee',
          status: 'preparing',
          total: 12.50,
          created_at: new Date().toISOString(),
          items_count: 2,
        },
        {
          id: '2',
          order_number: 'ORD-D4E5F6',
          shop_name: 'Chapter Coffee',
          status: 'completed',
          total: 8.75,
          created_at: new Date(Date.now() - 86400000).toISOString(),
          items_count: 1,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const activeOrders = orders.filter(
    (o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
  );
  const pastOrders = orders.filter(
    (o) => ['completed', 'cancelled'].includes(o.status)
  );

  const displayedOrders = activeTab === 'active' ? activeOrders : pastOrders;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderOrderCard = (order: Order) => (
    <TouchableOpacity
      key={order.id}
      style={styles.orderCard}
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.orderHeader}>
        <View style={styles.orderShopInfo}>
          <View style={styles.shopLogo}>
            <Text style={styles.shopLogoText}>
              {order.shop_name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.shopName}>{order.shop_name}</Text>
            <Text style={styles.orderNumber}>{order.order_number}</Text>
          </View>
        </View>
        <View style={[
          styles.statusBadge,
          { backgroundColor: statusColors[order.status].bg }
        ]}>
          <Text style={[
            styles.statusText,
            { color: statusColors[order.status].text }
          ]}>
            {statusLabels[order.status]}
          </Text>
        </View>
      </View>
      
      <View style={styles.orderDetails}>
        <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>
        <Text style={styles.orderItems}>{order.items_count} item(s)</Text>
        <Text style={styles.orderTotal}>${order.total.toFixed(2)}</Text>
      </View>
      
      <View style={styles.orderFooter}>
        {order.status === 'ready' && (
          <View style={styles.readyBanner}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
            <Text style={styles.readyText}>Your order is ready for pickup!</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primaryBlue} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.tabActive]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[
            styles.tabText,
            activeTab === 'active' && styles.tabTextActive
          ]}>
            Active ({activeOrders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[
            styles.tabText,
            activeTab === 'past' && styles.tabTextActive
          ]}>
            Past ({pastOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {displayedOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={COLORS.lightGray} />
            <Text style={styles.emptyTitle}>
              {activeTab === 'active' ? 'No active orders' : 'No past orders'}
            </Text>
            <Text style={styles.emptyText}>
              {activeTab === 'active'
                ? 'Your active orders will appear here'
                : 'Your order history will appear here'}
            </Text>
            {activeTab === 'active' && (
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => router.push('/(tabs)/home')}
              >
                <Text style={styles.browseButtonText}>Browse Shops</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.ordersList}>
            {displayedOrders.map(renderOrderCard)}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: FONTS.h2,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  tab: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginRight: SPACING.md,
    borderRadius: RADIUS.full,
  },
  tabActive: {
    backgroundColor: COLORS.darkNavy,
  },
  tabText: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.medium,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  ordersList: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  orderCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  orderShopInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shopLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  shopLogoText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  shopName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  orderNumber: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  statusText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.semibold,
  },
  orderDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
  },
  orderDate: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    flex: 1,
  },
  orderItems: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginRight: SPACING.md,
  },
  orderTotal: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  orderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: SPACING.sm,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    marginRight: 'auto',
  },
  readyText: {
    fontSize: FONTS.caption,
    color: COLORS.green,
    fontWeight: FONTS.medium,
    marginLeft: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.xxl * 2,
    paddingHorizontal: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
    marginTop: SPACING.md,
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  browseButton: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.darkNavy,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  browseButtonText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.white,
  },
});
