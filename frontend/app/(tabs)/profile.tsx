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
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuthStore } from '../../src/stores/authStore';
import api from '../../src/lib/api';
import { useOptionalStripe } from '../../src/lib/stripeCompat';
import { supabase } from '../../src/lib/supabase';

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

interface SavedPaymentMethod {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

interface UserSettings {
  orderUpdates: boolean;
  pushNotifications: boolean;
  promoEmails: boolean;
  biometricLock: boolean;
  showWalletBalance: boolean;
}

const mockFavorites: FavoriteShop[] = [
  { id: 'shop-1', name: 'Moonbean Coffee', rating: 4.8 },
  { id: 'shop-2', name: 'Chapter Coffee', rating: 4.9 },
];

const topUpAmounts = [10, 25, 50, 100];
const defaultSettings: UserSettings = {
  orderUpdates: true,
  pushNotifications: true,
  promoEmails: false,
  biometricLock: false,
  showWalletBalance: true,
};

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const stripe = useOptionalStripe();
  const { initPaymentSheet, presentPaymentSheet } = stripe;
  const [favorites, setFavorites] = useState<FavoriteShop[]>(mockFavorites);
  const [userPoints, setUserPoints] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [addingPaymentMethod, setAddingPaymentMethod] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedTopUpAmount, setSelectedTopUpAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const applePayMerchantIdentifier = process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID || '';

  useEffect(() => {
    if (user) {
      fetchUserData();
      fetchWalletData();
      fetchPaymentMethods();
      hydrateProfileAndSettings();
    }
  }, [user]);

  const hydrateProfileAndSettings = async () => {
    if (!user) {
      return;
    }

    const metadata = (user.user_metadata || {}) as Record<string, any>;
    setDisplayNameInput(metadata.name || '');
    setPhoneInput(metadata.phone || '');
    setCityInput(metadata.city || '');

    let storedSettings: Partial<UserSettings> = {};
    try {
      const raw = await AsyncStorage.getItem(`beanhop_settings_${user.id}`);
      if (raw) {
        storedSettings = JSON.parse(raw) as Partial<UserSettings>;
      }
    } catch {
      // Keep defaults if local settings are unavailable.
    }

    const metadataSettings = (metadata.settings || {}) as Partial<UserSettings>;
    setSettings({
      ...defaultSettings,
      ...storedSettings,
      ...metadataSettings,
    });
  };

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

  const fetchPaymentMethods = async () => {
    if (!user?.id) {
      return;
    }

    setPaymentsLoading(true);
    try {
      const response = await api.get(`/payments/methods/${user.id}`, {
        params: {
          email: user.email,
        },
      });
      setSavedPaymentMethods(response.data.payment_methods || []);
    } catch (error) {
      console.log('Error fetching payment methods:', error);
      setSavedPaymentMethods([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const persistSettings = async (nextSettings: UserSettings) => {
    if (!user?.id) {
      return;
    }

    await AsyncStorage.setItem(`beanhop_settings_${user.id}`, JSON.stringify(nextSettings));
  };

  const saveUserMetadata = async (nextData: Record<string, any>) => {
    const { data, error } = await supabase.auth.updateUser({ data: nextData });
    if (error) {
      throw error;
    }

    if (data.user) {
      useAuthStore.setState({ user: data.user });
    }
  };

  const handleSaveProfile = async () => {
    if (!user) {
      return;
    }

    const trimmedName = displayNameInput.trim();
    if (!trimmedName) {
      Alert.alert('Missing Name', 'Please enter your name.');
      return;
    }

    setSavingProfile(true);
    try {
      const metadata = (user.user_metadata || {}) as Record<string, any>;
      const nextData = {
        ...metadata,
        name: trimmedName,
        phone: phoneInput.trim(),
        city: cityInput.trim(),
        settings,
      };

      await saveUserMetadata(nextData);
      setShowEditProfileModal(false);
      Alert.alert('Saved', 'Your profile information has been updated.');
    } catch (error: any) {
      Alert.alert('Update Failed', error.message || 'Could not update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) {
      return;
    }

    setSavingSettings(true);
    try {
      const metadata = (user.user_metadata || {}) as Record<string, any>;
      await saveUserMetadata({
        ...metadata,
        settings,
      });
      await persistSettings(settings);
      setShowSettingsModal(false);
      Alert.alert('Saved', 'Your settings have been updated.');
    } catch (error: any) {
      Alert.alert('Save Failed', error.message || 'Could not save settings.');
    } finally {
      setSavingSettings(false);
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

  const handleAddPaymentMethod = async () => {
    if (!user?.id) {
      Alert.alert('Sign In Required', 'Please sign in to add payment methods');
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert('Unsupported', 'Adding payment methods is available on iOS/Android only.');
      return;
    }

    if (!stripe.available) {
      Alert.alert('Stripe Unavailable', 'This feature requires a development build (not Expo Go).');
      return;
    }

    setAddingPaymentMethod(true);
    try {
      const response = await api.post('/payments/setup-intent', {
        user_id: user.id,
        email: user.email,
      });

      const { clientSecret } = response.data;
      const initResult = await initPaymentSheet({
        ...getPaymentSheetBaseConfig(),
        setupIntentClientSecret: clientSecret,
      });

      if (initResult.error) {
        Alert.alert('Payment Setup Failed', initResult.error.message);
        return;
      }

      const presentResult = await presentPaymentSheet();
      if (presentResult.error) {
        if (presentResult.error.code === 'Canceled') {
          return;
        }
        Alert.alert('Add Payment Method Failed', presentResult.error.message);
        return;
      }

      Alert.alert('Success', 'Payment method added successfully.');
      fetchPaymentMethods();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add payment method');
    } finally {
      setAddingPaymentMethod(false);
    }
  };

  const handleTopUp = async () => {
    const amount = selectedTopUpAmount || parseFloat(customAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please select or enter a valid amount');
      return;
    }

    if (!user?.id) {
      Alert.alert('Sign In Required', 'Please sign in to add funds');
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert('Unsupported', 'Wallet top-up via card is available on iOS/Android only.');
      return;
    }

    if (!stripe.available) {
      Alert.alert(
        'Stripe Unavailable',
        'Card top-up requires a development build (not Expo Go).'
      );
      return;
    }

    setLoading(true);
    try {
      const intentResponse = await api.post('/wallet/topup/create-payment-intent', {
        user_id: user.id,
        amount,
        email: user.email,
      });

      const { clientSecret, paymentIntentId } = intentResponse.data;

      const initResult = await initPaymentSheet({
        ...getPaymentSheetBaseConfig(),
        paymentIntentClientSecret: clientSecret,
      });

      if (initResult.error) {
        Alert.alert('Payment Setup Failed', initResult.error.message);
        return;
      }

      const paymentResult = await presentPaymentSheet();
      if (paymentResult.error) {
        if (paymentResult.error.code === 'Canceled') {
          return;
        }
        Alert.alert('Payment Failed', paymentResult.error.message);
        return;
      }

      const response = await api.post('/wallet/topup', {
        user_id: user.id,
        amount,
        payment_intent_id: paymentIntentId,
      });

      if (!response.data.success) {
        Alert.alert('Error', 'Payment completed, but wallet update failed. Contact support.');
        return;
      }

      setWalletBalance(response.data.new_balance);
      Alert.alert('Success!', `$${amount.toFixed(2)} added to your wallet`);
      setShowTopUpModal(false);
      setSelectedTopUpAmount(null);
      setCustomAmount('');
      fetchWalletData();
      fetchPaymentMethods();
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

  const walletBalanceDisplay = settings.showWalletBalance
    ? `$${walletBalance.toFixed(2)}`
    : 'Hidden';

  const menuItems = [
    {
      icon: 'wallet-outline',
      title: 'Wallet',
      subtitle: `Balance: ${walletBalanceDisplay}`,
      onPress: () => setShowWalletModal(true),
    },
    {
      icon: 'card-outline',
      title: 'Payments',
      subtitle: savedPaymentMethods.length > 0
        ? `${savedPaymentMethods.length} saved payment method${savedPaymentMethods.length > 1 ? 's' : ''}`
        : 'No saved payment methods',
      onPress: () => {
        setShowPaymentsModal(true);
        fetchPaymentMethods();
      },
    },
    {
      icon: 'settings-outline',
      title: 'Settings',
      subtitle: 'App preferences',
      onPress: () => setShowSettingsModal(true),
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
            title={loading ? 'Processing...' : `Pay $${(selectedTopUpAmount || parseFloat(customAmount) || 0).toFixed(2)}`}
            onPress={handleTopUp}
            disabled={loading || (!selectedTopUpAmount && !customAmount)}
            style={styles.confirmButton}
          />
        </View>
      </View>
    </Modal>
  );

  const renderPaymentsModal = () => (
    <Modal
      visible={showPaymentsModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowPaymentsModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Payment Methods</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowPaymentsModal(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.darkNavy} />
            </TouchableOpacity>
          </View>

          {paymentsLoading ? (
            <View style={styles.paymentsLoading}>
              <ActivityIndicator size="small" color={COLORS.primaryBlue} />
              <Text style={styles.paymentsLoadingText}>Loading payment methods...</Text>
            </View>
          ) : savedPaymentMethods.length > 0 ? (
            <ScrollView style={styles.paymentMethodsList}>
              {savedPaymentMethods.map((method) => (
                <View key={method.id} style={styles.savedPaymentCard}>
                  <View style={styles.savedPaymentLeft}>
                    <View style={styles.savedPaymentIcon}>
                      <Ionicons name="card-outline" size={20} color={COLORS.primaryBlue} />
                    </View>
                    <View>
                      <Text style={styles.savedPaymentTitle}>
                        {(method.brand || 'card').toUpperCase()} •••• {method.last4 || '----'}
                      </Text>
                      <Text style={styles.savedPaymentSubtitle}>
                        Expires {String(method.exp_month || '--').padStart(2, '0')}/{method.exp_year || '----'}
                      </Text>
                    </View>
                  </View>
                  {method.is_default && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyTransactions}>
              <Ionicons name="card-outline" size={48} color={COLORS.lightGray} />
              <Text style={styles.emptyText}>No saved payment methods yet</Text>
              <Text style={styles.savedPaymentHint}>
                Use checkout or wallet top-up with card to save a payment method.
              </Text>
            </View>
          )}

          <Button
            title={addingPaymentMethod ? 'Adding...' : 'Add Payment Method'}
            onPress={handleAddPaymentMethod}
            disabled={addingPaymentMethod}
            style={styles.addPaymentButton}
          />
        </View>
      </View>
    </Modal>
  );

  const renderEditProfileModal = () => (
    <Modal
      visible={showEditProfileModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowEditProfileModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowEditProfileModal(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.darkNavy} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.profileForm}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.profileInput}
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholder="Your full name"
              placeholderTextColor={COLORS.gray}
            />

            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.readOnlyInput}>
              <Text style={styles.readOnlyInputText}>{user?.email || '-'}</Text>
            </View>

            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.profileInput}
              value={phoneInput}
              onChangeText={setPhoneInput}
              placeholder="Optional"
              placeholderTextColor={COLORS.gray}
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>City</Text>
            <TextInput
              style={styles.profileInput}
              value={cityInput}
              onChangeText={setCityInput}
              placeholder="Optional"
              placeholderTextColor={COLORS.gray}
            />
          </ScrollView>

          <Button
            title={savingProfile ? 'Saving...' : 'Save Profile'}
            onPress={handleSaveProfile}
            disabled={savingProfile}
            style={styles.modalPrimaryButton}
          />
        </View>
      </View>
    </Modal>
  );

  const renderSettingsModal = () => {
    const settingRows: {
      key: keyof UserSettings;
      title: string;
      subtitle: string;
    }[] = [
      {
        key: 'orderUpdates',
        title: 'Order updates',
        subtitle: 'Get status updates for your orders',
      },
      {
        key: 'pushNotifications',
        title: 'Push notifications',
        subtitle: 'Allow app notifications on this device',
      },
      {
        key: 'promoEmails',
        title: 'Promotional emails',
        subtitle: 'Receive offers and product updates',
      },
      {
        key: 'biometricLock',
        title: 'Biometric lock',
        subtitle: 'Require Face ID / fingerprint to open app',
      },
      {
        key: 'showWalletBalance',
        title: 'Show wallet balance',
        subtitle: 'Display wallet amount on profile cards',
      },
    ];

    return (
      <Modal
        visible={showSettingsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Settings</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowSettingsModal(false)}
              >
                <Ionicons name="close" size={24} color={COLORS.darkNavy} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.settingsList} showsVerticalScrollIndicator={false}>
              {settingRows.map((item) => (
                <View key={item.key} style={styles.settingRow}>
                  <View style={styles.settingTextBlock}>
                    <Text style={styles.settingTitle}>{item.title}</Text>
                    <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Switch
                    value={settings[item.key]}
                    onValueChange={(value) =>
                      setSettings((prev) => ({
                        ...prev,
                        [item.key]: value,
                      }))
                    }
                    trackColor={{ false: COLORS.lightGray, true: '#8CCBFF' }}
                    thumbColor={settings[item.key] ? COLORS.primaryBlue : COLORS.white}
                  />
                </View>
              ))}

              <TouchableOpacity
                style={styles.settingActionRow}
                onPress={() => {
                  setShowSettingsModal(false);
                  router.push('/(auth)/forgot-password');
                }}
              >
                <View>
                  <Text style={styles.settingTitle}>Reset password</Text>
                  <Text style={styles.settingSubtitle}>Send reset instructions to your email</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gray} />
              </TouchableOpacity>
            </ScrollView>

            <Button
              title={savingSettings ? 'Saving...' : 'Save Settings'}
              onPress={handleSaveSettings}
              disabled={savingSettings}
              style={styles.modalPrimaryButton}
            />
          </View>
        </View>
      </Modal>
    );
  };

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
          onPress={() => setShowEditProfileModal(true)}
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
            <Text style={styles.statValue}>{walletBalanceDisplay}</Text>
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
      {renderPaymentsModal()}
      {renderEditProfileModal()}
      {renderSettingsModal()}
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
  addPaymentButton: {
    width: '100%',
    marginBottom: SPACING.sm,
  },
  paymentMethodsList: {
    maxHeight: 360,
    marginBottom: SPACING.lg,
  },
  savedPaymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  savedPaymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedPaymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  savedPaymentTitle: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
    fontWeight: FONTS.semibold,
  },
  savedPaymentSubtitle: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  defaultBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  defaultBadgeText: {
    fontSize: FONTS.caption,
    color: COLORS.green,
    fontWeight: FONTS.semibold,
  },
  savedPaymentHint: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.lg,
  },
  paymentsLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    marginBottom: SPACING.md,
  },
  paymentsLoadingText: {
    marginTop: SPACING.sm,
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  profileForm: {
    maxHeight: 380,
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  profileInput: {
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
    backgroundColor: COLORS.white,
  },
  readOnlyInput: {
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
  },
  readOnlyInputText: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
  },
  modalPrimaryButton: {
    width: '100%',
  },
  settingsList: {
    maxHeight: 420,
    marginBottom: SPACING.lg,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
  },
  settingTextBlock: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  settingTitle: {
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
    fontWeight: FONTS.semibold,
  },
  settingSubtitle: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  settingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
});
