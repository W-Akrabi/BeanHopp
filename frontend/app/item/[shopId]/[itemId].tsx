import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../../src/constants/theme';
import { useCartStore } from '../../../src/stores/cartStore';
import api from '../../../src/lib/api';

interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;
  base_price: number;
  image_url?: string;
  is_available: boolean;
  customization_options?: Record<string, string[]>;
}

interface Shop {
  id: string;
  name: string;
}

const mockItem: MenuItem = {
  id: '1',
  name: 'Latte',
  description: 'Espresso with steamed milk. Our signature drink with smooth, velvety texture.',
  category: 'espresso',
  base_price: 5.00,
  is_available: true,
  customization_options: {
    beans: ['Brazil (default)', 'Ethiopia (+$1.00)', 'Colombia (+$0.50)'],
    milk: ['Whole (default)', 'Oat (+$0.50)', 'Almond (+$0.50)', 'Soy (+$0.50)'],
    size: ['Small (-$1.00)', 'Medium (default)', 'Large (+$1.00)'],
    shots: ['1 (-$0.50)', '2 (default)', '3 (+$0.50)'],
  },
};

export default function ItemCustomization() {
  const { shopId, itemId } = useLocalSearchParams<{ shopId: string; itemId: string }>();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  
  const [item, setItem] = useState<MenuItem | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchItemDetails();
  }, [shopId, itemId]);

  const fetchItemDetails = async () => {
    try {
      const [itemResponse, shopResponse] = await Promise.all([
        api.get(`/menu-items/${itemId}`),
        api.get(`/shops/${shopId}`),
      ]);
      setItem(itemResponse.data);
      setShop(shopResponse.data);
      initializeSelections(itemResponse.data.customization_options);
    } catch (error) {
      console.log('Using mock data');
      setItem(mockItem);
      setShop({ id: shopId!, name: 'Moonbean Coffee' });
      initializeSelections(mockItem.customization_options);
    } finally {
      setLoading(false);
    }
  };

  const initializeSelections = (options?: Record<string, string[]>) => {
    if (!options) return;
    
    const defaultSelections: Record<string, string> = {};
    Object.entries(options).forEach(([key, values]) => {
      const defaultOption = values.find((v) => v.includes('(default)'));
      if (defaultOption) {
        defaultSelections[key] = defaultOption;
      } else {
        defaultSelections[key] = values[0];
      }
    });
    setSelections(defaultSelections);
  };

  const parsePrice = (option: string): number => {
    const match = option.match(/([+-])\$([\d.]+)/);
    if (!match) return 0;
    const sign = match[1] === '+' ? 1 : -1;
    return sign * parseFloat(match[2]);
  };

  const getCleanOptionName = (option: string): string => {
    return option.replace(/\s*\([^)]*\)\s*/g, '').trim();
  };

  const calculateTotalPrice = (): number => {
    if (!item) return 0;
    
    let price = item.base_price;
    Object.values(selections).forEach((selection) => {
      price += parsePrice(selection);
    });
    return price * quantity;
  };

  const handleAddToCart = () => {
    if (!item || !shop) return;

    const cleanSelections: Record<string, string> = {};
    Object.entries(selections).forEach(([key, value]) => {
      cleanSelections[key] = getCleanOptionName(value);
    });

    addItem({
      menuItemId: item.id,
      shopId: shop.id,
      shopName: shop.name,
      name: item.name,
      price: calculateTotalPrice() / quantity,
      quantity,
      customizations: cleanSelections,
    });

    router.back();
  };

  const formatCategoryTitle = (category: string): string => {
    return category.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primaryBlue} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Item not found</Text>
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
            <Ionicons name="close" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton}>
            <Ionicons name="share-outline" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Item Image */}
          <View style={styles.imageContainer}>
            <Ionicons name="cafe" size={80} color={COLORS.primaryBlue} />
          </View>

          {/* Item Info */}
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.itemPrice}>${item.base_price.toFixed(2)}</Text>
            </View>
            <Text style={styles.itemDescription}>{item.description}</Text>
          </View>

          {/* Customization Options */}
          {item.customization_options && (
            <View style={styles.customizationSection}>
              {Object.entries(item.customization_options).map(([category, options]) => (
                <View key={category} style={styles.optionGroup}>
                  <Text style={styles.optionGroupTitle}>
                    {formatCategoryTitle(category)}
                  </Text>
                  {options.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={styles.optionItem}
                      onPress={() =>
                        setSelections({ ...selections, [category]: option })
                      }
                    >
                      <View style={styles.optionInfo}>
                        <Text style={styles.optionName}>
                          {getCleanOptionName(option)}
                        </Text>
                        {parsePrice(option) !== 0 && (
                          <Text style={styles.optionPrice}>
                            {parsePrice(option) > 0 ? '+' : ''}
                            ${Math.abs(parsePrice(option)).toFixed(2)}
                          </Text>
                        )}
                      </View>
                      <View style={[
                        styles.radioButton,
                        selections[category] === option && styles.radioButtonSelected,
                      ]}>
                        {selections[category] === option && (
                          <Ionicons name="checkmark" size={16} color={COLORS.white} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Bottom Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.quantitySelector}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Ionicons name="remove" size={20} color={COLORS.darkNavy} />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => setQuantity(quantity + 1)}
            >
              <Ionicons name="add" size={20} color={COLORS.darkNavy} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddToCart}
          >
            <Text style={styles.addButtonText}>
              Add {quantity} to bag • ${calculateTotalPrice().toFixed(2)}
            </Text>
          </TouchableOpacity>
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
  shareButton: {
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
  imageContainer: {
    height: 250,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
  },
  itemName: {
    fontSize: FONTS.h2,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  itemPrice: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.primaryBlue,
  },
  itemDescription: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  customizationSection: {
    paddingTop: SPACING.md,
  },
  optionGroup: {
    backgroundColor: COLORS.white,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  optionGroupTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  optionInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionName: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
  },
  optionPrice: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    backgroundColor: COLORS.primaryBlue,
    borderColor: COLORS.primaryBlue,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.xs,
  },
  quantityButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
    marginHorizontal: SPACING.sm,
  },
  addButton: {
    flex: 1,
    marginLeft: SPACING.md,
    backgroundColor: COLORS.darkNavy,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.white,
  },
});
