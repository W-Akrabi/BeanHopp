import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useCartStore } from '../../src/stores/cartStore';
import api from '../../src/lib/api';

const { width } = Dimensions.get('window');

interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  base_price: number;
  image_url?: string;
  is_available: boolean;
  is_featured: boolean;
  customization_options?: Record<string, string[]>;
}

interface Shop {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  rating: number;
  rating_count: number;
  is_active: boolean;
  hours?: Record<string, { open: string; close: string }>;
}

const mockMenuItems: MenuItem[] = [
  {
    id: '1',
    name: 'Latte',
    description: 'Espresso with steamed milk',
    category: 'espresso',
    base_price: 5.00,
    is_available: true,
    is_featured: true,
    customization_options: {
      beans: ['Brazil (default)', 'Ethiopia (+$1.00)', 'Colombia (+$0.50)'],
      milk: ['Whole (default)', 'Oat (+$0.50)', 'Almond (+$0.50)', 'Soy (+$0.50)'],
      size: ['Small (-$1.00)', 'Medium (default)', 'Large (+$1.00)'],
    },
  },
  {
    id: '2',
    name: 'Cappuccino',
    description: 'Espresso with foamed milk',
    category: 'espresso',
    base_price: 4.75,
    is_available: true,
    is_featured: false,
    customization_options: {
      beans: ['Brazil (default)', 'Ethiopia (+$1.00)'],
      milk: ['Whole (default)', 'Oat (+$0.50)'],
      size: ['Small (-$0.75)', 'Medium (default)', 'Large (+$0.75)'],
    },
  },
  {
    id: '3',
    name: 'Cold Brew',
    description: 'Smooth cold-steeped coffee',
    category: 'cold_brew',
    base_price: 5.50,
    is_available: true,
    is_featured: true,
    customization_options: {
      size: ['Small (-$1.00)', 'Medium (default)', 'Large (+$1.00)'],
      ice: ['Light', 'Regular (default)', 'Extra'],
      sweetness: ['None (default)', '1 pump (+$0.25)', '2 pumps (+$0.50)'],
    },
  },
  {
    id: '4',
    name: 'Matcha Latte',
    description: 'Premium matcha with milk',
    category: 'specialty',
    base_price: 6.00,
    is_available: true,
    is_featured: false,
    customization_options: {
      milk: ['Whole (default)', 'Oat (+$0.50)', 'Almond (+$0.50)'],
      size: ['Small (-$1.00)', 'Medium (default)', 'Large (+$1.00)'],
      sweetness: ['None', 'Light (default)', 'Regular', 'Extra'],
    },
  },
  {
    id: '5',
    name: 'Croissant',
    description: 'Buttery, flaky pastry',
    category: 'pastry',
    base_price: 3.50,
    is_available: true,
    is_featured: false,
  },
];

const mockShop: Shop = {
  id: '1',
  name: 'Moonbean Coffee',
  description: 'Artisanal coffee roasted in-house with care and passion',
  address: '30 St Andrews St, Toronto, ON M5T 1K6',
  city: 'Toronto',
  rating: 4.8,
  rating_count: 703,
  is_active: true,
  hours: {
    monday: { open: '07:00', close: '18:00' },
    tuesday: { open: '07:00', close: '18:00' },
    wednesday: { open: '07:00', close: '18:00' },
    thursday: { open: '07:00', close: '18:00' },
    friday: { open: '07:00', close: '18:00' },
    saturday: { open: '08:00', close: '17:00' },
    sunday: { open: '08:00', close: '17:00' },
  },
};

export default function ShopDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const cartItemCount = useCartStore((state) => state.getItemCount());
  
  const [shop, setShop] = useState<Shop | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    fetchShopDetails();
  }, [id]);

  const fetchShopDetails = async () => {
    try {
      const [shopResponse, menuResponse] = await Promise.all([
        api.get(`/shops/${id}`),
        api.get(`/shops/${id}/menu`),
      ]);
      setShop(shopResponse.data);
      setMenuItems(menuResponse.data);
    } catch (error) {
      console.log('Using mock data');
      setShop(mockShop);
      setMenuItems(mockMenuItems);
    } finally {
      setLoading(false);
    }
  };

  const categories = ['all', ...new Set(menuItems.map((item) => item.category))];

  const filteredItems = selectedCategory === 'all'
    ? menuItems
    : menuItems.filter((item) => item.category === selectedCategory);

  const featuredItems = menuItems.filter((item) => item.is_featured);

  const formatCategory = (cat: string) => {
    return cat.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const isShopOpen = () => {
    if (!shop?.hours) return true;
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const hours = shop.hours[day];
    if (!hours) return false;
    
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const openTime = parseInt(hours.open.replace(':', ''));
    const closeTime = parseInt(hours.close.replace(':', ''));
    
    return currentTime >= openTime && currentTime <= closeTime;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primaryBlue} />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Shop not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setIsFavorite(!isFavorite)}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={24}
                color={isFavorite ? COLORS.red : COLORS.darkNavy}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <Ionicons name="share-outline" size={24} color={COLORS.darkNavy} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Shop Banner */}
          <View style={styles.bannerPlaceholder}>
            <Ionicons name="cafe" size={64} color={COLORS.white} />
          </View>

          {/* Shop Info */}
          <View style={styles.shopInfo}>
            <View style={styles.shopHeader}>
              <Text style={styles.shopName}>{shop.name}</Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: isShopOpen() ? '#E8F5E9' : '#FFEBEE' }
              ]}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: isShopOpen() ? COLORS.green : COLORS.red }
                ]} />
                <Text style={[
                  styles.statusText,
                  { color: isShopOpen() ? COLORS.green : COLORS.red }
                ]}>
                  {isShopOpen() ? 'Open' : 'Closed'}
                </Text>
              </View>
            </View>
            
            <Text style={styles.shopDescription}>{shop.description}</Text>
            
            <View style={styles.shopMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="star" size={16} color={COLORS.yellow} />
                <Text style={styles.metaText}>
                  {shop.rating} ({shop.rating_count})
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={16} color={COLORS.gray} />
                <Text style={styles.metaText}>{shop.address}</Text>
              </View>
            </View>
          </View>

          {/* Featured Items */}
          {featuredItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Featured</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.featuredContainer}
              >
                {featuredItems.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.featuredCard}
                    onPress={() => router.push(`/item/${shop.id}/${item.id}`)}
                  >
                    <View style={styles.featuredImage}>
                      <Ionicons name="cafe" size={32} color={COLORS.primaryBlue} />
                    </View>
                    <Text style={styles.featuredName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.featuredPrice}>
                      ${item.base_price.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Categories */}
          <View style={styles.categoriesSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesContainer}
            >
              {categories.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={[
                    styles.categoryChip,
                    selectedCategory === category && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(category)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === category && styles.categoryChipTextActive,
                    ]}
                  >
                    {formatCategory(category)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Menu Items */}
          <View style={styles.menuSection}>
            {filteredItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={() => router.push(`/item/${shop.id}/${item.id}`)}
                disabled={!item.is_available}
              >
                <View style={styles.menuItemInfo}>
                  <Text style={[
                    styles.menuItemName,
                    !item.is_available && styles.menuItemUnavailable,
                  ]}>
                    {item.name}
                  </Text>
                  <Text style={styles.menuItemDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text style={styles.menuItemPrice}>
                    ${item.base_price.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.menuItemImage}>
                  <Ionicons name="cafe-outline" size={28} color={COLORS.primaryBlue} />
                </View>
                {!item.is_available && (
                  <View style={styles.unavailableBadge}>
                    <Text style={styles.unavailableText}>Unavailable</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Cart Button */}
        {cartItemCount > 0 && (
          <View style={styles.cartButtonContainer}>
            <TouchableOpacity
              style={styles.cartButton}
              onPress={() => router.push('/cart')}
            >
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
              </View>
              <Text style={styles.cartButtonText}>View Cart</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}
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
    backgroundColor: COLORS.background,
  },
  errorText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 10,
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
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  headerButton: {
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
  bannerPlaceholder: {
    height: 200,
    backgroundColor: COLORS.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopInfo: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    marginTop: -RADIUS.xl,
  },
  shopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  shopName: {
    fontSize: FONTS.h2,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.semibold,
  },
  shopDescription: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  shopMeta: {
    gap: SPACING.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  section: {
    paddingVertical: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  featuredContainer: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  featuredCard: {
    width: 120,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    ...SHADOWS.small,
  },
  featuredImage: {
    width: '100%',
    height: 80,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  featuredName: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  featuredPrice: {
    fontSize: FONTS.bodySmall,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.bold,
  },
  categoriesSection: {
    paddingVertical: SPACING.sm,
  },
  categoriesContainer: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  categoryChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  categoryChipActive: {
    backgroundColor: COLORS.darkNavy,
    borderColor: COLORS.darkNavy,
  },
  categoryChipText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.darkNavy,
    fontWeight: FONTS.medium,
  },
  categoryChipTextActive: {
    color: COLORS.white,
  },
  menuSection: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  menuItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
  },
  menuItemInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  menuItemName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
    marginBottom: 4,
  },
  menuItemUnavailable: {
    color: COLORS.gray,
  },
  menuItemDescription: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  menuItemPrice: {
    fontSize: FONTS.body,
    fontWeight: FONTS.bold,
    color: COLORS.primaryBlue,
  },
  menuItemImage: {
    width: 70,
    height: 70,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.lightGray,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  unavailableText: {
    fontSize: FONTS.caption,
    color: COLORS.gray,
  },
  cartButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
  },
  cartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.darkNavy,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  cartBadge: {
    backgroundColor: COLORS.primaryBlue,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  cartBadgeText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  cartButtonText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.white,
    flex: 1,
    textAlign: 'center',
  },
});
