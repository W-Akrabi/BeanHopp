import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  ViewToken,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const { width } = Dimensions.get('window');

const onboardingData = [
  {
    id: '1',
    title: 'ORDER FROM THE BEST',
    subtitle: 'Specialty\ncoffee shops',
    description: 'Discover amazing local coffee shops in your area',
    icon: 'cafe-outline' as const,
    bgColor: '#E3F2FD',
  },
  {
    id: '2',
    title: 'DISCOVER YOUR FAVORITE',
    subtitle: 'Coffee shops\non the list',
    description: 'Browse menus and find your perfect drink',
    icon: 'list-outline' as const,
    bgColor: '#E8F5E9',
  },
  {
    id: '3',
    title: 'GET REWARDED',
    subtitle: 'Earn\nfree drinks',
    description: 'Collect points with every purchase',
    icon: 'gift-outline' as const,
    bgColor: '#FFF8E1',
  },
  {
    id: '4',
    title: 'PERSONALIZE YOUR ORDER',
    subtitle: 'Customize\nyour coffee',
    description: 'Make it just the way you like it',
    icon: 'options-outline' as const,
    bgColor: '#FCE4EC',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      router.push('/(auth)/login');
    }
  };

  const handleSkip = () => {
    router.push('/(auth)/login');
  };

  const renderItem = ({ item }: { item: typeof onboardingData[0] }) => (
    <View style={[styles.slide, { backgroundColor: item.bgColor }]}>
      <View style={styles.slideContent}>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
        
        <View style={styles.phoneContainer}>
          <View style={styles.phoneMockup}>
            <View style={styles.phoneScreen}>
              <Ionicons name={item.icon} size={80} color={COLORS.primaryBlue} />
              <Text style={styles.phoneText}>{item.description}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={onboardingData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {onboardingData.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentIndex && styles.activeDot,
              ]}
            />
          ))}
        </View>

        <Button
          title={currentIndex === onboardingData.length - 1 ? 'Get Started' : 'Next'}
          onPress={handleNext}
          size="large"
          style={styles.nextButton}
        />
      </View>
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
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  skipButton: {
    padding: SPACING.sm,
  },
  skipText: {
    fontSize: FONTS.body,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
  },
  slide: {
    width,
    flex: 1,
  },
  slideContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  slideTitle: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.bold,
    color: COLORS.primaryBlue,
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  slideSubtitle: {
    fontSize: FONTS.h1,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    textAlign: 'center',
    lineHeight: 40,
  },
  phoneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  phoneMockup: {
    width: width * 0.7,
    height: width * 1.2,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl * 2,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  phoneScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  phoneText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.lightGray,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: COLORS.primaryBlue,
  },
  nextButton: {
    width: '100%',
  },
});
