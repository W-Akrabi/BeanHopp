import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuthStore } from '../../src/stores/authStore';
import api from '../../src/lib/api';

interface Gift {
  id: string;
  sender_id?: string;
  recipient_email: string;
  amount: number;
  message?: string;
  code: string;
  status: 'pending' | 'redeemed' | 'expired';
  created_at: string;
}

export default function Gifts() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'send' | 'received' | 'sent'>('send');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [sentGifts, setSentGifts] = useState<Gift[]>([]);
  const [receivedGifts, setReceivedGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingGifts, setFetchingGifts] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  const giftAmounts = [5, 10, 15, 25, 50];

  useEffect(() => {
    if (user) {
      fetchGifts();
      fetchWallet();
    }
  }, [user]);

  const fetchGifts = async () => {
    if (!user) return;
    setFetchingGifts(true);
    try {
      const response = await api.get(`/gifts/${user.id}`, {
        params: { user_email: user.email }
      });
      setSentGifts(response.data.sent || []);
      setReceivedGifts(response.data.received || []);
    } catch (error) {
      console.log('Error fetching gifts:', error);
    } finally {
      setFetchingGifts(false);
    }
  };

  const fetchWallet = async () => {
    if (!user) return;
    try {
      const response = await api.get(`/wallet/${user.id}`);
      setWalletBalance(response.data.balance || 0);
    } catch (error) {
      console.log('Error fetching wallet:', error);
    }
  };

  const handleSendGift = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to send gifts');
      return;
    }
    if (!recipientEmail || !selectedAmount) {
      Alert.alert('Missing Info', 'Please enter recipient email and select an amount');
      return;
    }
    if (walletBalance < selectedAmount) {
      Alert.alert('Insufficient Balance', `You need $${selectedAmount} but only have $${walletBalance.toFixed(2)} in your wallet. Please add funds first.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add Funds', onPress: () => router.push('/(tabs)/profile') }
      ]);
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/gifts/send', {
        sender_id: user.id,
        recipient_email: recipientEmail,
        amount: selectedAmount,
        message: message || undefined,
      });

      if (response.data.success) {
        Alert.alert(
          'Gift Sent!',
          `You've sent a $${selectedAmount} gift card to ${recipientEmail}\n\nGift Code: ${response.data.gift_code}`,
          [{ text: 'OK', onPress: () => {
            setRecipientEmail('');
            setMessage('');
            setSelectedAmount(null);
            fetchGifts();
            fetchWallet();
          }}]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send gift');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemGift = async (gift: Gift) => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to redeem gifts');
      return;
    }

    Alert.alert(
      'Redeem Gift',
      `Redeem $${gift.amount.toFixed(2)} gift card to your wallet?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setLoading(true);
            try {
              const response = await api.post('/gifts/redeem', {
                gift_id: gift.id,
                user_id: user.id,
              });

              if (response.data.success) {
                Alert.alert(
                  'Gift Redeemed!',
                  `$${gift.amount.toFixed(2)} has been added to your wallet.\n\nNew Balance: $${response.data.new_wallet_balance.toFixed(2)}`
                );
                fetchGifts();
                fetchWallet();
              }
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to redeem gift');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderSendTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Card style={styles.sendCard} shadow="medium">
        <View style={styles.giftIconContainer}>
          <Ionicons name="gift" size={48} color={COLORS.primaryBlue} />
        </View>
        <Text style={styles.sendTitle}>Send a Coffee Gift</Text>
        <Text style={styles.sendSubtitle}>
          Surprise someone with a coffee gift card
        </Text>

        {/* Wallet Balance */}
        <View style={styles.walletInfo}>
          <Ionicons name="wallet-outline" size={18} color={COLORS.primaryBlue} />
          <Text style={styles.walletText}>
            Wallet Balance: ${walletBalance.toFixed(2)}
          </Text>
        </View>

        {/* Amount Selection */}
        <Text style={styles.inputLabel}>Select Amount</Text>
        <View style={styles.amountGrid}>
          {giftAmounts.map((amount) => (
            <TouchableOpacity
              key={amount}
              style={[
                styles.amountButton,
                selectedAmount === amount && styles.amountButtonActive,
                walletBalance < amount && styles.amountButtonDisabled,
              ]}
              onPress={() => setSelectedAmount(amount)}
              disabled={walletBalance < amount}
            >
              <Text style={[
                styles.amountText,
                selectedAmount === amount && styles.amountTextActive,
                walletBalance < amount && styles.amountTextDisabled,
              ]}>
                ${amount}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recipient Email */}
        <Text style={styles.inputLabel}>Recipient's Email</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color={COLORS.gray} />
          <TextInput
            style={styles.input}
            placeholder="friend@email.com"
            placeholderTextColor={COLORS.gray}
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Message */}
        <Text style={styles.inputLabel}>Add a Message (Optional)</Text>
        <View style={[styles.inputContainer, styles.messageInput]}>
          <TextInput
            style={[styles.input, styles.messageTextInput]}
            placeholder="Write a personal message..."
            placeholderTextColor={COLORS.gray}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={3}
          />
        </View>

        <Button
          title={loading ? 'Sending...' : (selectedAmount ? `Send $${selectedAmount} Gift` : 'Select an Amount')}
          onPress={handleSendGift}
          disabled={!selectedAmount || !recipientEmail || loading}
          style={styles.sendButton}
        />
      </Card>
    </ScrollView>
  );

  const renderGiftsList = (type: 'received' | 'sent') => {
    const gifts = type === 'received' ? receivedGifts : sentGifts;
    
    if (fetchingGifts) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primaryBlue} />
        </View>
      );
    }

    if (gifts.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons
            name={type === 'received' ? 'gift-outline' : 'paper-plane-outline'}
            size={64}
            color={COLORS.lightGray}
          />
          <Text style={styles.emptyTitle}>
            No {type} gifts yet
          </Text>
          <Text style={styles.emptyText}>
            {type === 'received'
              ? 'Gifts you receive will appear here'
              : 'Gifts you send will appear here'}
          </Text>
          {type === 'sent' && (
            <Button
              title="Send Your First Gift"
              onPress={() => setActiveTab('send')}
              style={styles.emptyButton}
            />
          )}
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {gifts.map((gift) => (
          <Card key={gift.id} style={styles.giftCard} shadow="small">
            <View style={styles.giftHeader}>
              <View style={styles.giftIconSmall}>
                <Ionicons name="gift" size={24} color={COLORS.primaryBlue} />
              </View>
              <View style={styles.giftInfo}>
                <Text style={styles.giftAmount}>${gift.amount.toFixed(2)}</Text>
                <Text style={styles.giftPerson}>
                  {type === 'received' ? 'Gift Card' : `To: ${gift.recipient_email}`}
                </Text>
                <Text style={styles.giftDate}>{formatDate(gift.created_at)}</Text>
              </View>
              <View style={[
                styles.giftStatusBadge,
                { backgroundColor: gift.status === 'pending' ? '#E8F5E9' : '#F5F5F5' }
              ]}>
                <Text style={[
                  styles.giftStatusText,
                  { color: gift.status === 'pending' ? COLORS.green : COLORS.gray }
                ]}>
                  {gift.status.charAt(0).toUpperCase() + gift.status.slice(1)}
                </Text>
              </View>
            </View>
            
            {gift.message && (
              <Text style={styles.giftMessage}>"{gift.message}"</Text>
            )}
            
            <View style={styles.giftCodeContainer}>
              <Text style={styles.giftCodeLabel}>Code:</Text>
              <Text style={styles.giftCode}>{gift.code}</Text>
            </View>
            
            {type === 'received' && gift.status === 'pending' && (
              <Button
                title={loading ? 'Redeeming...' : 'Redeem to Wallet'}
                onPress={() => handleRedeemGift(gift)}
                disabled={loading}
                size="small"
                style={styles.redeemButton}
              />
            )}
          </Card>
        ))}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gifts</Text>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={fetchGifts}
        >
          <Ionicons name="refresh-outline" size={20} color={COLORS.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'send' && styles.tabActive]}
          onPress={() => setActiveTab('send')}
        >
          <Text style={[styles.tabText, activeTab === 'send' && styles.tabTextActive]}>
            Send
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.tabActive]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabText, activeTab === 'received' && styles.tabTextActive]}>
            Received
          </Text>
          {receivedGifts.filter(g => g.status === 'pending').length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>
                {receivedGifts.filter(g => g.status === 'pending').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
            Sent
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'send' && renderSendTab()}
      {activeTab === 'received' && renderGiftsList('received')}
      {activeTab === 'sent' && renderGiftsList('sent')}
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
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primaryBlue,
  },
  tabText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.medium,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primaryBlue,
  },
  tabBadge: {
    backgroundColor: COLORS.red,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },
  tabBadgeText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.xxl * 2,
  },
  sendCard: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  giftIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  sendTitle: {
    fontSize: FONTS.h3,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.xs,
  },
  sendSubtitle: {
    fontSize: FONTS.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.lg,
  },
  walletText: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.medium,
    color: COLORS.primaryBlue,
    marginLeft: SPACING.xs,
  },
  inputLabel: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.medium,
    color: COLORS.darkNavy,
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    width: '100%',
  },
  amountButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  amountButtonActive: {
    borderColor: COLORS.primaryBlue,
    backgroundColor: '#E3F2FD',
  },
  amountButtonDisabled: {
    opacity: 0.5,
  },
  amountText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  amountTextActive: {
    color: COLORS.primaryBlue,
  },
  amountTextDisabled: {
    color: COLORS.gray,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    width: '100%',
  },
  input: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingLeft: SPACING.sm,
    fontSize: FONTS.body,
    color: COLORS.darkNavy,
  },
  messageInput: {
    alignItems: 'flex-start',
  },
  messageTextInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: '100%',
    marginTop: SPACING.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.xxl * 2,
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
  emptyButton: {
    marginTop: SPACING.lg,
  },
  giftCard: {
    marginBottom: SPACING.md,
  },
  giftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  giftIconSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  giftInfo: {
    flex: 1,
  },
  giftAmount: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  giftPerson: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  giftDate: {
    fontSize: FONTS.caption,
    color: COLORS.gray,
  },
  giftStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  giftStatusText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.semibold,
  },
  giftMessage: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
    paddingLeft: 60,
  },
  giftCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingLeft: 60,
  },
  giftCodeLabel: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  giftCode: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.bold,
    color: COLORS.primaryBlue,
    fontFamily: 'monospace',
  },
  redeemButton: {
    marginTop: SPACING.md,
    marginLeft: 60,
  },
});
