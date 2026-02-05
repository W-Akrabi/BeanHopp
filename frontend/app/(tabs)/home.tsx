import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { useNotificationStore, Notification } from '../../src/stores/notificationStore';
import api from '../../src/lib/api';

const { width } = Dimensions.get('window');

interface Shop {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  rating: number;
  rating_count: number;
  is_active: boolean;
  logo_url?: string;
  banner_url?: string;
  distance?: number;
  hours?: Record<string, { open: string; close: string }>;
  _score?: number;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  shop_id: string;
  shops?: { name: string };
  _score?: number;
}

interface Promo {
  id: string;
  title: string;
  subtitle: string;
  discount_text: string;
  bg_color: string;
  accent_color: string;
  type: string;
  is_active: boolean;
}

interface SearchResults {
  shops: Shop[];
  menu_items: MenuItem[];
  suggestions: string[];
}

const categories = [
  { id: '1', name: 'Espresso', icon: 'cafe' },
  { id: '2', name: 'Latte', icon: 'cafe-outline' },
  { id: '3', name: 'Cold Brew', icon: 'snow' },
  { id: '4', name: 'Matcha', icon: 'leaf' },
  { id: '5', name: 'Pastry', icon: 'pizza' },
];

const defaultPromos: Promo[] = [
  {
    id: 'promo-1',
    title: 'Exclusive Offer',
    subtitle: 'Save up to 30% off',
    discount_text: '30% OFF',
    bg_color: '#FFF8DC',
    accent_color: '#FF9800',
    type: 'discount',
    is_active: true,
  },
  {
    id: 'promo-2',
    title: 'Happy Hour',
    subtitle: '2-5 PM Daily',
    discount_text: 'BOGO',
    bg_color: '#E3F2FD',
    accent_color: '#1E88E5',
    type: 'bogo',
    is_active: true,
  },
  {
    id: 'promo-3',
    title: 'New: Summer Menu',
    subtitle: 'Try our new cold brews',
    discount_text: 'NEW',
    bg_color: '#E8F5E9',
    accent_color: '#4CAF50',
    type: 'announcement',
    is_active: true,
  },
  {
    id: 'promo-4',
    title: 'Double Points',
    subtitle: 'Earn 2x beans this weekend',
    discount_text: '2X',
    bg_color: '#FFF3E0',
    accent_color: '#FF5722',
    type: 'rewards',
    is_active: true,
  },
];

export default function Home() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { 
    notifications, 
    unreadCount, 
    fetchNotifications, 
    markAsRead, 
    markAllAsRead,
    addNotification 
  } = useNotificationStore();
  
  const [shops, setShops] = useState<Shop[]>([]);
  const [promos, setPromos] = useState<Promo[]>(defaultPromos);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  
  // Promo carousel state
  const [currentPromoIndex, setCurrentPromoIndex] = useState(0);
  const promoScrollRef = useRef<ScrollView>(null);
  const promoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Search modal state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>({ shops: [], menu_items: [], suggestions: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Notifications modal state
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchShops = async () => {
    try {
      const response = await api.get('/shops');
      const shopsWithDistance = response.data.map((shop: Shop, index: number) => ({
        ...shop,
        distance: (index + 1) * 0.5,
      }));
      setShops(shopsWithDistance);
    } catch (error) {
      console.log('Error fetching shops:', error);
      setShops([
        {
          id: '1',
          name: 'Moonbean Coffee',
          description: 'Artisanal coffee roasted in-house',
          address: '30 St Andrews St',
          city: 'Toronto',
          rating: 4.8,
          rating_count: 703,
          is_active: true,
          distance: 0.5,
        },
        {
          id: '2',
          name: 'Chapter Coffee',
          description: 'Specialty coffee and books',
          address: '456 Queen St W',
          city: 'Toronto',
          rating: 4.9,
          rating_count: 56,
          is_active: true,
          distance: 1.0,
        },
        {
          id: '3',
          name: 'Opal Coffee',
          description: 'Modern third-wave coffee',
          address: '789 College St',
          city: 'Toronto',
          rating: 5.0,
          rating_count: 654,
          is_active: true,
          distance: 2.0,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPromos = async () => {
    try {
      const response = await api.get('/promos');
      if (response.data && response.data.length > 0) {
        setPromos(response.data);
      }
    } catch (error) {
      console.log('Using default promos');
    }
  };

  useEffect(() => {
    fetchShops();
    fetchPromos();
    if (user) {
      fetchNotifications(user.id);
    }
  }, [user]);

  // Auto-rotate promos
  useEffect(() => {
    if (promos.length > 1) {
      promoIntervalRef.current = setInterval(() => {
        setCurrentPromoIndex((prev) => {
          const nextIndex = (prev + 1) % promos.length;
          promoScrollRef.current?.scrollTo({
            x: nextIndex * width,
            animated: true,
          });
          return nextIndex;
        });
      }, 4000);
    }
    
    return () => {
      if (promoIntervalRef.current) {
        clearInterval(promoIntervalRef.current);
      }
    };
  }, [promos.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchShops(), fetchPromos()]);
    if (user) {
      fetchNotifications(user.id);
    }
    setRefreshing(false);
  }, [user]);

  const getUserName = () => {
    if (user?.user_metadata?.name) {
      return user.user_metadata.name.split(' ')[0];
    }
    return 'Coffee Lover';
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Advanced search with debouncing and backend integration
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    // Clear previous debounce
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    
    if (query.length === 0) {
      setSearchResults({ shops: [], menu_items: [], suggestions: [] });
      return;
    }
    
    // Debounce search
    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        // Try backend search first
        const response = await api.get('/search', { params: { q: query, limit: 10 } });
        setSearchResults(response.data);
      } catch (error) {
        // Fallback to local search with improved algorithm
        const results = performLocalSearch(query);
        setSearchResults(results);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  // Local search with fuzzy matching and relevance scoring
  const performLocalSearch = (query: string): SearchResults => {
    const q = query.toLowerCase().trim();
    const results: SearchResults = { shops: [], menu_items: [], suggestions: [] };
    
    // Score shops
    const scoredShops = shops.map((shop) => {
      let score = 0;
      const name = shop.name.toLowerCase();
      const desc = (shop.description || '').toLowerCase();
      const addr = (shop.address || '').toLowerCase();
      
      // Exact match
      if (name === q) score += 100;
      // Starts with
      else if (name.startsWith(q)) score += 80;
      // Word match
      else if (name.split(' ').some(word => word.startsWith(q))) score += 60;
      // Contains
      else if (name.includes(q)) score += 40;
      // Description match
      if (desc.includes(q)) score += 20;
      // Address match
      if (addr.includes(q)) score += 10;
      // Fuzzy match (for typos)
      if (score === 0) {
        const similarity = calculateSimilarity(q, name);
        if (similarity > 0.6) score += Math.round(similarity * 30);
      }
      
      return { ...shop, _score: score };
    });
    
    results.shops = scoredShops
      .filter(s => s._score! > 0)
      .sort((a, b) => b._score! - a._score!)
      .slice(0, 10);
    
    // Generate suggestions
    const popularSearches = ['Latte', 'Espresso', 'Cold Brew', 'Matcha', 'Cappuccino', 'Americano', 'Mocha', 'Croissant', 'Oat Milk', 'Iced Coffee'];
    results.suggestions = popularSearches.filter(p => p.toLowerCase().includes(q)).slice(0, 5);
    
    return results;
  };

  // Calculate string similarity (Levenshtein-based)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };

  const handlePromoScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    setCurrentPromoIndex(index);
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const renderShopCard = ({ item }: { item: Shop }) => (
    <TouchableOpacity
      style={styles.shopCard}
      onPress={() => router.push(`/shop/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.shopLogoContainer}>
        <View style={styles.shopLogo}>
          <Text style={styles.shopLogoText}>
            {item.name.substring(0, 2).toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.shopInfo}>
        <View style={styles.shopHeader}>
          <Text style={styles.shopName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.rating >= 4.9 && (
            <View style={styles.topBadge}>
              <Text style={styles.topBadgeText}>Top</Text>
            </View>
          )}
        </View>
        <Text style={styles.shopDistance}>
          {item.distance} km • {item.city}
        </Text>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={14} color={COLORS.yellow} />
          <Text style={styles.ratingText}>
            {item.rating} ({item.rating_count})
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
    </TouchableOpacity>
  );

  const renderSearchModal = () => (
    <Modal
      visible={showSearch}
      animationType="slide"
      onRequestClose={() => setShowSearch(false)}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.searchHeader}>
          <TouchableOpacity onPress={() => setShowSearch(false)}>
            <Ionicons name="arrow-back" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color={COLORS.gray} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search shops, drinks..."
              placeholderTextColor={COLORS.gray}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')}>
                <Ionicons name="close-circle" size={20} color={COLORS.gray} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {searchLoading ? (
          <View style={styles.searchLoadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primaryBlue} />
          </View>
        ) : searchQuery.length === 0 ? (
          <View style={styles.searchSuggestions}>
            <Text style={styles.suggestionTitle}>Popular Searches</Text>
            {['Latte', 'Cold Brew', 'Matcha', 'Croissant', 'Espresso', 'Oat Milk'].map((term) => (
              <TouchableOpacity
                key={term}
                style={styles.suggestionItem}
                onPress={() => handleSearch(term)}
              >
                <Ionicons name="trending-up" size={18} color={COLORS.gray} />
                <Text style={styles.suggestionText}>{term}</Text>
              </TouchableOpacity>
            ))}
            
            <Text style={[styles.suggestionTitle, { marginTop: SPACING.lg }]}>Recent Searches</Text>
            {['Moonbean', 'Cappuccino'].map((term) => (
              <TouchableOpacity
                key={term}
                style={styles.suggestionItem}
                onPress={() => handleSearch(term)}
              >
                <Ionicons name="time-outline" size={18} color={COLORS.gray} />
                <Text style={styles.suggestionText}>{term}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <ScrollView style={styles.searchResultsContainer}>
            {/* Shop Results */}
            {searchResults.shops.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Shops</Text>
                {searchResults.shops.map((shop) => (
                  <View key={shop.id}>{renderShopCard({ item: shop })}</View>
                ))}
              </View>
            )}
            
            {/* Menu Item Results */}
            {searchResults.menu_items.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Menu Items</Text>
                {searchResults.menu_items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.menuItemResult}
                    onPress={() => {
                      setShowSearch(false);
                      router.push(`/shop/${item.shop_id}`);
                    }}
                  >
                    <View style={styles.menuItemIcon}>
                      <Ionicons name="cafe" size={20} color={COLORS.primaryBlue} />
                    </View>
                    <View style={styles.menuItemInfo}>
                      <Text style={styles.menuItemName}>{item.name}</Text>
                      <Text style={styles.menuItemShop}>{item.shops?.name || 'Coffee Shop'}</Text>
                    </View>
                    <Text style={styles.menuItemPrice}>${item.price.toFixed(2)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            
            {/* Suggestions */}
            {searchResults.suggestions.length > 0 && (
              <View style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>Suggestions</Text>
                <View style={styles.suggestionChips}>
                  {searchResults.suggestions.map((suggestion) => (
                    <TouchableOpacity
                      key={suggestion}
                      style={styles.suggestionChip}
                      onPress={() => handleSearch(suggestion)}
                    >
                      <Text style={styles.suggestionChipText}>{suggestion}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            
            {/* Empty State */}
            {searchResults.shops.length === 0 && searchResults.menu_items.length === 0 && (
              <View style={styles.emptySearch}>
                <Ionicons name="search-outline" size={48} color={COLORS.lightGray} />
                <Text style={styles.emptySearchText}>No results found for "{searchQuery}"</Text>
                <Text style={styles.emptySearchHint}>Try a different search term</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );

  const renderNotificationsModal = () => (
    <Modal
      visible={showNotifications}
      animationType="slide"
      onRequestClose={() => setShowNotifications(false)}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.notifHeader}>
          <TouchableOpacity onPress={() => setShowNotifications(false)}>
            <Ionicons name="arrow-back" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
          <Text style={styles.notifTitle}>Notifications</Text>
          {notifications.length > 0 && (
            <TouchableOpacity onPress={markAllAsRead}>
              <Text style={styles.markAllRead}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.notifItem,
                !item.read && styles.notifItemUnread,
              ]}
              onPress={() => {
                markAsRead(item.id);
                // Handle notification action based on type
                if (item.type === 'order' && item.data?.order_id) {
                  setShowNotifications(false);
                  router.push('/(tabs)/orders');
                } else if (item.type === 'promo') {
                  setShowNotifications(false);
                  router.push('/(tabs)/rewards');
                }
              }}
            >
              <View style={[
                styles.notifIcon,
                {
                  backgroundColor:
                    item.type === 'order' ? '#E8F5E9' :
                    item.type === 'promo' ? '#FFF3E0' :
                    item.type === 'gift' ? '#FCE4EC' :
                    item.type === 'reward' ? '#E3F2FD' : '#F5F5F5',
                },
              ]}>
                <Ionicons
                  name={
                    item.type === 'order' ? 'checkmark-circle' :
                    item.type === 'promo' ? 'pricetag' :
                    item.type === 'gift' ? 'gift' :
                    item.type === 'reward' ? 'trophy' : 'notifications'
                  }
                  size={20}
                  color={
                    item.type === 'order' ? COLORS.green :
                    item.type === 'promo' ? COLORS.orange :
                    item.type === 'gift' ? '#E91E63' :
                    item.type === 'reward' ? COLORS.primaryBlue : COLORS.gray
                  }
                />
              </View>
              <View style={styles.notifContent}>
                <Text style={styles.notifItemTitle}>{item.title}</Text>
                <Text style={styles.notifMessage}>{item.message}</Text>
                <Text style={styles.notifTime}>{getTimeAgo(item.created_at)}</Text>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyNotif}>
              <Ionicons name="notifications-outline" size={64} color={COLORS.lightGray} />
              <Text style={styles.emptyNotifTitle}>No notifications yet</Text>
              <Text style={styles.emptyNotifText}>
                We'll notify you about orders, promotions, and rewards
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
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
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.userName}>{getUserName()}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowSearch(true)}
            >
              <Ionicons name="search" size={24} color={COLORS.darkNavy} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowNotifications(true)}
            >
              <Ionicons name="notifications-outline" size={24} color={COLORS.darkNavy} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Full-Width Promo Carousel */}
        <View style={styles.promoCarouselContainer}>
          <ScrollView
            ref={promoScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handlePromoScroll}
            decelerationRate="fast"
            snapToInterval={width}
            snapToAlignment="center"
          >
            {promos.map((promo, index) => (
              <TouchableOpacity
                key={promo.id}
                style={[styles.promoBanner, { backgroundColor: promo.bg_color }]}
                onPress={() => router.push('/(tabs)/rewards')}
                activeOpacity={0.9}
              >
                <View style={styles.promoContent}>
                  <Text style={styles.promoTitle}>{promo.title}</Text>
                  <Text style={styles.promoSubtitle}>{promo.subtitle}</Text>
                  <View style={styles.promoButton}>
                    <Text style={styles.promoButtonText}>Discover</Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.primaryBlue} />
                  </View>
                </View>
                <View style={[styles.promoImagePlaceholder, { backgroundColor: promo.accent_color }]}>
                  <Text style={styles.promoDiscount}>{promo.discount_text}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          {/* Promo Indicators */}
          <View style={styles.promoIndicators}>
            {promos.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.promoIndicator,
                  currentPromoIndex === index && styles.promoIndicatorActive,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
          contentContainerStyle={styles.categoriesContent}
        >
          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={styles.categoryItem}
              onPress={() => {
                handleSearch(category.name);
                setShowSearch(true);
              }}
            >
              <View style={styles.categoryIcon}>
                <Ionicons name={category.icon as any} size={28} color={COLORS.darkNavy} />
              </View>
              <Text style={styles.categoryName}>{category.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filters */}
        <View style={styles.filtersSection}>
          <Text style={styles.sectionTitle}>Nearest shops</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersContainer}
          >
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedFilter === 'open' && styles.filterChipActive,
              ]}
              onPress={() => setSelectedFilter(selectedFilter === 'open' ? null : 'open')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedFilter === 'open' && styles.filterChipTextActive,
                ]}
              >
                Open now
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterChip,
                selectedFilter === 'favorites' && styles.filterChipActive,
              ]}
              onPress={() => setSelectedFilter(selectedFilter === 'favorites' ? null : 'favorites')}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedFilter === 'favorites' && styles.filterChipTextActive,
                ]}
              >
                Favorites
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterChip}>
              <Text style={styles.filterChipText}>50 km</Text>
              <Ionicons name="chevron-down" size={14} color={COLORS.darkNavy} />
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Shop List */}
        <View style={styles.shopList}>
          {shops.map((shop) => (
            <View key={shop.id}>{renderShopCard({ item: shop })}</View>
          ))}
        </View>
      </ScrollView>

      {renderSearchModal()}
      {renderNotificationsModal()}
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
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  greeting: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.red,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  // Promo Carousel
  promoCarouselContainer: {
    marginTop: SPACING.sm,
  },
  promoBanner: {
    width: width,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  promoContent: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  promoTitle: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  promoSubtitle: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    marginVertical: SPACING.xs,
  },
  promoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  promoButtonText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.primaryBlue,
  },
  promoImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-10deg' }],
  },
  promoDiscount: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.white,
    textAlign: 'center',
  },
  promoIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  promoIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.lightGray,
    marginHorizontal: 4,
  },
  promoIndicatorActive: {
    backgroundColor: COLORS.primaryBlue,
    width: 24,
  },
  categoriesContainer: {
    marginVertical: SPACING.md,
  },
  categoriesContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  categoryIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
    ...SHADOWS.small,
  },
  categoryName: {
    fontSize: FONTS.caption,
    color: COLORS.darkNavy,
    fontWeight: FONTS.medium,
  },
  filtersSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  filtersContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.white,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  filterChipActive: {
    backgroundColor: COLORS.darkNavy,
    borderColor: COLORS.darkNavy,
  },
  filterChipText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.darkNavy,
    fontWeight: FONTS.medium,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  shopList: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
  },
  shopLogoContainer: {
    marginRight: SPACING.md,
  },
  shopLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopLogoText: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  shopInfo: {
    flex: 1,
  },
  shopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shopName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
    flex: 1,
  },
  topBadge: {
    backgroundColor: COLORS.primaryBlue,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    marginLeft: SPACING.sm,
  },
  topBadgeText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  shopDistance: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginVertical: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.darkNavy,
    marginLeft: 4,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    marginLeft: SPACING.md,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
  },
  searchLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSuggestions: {
    padding: SPACING.lg,
  },
  suggestionTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  suggestionText: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
    marginLeft: SPACING.md,
  },
  searchResultsContainer: {
    flex: 1,
  },
  resultSection: {
    padding: SPACING.lg,
  },
  resultSectionTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  menuItemResult: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  menuItemInfo: {
    flex: 1,
  },
  menuItemName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  menuItemShop: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
  },
  menuItemPrice: {
    fontSize: FONTS.body,
    fontWeight: FONTS.bold,
    color: COLORS.primaryBlue,
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  suggestionChip: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.lightGray,
  },
  suggestionChipText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.darkNavy,
  },
  emptySearch: {
    alignItems: 'center',
    paddingTop: SPACING.xxl * 2,
  },
  emptySearchText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.medium,
    color: COLORS.darkNavy,
    marginTop: SPACING.md,
  },
  emptySearchHint: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  notifTitle: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  markAllRead: {
    fontSize: FONTS.bodySmall,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  notifItemUnread: {
    backgroundColor: '#F8F9FA',
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  notifContent: {
    flex: 1,
  },
  notifItemTitle: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  notifMessage: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  notifTime: {
    fontSize: FONTS.caption,
    color: COLORS.gray,
    marginTop: 4,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primaryBlue,
    marginLeft: SPACING.sm,
    marginTop: 4,
  },
  emptyNotif: {
    alignItems: 'center',
    paddingTop: SPACING.xxl * 2,
    paddingHorizontal: SPACING.lg,
  },
  emptyNotifTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
    marginTop: SPACING.md,
  },
  emptyNotifText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
});
