import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuthStore } from '../../src/stores/authStore';
import api from '../../src/lib/api';

interface FavoriteShop {
  id: string;
  name: string;
  rating: number;
}

interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

const mockFavorites: FavoriteShop[] = [
  { id: 'shop-1', name: 'Moonbean Coffee', rating: 4.8 },
  { id: 'shop-2', name: 'Chapter Coffee', rating: 4.9 },
];

const topUpAmounts = [10, 25, 50, 100];

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const [favorites, setFavorites] = useState<FavoriteShop[]>(mockFavorites);
  const [userPoints, setUserPoints] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [selectedTopUpAmount, setSelectedTopUpAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserData();
      fetchWalletData();
    }
  }, [user]);

  const fetchUserData = async () => {
    try {
      const pointsResponse = await api.get(`/loyalty/${user?.id}/points`);
      setUserPoints(pointsResponse.data.total_points);
    } catch (error) {
      console.log('Using mock data for points');
    }
  };

  const fetchWalletData = async () => {
    try {
      const walletResponse = await api.get(`/wallet/${user?.id}`);
      setWalletBalance(walletResponse.data.balance || 0);
      setWalletTransactions(walletResponse.data.transactions || []);
    } catch (error) {
      console.log('Using mock data for wallet');
      setWalletBalance(0);
    }
  };

  const handleTopUp = async () => {
    const amount = selectedTopUpAmount || parseFloat(customAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please select or enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/wallet/topup', {
        user_id: user?.id,
        amount: amount,
      });
      
      if (response.data.success) {
        setWalletBalance(response.data.new_balance);
        Alert.alert('Success!', `$${amount.toFixed(2)} added to your wallet`);
        setShowTopUpModal(false);
        setSelectedTopUpAmount(null);
        setCustomAmount('');
        fetchWalletData();
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add funds');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const getUserName = () => {
    if (user?.user_metadata?.name) {
      return user.user_metadata.name;
    }
    return 'Coffee Lover';
  };

  const getUserInitials = () => {
    const name = getUserName();
    return name.substring(0, 2).toUpperCase();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const menuItems = [
    {
      icon: 'wallet-outline',
      title: 'Wallet',
      subtitle: `Balance: $${walletBalance.toFixed(2)}`,
      onPress: () => setShowWalletModal(true),
    },
    {
      icon: 'settings-outline',
      title: 'Settings',
      subtitle: 'App preferences',
      onPress: () => Alert.alert('Settings', 'Coming soon'),
    },
    {
      icon: 'receipt-outline',
      title: 'Orders',
      subtitle: 'View order history',
      onPress: () => router.push('/(tabs)/orders'),
    },
    {
      icon: 'help-circle-outline',
      title: 'Help',
      subtitle: 'FAQs and support',
      onPress: () => Alert.alert('Help', 'Contact support@beanhop.ca'),
    },
    {
      icon: 'swap-horizontal-outline',
      title: 'Switch account',
      subtitle: 'Change to another account',
      onPress: () => Alert.alert('Switch Account', 'Coming soon'),
    },
  ];

  const renderFavoriteItem = ({ item }: { item: FavoriteShop }) => (
    <TouchableOpacity
      style={styles.favoriteCard}
      onPress={() => router.push(`/shop/${item.id}`)}
    >
      <View style={styles.favoriteLogo}>
        <Ionicons name="cafe" size={20} color={COLORS.primaryBlue} />
      </View>
      <Text style={styles.favoriteName} numberOfLines={1}>{item.name}</Text>
      <View style={styles.favoriteRating}>
        <Ionicons name="star" size={12} color={COLORS.yellow} />
        <Text style={styles.favoriteRatingText}>{item.rating}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderWalletModal = () => (
    <Modal
      visible={showWalletModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowWalletModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>My Wallet</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowWalletModal(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.darkNavy} />
            </TouchableOpacity>
          </View>

          {/* Balance Card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <Text style={styles.balanceAmount}>${walletBalance.toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.topUpButton}
              onPress={() => {
                setShowWalletModal(false);
                setShowTopUpModal(true);
              }}
            >
              <Ionicons name="add-circle" size={20} color={COLORS.white} />
              <Text style={styles.topUpButtonText}>Add Funds</Text>
            </TouchableOpacity>
          </View>

          {/* Transaction History */}
          <Text style={styles.transactionTitle}>Recent Transactions</Text>
          <ScrollView style={styles.transactionList}>
            {walletTransactions.length > 0 ? (
              walletTransactions.map((tx) => (
                <View key={tx.id} style={styles.transactionItem}>
                  <View style={styles.transactionLeft}>
                    <View style={[
                      styles.transactionIcon,
                      { backgroundColor: tx.amount >= 0 ? '#E8F5E9' : '#FFEBEE' }
                    ]}>
                      <Ionicons
                        name={tx.amount >= 0 ? 'arrow-down' : 'arrow-up'}
                        size={16}
                        color={tx.amount >= 0 ? COLORS.green : COLORS.red}
                      />
                    </View>
                    <View>
                      <Text style={styles.transactionDesc}>{tx.description}</Text>
                      <Text style={styles.transactionDate}>{formatDate(tx.created_at)}</Text>
                    </View>
                  </View>
                  <Text style={[
                    styles.transactionAmount,
                    { color: tx.amount >= 0 ? COLORS.green : COLORS.red }
                  ]}>
                    {tx.amount >= 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyTransactions}>
                <Ionicons name="wallet-outline" size={48} color={COLORS.lightGray} />
                <Text style={styles.emptyText}>No transactions yet</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderTopUpModal = () => (
    <Modal
      visible={showTopUpModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowTopUpModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Funds</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowTopUpModal(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.darkNavy} />
            </TouchableOpacity>
          </View>

          <Text style={styles.topUpLabel}>Select Amount</Text>
          <View style={styles.amountGrid}>
            {topUpAmounts.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.amountButton,
                  selectedTopUpAmount === amount && styles.amountButtonActive,
                ]}
                onPress={() => {
                  setSelectedTopUpAmount(amount);
                  setCustomAmount('');
                }}
              >
                <Text style={[
                  styles.amountText,
                  selectedTopUpAmount === amount && styles.amountTextActive,
                ]}>
                  ${amount}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.topUpLabel}>Or Enter Custom Amount</Text>
          <View style={styles.customAmountContainer}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.customAmountInput}
              placeholder="0.00"
              placeholderTextColor={COLORS.gray}
              value={customAmount}
              onChangeText={(text) => {
                setCustomAmount(text);
                setSelectedTopUpAmount(null);
              }}
              keyboardType="decimal-pad"
            />
          </View>

          <Button
            title={loading ? 'Processing...' : `Add $${(selectedTopUpAmount || parseFloat(customAmount) || 0).toFixed(2)}`}
            onPress={handleTopUp}
            disabled={loading || (!selectedTopUpAmount && !customAmount)}
            style={styles.confirmButton}
          />
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My account</Text>
          <TouchableOpacity 
            style={styles.notificationButton}
            onPress={() => Alert.alert('Notifications', 'No new notifications')}
          >
            <Ionicons name="notifications-outline" size={24} color={COLORS.darkNavy} />
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <TouchableOpacity 
          style={styles.profileSection}
          onPress={() => Alert.alert('Edit Profile', 'Profile editing coming soon')}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getUserInitials()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{getUserName()}</Text>
            <Text style={styles.editProfileText}>Edit personal information</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
        </TouchableOpacity>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => setShowWalletModal(true)}
          >
            <View style={[styles.statIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="wallet" size={24} color={COLORS.primaryBlue} />
            </View>
            <Text style={styles.statValue}>${walletBalance.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Wallet</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/rewards')}
          >
            <View style={[styles.statIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="cafe" size={24} color={COLORS.orange} />
            </View>
            <Text style={styles.statValue}>{userPoints}</Text>
            <Text style={styles.statLabel}>Beans</Text>
          </TouchableOpacity>
        </View>

        {/* Favorites Section */}
        <View style={styles.favoritesSection}>
          <Text style={styles.sectionLabel}>Your favorites</Text>
          {favorites.length > 0 ? (
            <FlatList
              data={favorites}
              renderItem={renderFavoriteItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.favoritesContainer}
              ListFooterComponent={
                <TouchableOpacity 
                  style={styles.addFavoriteCard}
                  onPress={() => router.push('/(tabs)/home')}
                >
                  <View style={styles.addFavoriteIcon}>
                    <Ionicons name="add" size={24} color={COLORS.primaryBlue} />
                  </View>
                  <Text style={styles.addFavoriteText}>Add new</Text>
                </TouchableOpacity>
              }
            />
          ) : (
            <TouchableOpacity 
              style={styles.addFavoriteCardLarge}
              onPress={() => router.push('/(tabs)/home')}
            >
              <View style={styles.addFavoriteIconLarge}>
                <Ionicons name="add" size={28} color={COLORS.primaryBlue} />
              </View>
              <Text style={styles.addFavoriteTextLarge}>Add favorite shop</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.menuItem,
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <Ionicons name={item.icon as any} size={22} color={COLORS.gray} />
                <View style={styles.menuItemTextContainer}>
                  <Text style={styles.menuItemText}>{item.title}</Text>
                  <Text style={styles.menuItemSubtext}>{item.subtitle}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.version}>Version: 1.0.0</Text>
      </ScrollView>

      {renderWalletModal()}
      {renderTopUpModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
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
  headerTitle: {
    fontSize: FONTS.h2,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.darkNavy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  editProfileText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statValue: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  statLabel: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  favoritesSection: {
    paddingVertical: SPACING.md,
  },
  sectionLabel: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  favoritesContainer: {
    paddingHorizontal: SPACING.lg,
  },
  favoriteCard: {
    width: 100,
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  favoriteLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  favoriteName: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.medium,
    color: COLORS.darkNavy,
    textAlign: 'center',
  },
  favoriteRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  favoriteRatingText: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginLeft: 2,
  },
  addFavoriteCard: {
    width: 100,
    alignItems: 'center',
  },
  addFavoriteIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: COLORS.primaryBlue,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  addFavoriteText: {
    fontSize: FONTS.caption,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
  },
  addFavoriteCardLarge: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  addFavoriteIconLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: COLORS.primaryBlue,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  addFavoriteTextLarge: {
    fontSize: FONTS.body,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
  },
  menuSection: {
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemTextContainer: {
    marginLeft: SPACING.md,
  },
  menuItemText: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
  },
  menuItemSubtext: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  signOutText: {
    fontSize: FONTS.body,
    color: COLORS.red,
    fontWeight: FONTS.semibold,
    marginLeft: SPACING.sm,
  },
  version: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginVertical: SPACING.lg,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '80%',
    padding: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  modalClose: {
    padding: SPACING.sm,
  },
  balanceCard: {
    backgroundColor: COLORS.primaryBlue,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  balanceLabel: {
    fontSize: FONTS.bodySmall,
    color: 'rgba(255,255,255,0.8)',
  },
  balanceAmount: {
    fontSize: 42,
    fontWeight: FONTS.bold,
    color: COLORS.white,
    marginVertical: SPACING.sm,
  },
  topUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    marginTop: SPACING.sm,
  },
  topUpButtonText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.white,
    marginLeft: SPACING.xs,
  },
  transactionTitle: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  transactionList: {
    maxHeight: 300,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  transactionDesc: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
  },
  transactionDate: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: FONTS.body,
    fontWeight: FONTS.bold,
  },
  emptyTransactions: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  topUpLabel: {
    fontSize: FONTS.body,
    fontWeight: FONTS.medium,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  amountButton: {
    width: '48%',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  amountButtonActive: {
    borderColor: COLORS.primaryBlue,
    backgroundColor: '#E3F2FD',
  },
  amountText: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  amountTextActive: {
    color: COLORS.primaryBlue,
  },
  customAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  dollarSign: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  customAmountInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingLeft: SPACING.sm,
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  confirmButton: {
    width: '100%',
  },
});
