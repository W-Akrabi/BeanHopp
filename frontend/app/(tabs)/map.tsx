import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import api from '../../src/lib/api';

const { width, height } = Dimensions.get('window');

interface Shop {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  rating: number;
  rating_count: number;
  is_active: boolean;
}

const TORONTO_REGION = {
  latitude: 43.6510,
  longitude: -79.3835,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [region, setRegion] = useState(TORONTO_REGION);

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      const response = await api.get('/shops');
      setShops(response.data);
    } catch (error) {
      console.log('Error fetching shops:', error);
      // Mock data
      setShops([
        {
          id: 'shop-1',
          name: 'Moonbean Coffee',
          description: 'Artisanal coffee roasted in-house',
          address: '30 St Andrews St',
          city: 'Toronto',
          latitude: 43.6510,
          longitude: -79.3835,
          rating: 4.8,
          rating_count: 703,
          is_active: true,
        },
        {
          id: 'shop-2',
          name: 'Chapter Coffee',
          description: 'Specialty coffee and books',
          address: '456 Queen St W',
          city: 'Toronto',
          latitude: 43.6485,
          longitude: -79.3980,
          rating: 4.9,
          rating_count: 56,
          is_active: true,
        },
        {
          id: 'shop-3',
          name: 'Opal Coffee',
          description: 'Modern third-wave coffee',
          address: '789 College St',
          city: 'Toronto',
          latitude: 43.6544,
          longitude: -79.4235,
          rating: 5.0,
          rating_count: 654,
          is_active: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkerPress = (shop: Shop) => {
    setSelectedShop(shop);
  };

  const handleShopPress = () => {
    if (selectedShop) {
      router.push(`/shop/${selectedShop.id}`);
    }
  };

  const centerOnUser = () => {
    setRegion(TORONTO_REGION);
  };

  const mapRef = useRef<MapView>(null);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primaryBlue} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map using react-native-maps */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {shops.map((shop) => (
          <Marker
            key={shop.id}
            coordinate={{
              latitude: shop.latitude,
              longitude: shop.longitude,
            }}
            title={shop.name}
            description={shop.address}
            onPress={() => handleMarkerPress(shop)}
          >
            <View style={[
              styles.markerContainer,
              selectedShop?.id === shop.id && styles.markerSelected,
            ]}>
              <Ionicons
                name="cafe"
                size={20}
                color={selectedShop?.id === shop.id ? COLORS.white : COLORS.primaryBlue}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Header */}
      <SafeAreaView style={styles.header} edges={['top']}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Find Coffee</Text>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="options-outline" size={20} color={COLORS.darkNavy} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Center Button */}
      <TouchableOpacity style={styles.centerButton} onPress={centerOnUser}>
        <Ionicons name="locate" size={24} color={COLORS.primaryBlue} />
      </TouchableOpacity>

      {/* Selected Shop Card */}
      {selectedShop && (
        <View style={styles.shopCardContainer}>
          <TouchableOpacity
            style={styles.shopCard}
            onPress={handleShopPress}
            activeOpacity={0.9}
          >
            <View style={styles.shopLogo}>
              <Ionicons name="cafe" size={28} color={COLORS.primaryBlue} />
            </View>
            <View style={styles.shopInfo}>
              <Text style={styles.shopName}>{selectedShop.name}</Text>
              <Text style={styles.shopAddress}>{selectedShop.address}</Text>
              <View style={styles.shopMeta}>
                <Ionicons name="star" size={14} color={COLORS.yellow} />
                <Text style={styles.shopRating}>
                  {selectedShop.rating} ({selectedShop.rating_count})
                </Text>
                <View style={styles.openBadge}>
                  <View style={styles.openDot} />
                  <Text style={styles.openText}>Open</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.directionsButton}>
              <Ionicons name="navigate" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}

      {/* Shop List Toggle */}
      <View style={styles.listToggleContainer}>
        <TouchableOpacity
          style={styles.listToggle}
          onPress={() => router.push('/(tabs)/home')}
        >
          <Ionicons name="list" size={18} color={COLORS.darkNavy} />
          <Text style={styles.listToggleText}>List View</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  markerContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primaryBlue,
    ...SHADOWS.small,
  },
  markerSelected: {
    backgroundColor: COLORS.primaryBlue,
    borderColor: COLORS.primaryBlue,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: FONTS.h2,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  centerButton: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: 200,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  shopCardContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 120 : 100,
    left: SPACING.lg,
    right: SPACING.lg,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.medium,
  },
  shopLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  shopAddress: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  shopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  shopRating: {
    fontSize: FONTS.bodySmall,
    color: COLORS.darkNavy,
    marginLeft: 4,
    marginRight: SPACING.md,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.green,
    marginRight: 4,
  },
  openText: {
    fontSize: FONTS.caption,
    color: COLORS.green,
    fontWeight: FONTS.medium,
  },
  directionsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listToggleContainer: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
  },
  listToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    ...SHADOWS.small,
  },
  listToggleText: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.medium,
    color: COLORS.darkNavy,
    marginLeft: SPACING.xs,
  },
});
