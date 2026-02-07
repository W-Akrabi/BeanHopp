import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../src/components';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { useAuthStore } from '../../src/stores/authStore';
import api from '../../src/lib/api';

interface LoyaltyLevel {
  name: string;
  minPoints: number;
  maxPoints: number;
  color: string;
  bgColor: string;
  perks: string[];
}

interface RewardVoucher {
  id: string;
  reward_type: string;
  code: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface RewardOption {
  type: string;
  title: string;
  points: number;
  icon: string;
  color: string;
}

const LOYALTY_LEVELS: LoyaltyLevel[] = [
  {
    name: 'Bronze',
    minPoints: 0,
    maxPoints: 99,
    color: '#CD7F32',
    bgColor: '#FFF8DC',
    perks: ['1 point per $1 spent', 'Birthday bonus'],
  },
  {
    name: 'Silver',
    minPoints: 100,
    maxPoints: 499,
    color: '#C0C0C0',
    bgColor: '#F5F5F5',
    perks: ['1.25x points', 'Free size upgrade', 'Early access to promotions'],
  },
  {
    name: 'Gold',
    minPoints: 500,
    maxPoints: 1999,
    color: '#FFD700',
    bgColor: '#FFFACD',
    perks: ['1.5x points', 'Free drink monthly', 'Priority pickup', 'Exclusive offers'],
  },
  {
    name: 'Platinum',
    minPoints: 2000,
    maxPoints: Infinity,
    color: '#E5E4E2',
    bgColor: '#F0F0F0',
    perks: ['2x points', 'Free drink weekly', 'VIP events', 'Concierge service', 'Free delivery'],
  },
];

const REWARD_OPTIONS: RewardOption[] = [
  { type: 'free_drink', title: 'Free Drink', points: 500, icon: 'cafe', color: COLORS.primaryBlue },
  { type: 'size_upgrade', title: 'Size Upgrade', points: 100, icon: 'resize', color: COLORS.green },
  { type: 'free_pastry', title: 'Free Pastry', points: 300, icon: 'pizza', color: COLORS.orange },
];

export default function Rewards() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const scrollRef = useRef<ScrollView>(null);
  
  const [totalPoints, setTotalPoints] = useState(0);
  const [showLevelDetails, setShowLevelDetails] = useState(false);
  const [showVouchersModal, setShowVouchersModal] = useState(false);
  const [vouchers, setVouchers] = useState<RewardVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [redeemSectionY, setRedeemSectionY] = useState(0);
  const [streak] = useState({
    current: 3,
    target: 5,
    days: [true, true, true, false, false, false, false],
  });

  useEffect(() => {
    if (user) {
      fetchLoyaltyData();
      fetchVouchers();
    }
  }, [user]);

  const fetchLoyaltyData = async () => {
    try {
      const response = await api.get(`/loyalty/${user?.id}/points`);
      setTotalPoints(response.data.total_points || 0);
    } catch {
      console.log('Using mock data');
    }
  };

  const fetchVouchers = async () => {
    try {
      const response = await api.get(`/rewards/${user?.id}/vouchers`);
      setVouchers(response.data || []);
    } catch (error) {
      console.log('Error fetching vouchers:', error);
    }
  };

  const handleRedeemReward = async (reward: RewardOption) => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to redeem rewards');
      return;
    }

    if (totalPoints < reward.points) {
      Alert.alert(
        'Insufficient Beans',
        `You need ${reward.points} beans but only have ${totalPoints}. Keep ordering to earn more!`
      );
      return;
    }

    Alert.alert(
      'Redeem Reward',
      `Redeem ${reward.title} for ${reward.points} beans?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setLoading(true);
            try {
              const response = await api.post('/rewards/redeem', {
                user_id: user.id,
                reward_type: reward.type,
                points_cost: reward.points,
              });

              if (response.data.success) {
                Alert.alert(
                  'Reward Redeemed!',
                  `Your ${reward.title} voucher is ready!\n\nVoucher Code: ${response.data.voucher_code}\n\nRemaining Beans: ${response.data.remaining_points}`,
                  [{ text: 'OK', onPress: () => {
                    setTotalPoints(response.data.remaining_points);
                    fetchVouchers();
                  }}]
                );
              }
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to redeem reward');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const getCurrentLevel = () => {
    return LOYALTY_LEVELS.find(
      (level) => totalPoints >= level.minPoints && totalPoints <= level.maxPoints
    ) || LOYALTY_LEVELS[0];
  };

  const getNextLevel = () => {
    const currentIndex = LOYALTY_LEVELS.findIndex(
      (level) => totalPoints >= level.minPoints && totalPoints <= level.maxPoints
    );
    return currentIndex < LOYALTY_LEVELS.length - 1
      ? LOYALTY_LEVELS[currentIndex + 1]
      : null;
  };

  const getProgressToNextLevel = () => {
    const currentLevel = getCurrentLevel();
    const nextLevel = getNextLevel();
    if (!nextLevel) return 100;
    
    const pointsInCurrentLevel = totalPoints - currentLevel.minPoints;
    const pointsNeededForNext = nextLevel.minPoints - currentLevel.minPoints;
    return (pointsInCurrentLevel / pointsNeededForNext) * 100;
  };

  const currentLevel = getCurrentLevel();
  const nextLevel = getNextLevel();
  const progress = getProgressToNextLevel();
  const pointsToNext = nextLevel ? nextLevel.minPoints - totalPoints : 0;
  const shareText = `I am currently ${currentLevel.name} level on BeanHop with ${totalPoints} beans.`;

  const handleShareRewards = async () => {
    try {
      await Share.share({
        title: 'BeanHop Rewards',
        message: shareText,
      });
    } catch {
      Alert.alert('Share Unavailable', 'Could not open share options right now.');
    }
  };

  const scrollToRedeemSection = () => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, redeemSectionY - SPACING.md),
      animated: true,
    });
  };

  const renderLevelDetailsModal = () => (
    <Modal
      visible={showLevelDetails}
      animationType="slide"
      transparent
      onRequestClose={() => setShowLevelDetails(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Loyalty Levels</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowLevelDetails(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.darkNavy} />
            </TouchableOpacity>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false}>
            {LOYALTY_LEVELS.map((level, index) => (
              <View
                key={level.name}
                style={[
                  styles.levelModalCard,
                  { backgroundColor: level.bgColor },
                  currentLevel.name === level.name && styles.levelCardCurrent,
                ]}
              >
                <View style={styles.levelHeader}>
                  <View style={[styles.levelBadge, { backgroundColor: level.color }]}>
                    <Ionicons name="trophy" size={20} color={COLORS.white} />
                  </View>
                  <View style={styles.levelInfo}>
                    <Text style={styles.levelName}>{level.name}</Text>
                    <Text style={styles.levelRange}>
                      {level.maxPoints === Infinity
                        ? `${level.minPoints}+ points`
                        : `${level.minPoints} - ${level.maxPoints} points`}
                    </Text>
                  </View>
                  {currentLevel.name === level.name && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  )}
                </View>
                <View style={styles.perksContainer}>
                  {level.perks.map((perk, perkIndex) => (
                    <View key={perkIndex} style={styles.perkItem}>
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.green} />
                      <Text style={styles.perkText}>{perk}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Rewards</Text>
            <Text style={styles.headerSubtitle}>Earn beans and unlock better perks</Text>
          </View>
          <TouchableOpacity style={styles.shareButton} onPress={handleShareRewards}>
            <Ionicons name="share-outline" size={18} color={COLORS.primaryBlue} />
            <Text style={styles.shareText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Level Card */}
        <Card 
          style={[styles.levelSummaryCard, { backgroundColor: currentLevel.bgColor }]} 
          shadow="medium"
        >
          <View style={styles.levelCardHeader}>
            <View style={styles.levelCardLeft}>
              <View style={[styles.levelIconLarge, { backgroundColor: currentLevel.color }]}>
                <Ionicons name="trophy" size={28} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.levelCardTitle}>{currentLevel.name} level</Text>
                {nextLevel && (
                  <Text style={styles.levelCardSubtitle}>
                    {pointsToNext} pts to {nextLevel.name}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={styles.detailsButton}
              onPress={() => setShowLevelDetails(true)}
            >
              <Text style={styles.detailsText}>Details</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primaryBlue} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: currentLevel.color,
                  },
                ]}
              />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>{totalPoints} pts</Text>
              {nextLevel && (
                <Text style={styles.progressLabel}>{nextLevel.minPoints} pts</Text>
              )}
            </View>
          </View>

          {/* Current Perks */}
          <View style={styles.currentPerks}>
            <Text style={styles.perksTitle}>Your perks:</Text>
            <View style={styles.perksRow}>
              {currentLevel.perks.slice(0, 2).map((perk, index) => (
                <View key={index} style={styles.perkBadge}>
                  <Text style={styles.perkBadgeText}>{perk}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        {/* Beans Card */}
        <Card style={styles.beansCard} shadow="small">
          <View style={styles.beansHeader}>
            <View>
              <Text style={styles.beansTitle}>Beans</Text>
              <Text style={styles.beansSubtitle}>Earn and redeem bonus points</Text>
            </View>
            <TouchableOpacity style={styles.moreButton} onPress={() => setShowVouchersModal(true)}>
              <Text style={styles.moreText}>History</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.primaryBlue} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.beansCount}>
            <Text style={styles.beansNumber}>{totalPoints}</Text>
            <View style={styles.beanIcon}>
              <Ionicons name="cafe" size={24} color={COLORS.white} />
            </View>
          </View>

          <View style={styles.beansActions}>
            <TouchableOpacity style={styles.beansAction} onPress={scrollToRedeemSection}>
              <Ionicons name="gift-outline" size={20} color={COLORS.primaryBlue} />
              <Text style={styles.beansActionText}>Redeem</Text>
            </TouchableOpacity>
            <View style={styles.beansActionDivider} />
            <TouchableOpacity style={styles.beansAction} onPress={() => router.push('/(tabs)/home')}>
              <Ionicons name="card-outline" size={20} color={COLORS.primaryBlue} />
              <Text style={styles.beansActionText}>Earn More</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Streak Card */}
        <Card style={styles.streakCard} shadow="small">
          <View style={styles.streakHeader}>
            <View>
              <Text style={styles.streakTitle}>Daily Streak</Text>
              <Text style={styles.streakSubtitle}>
                {streak.current}/{streak.target} days - Earn 50% more beans!
              </Text>
            </View>
            <View style={styles.streakCountBadge}>
              <Ionicons name="flame" size={18} color={COLORS.orange} />
              <Text style={styles.streakCountText}>{streak.current}</Text>
            </View>
          </View>
          
          <View style={styles.streakDays}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <View key={index} style={styles.streakDayContainer}>
                <View style={[
                  styles.streakDay,
                  streak.days[index] ? styles.streakDayActive : styles.streakDayInactive,
                  index === streak.current && styles.streakDayCurrent,
                ]}>
                  <Ionicons 
                    name={streak.days[index] ? 'flame' : 'flame-outline'} 
                    size={20} 
                    color={streak.days[index] ? COLORS.white : COLORS.lightGray} 
                  />
                </View>
                <Text style={[
                  styles.streakDayLabel,
                  streak.days[index] && styles.streakDayLabelActive,
                ]}>
                  {day}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.streakProgress}>
            <View style={styles.streakProgressBar}>
              <View 
                style={[
                  styles.streakProgressFill, 
                  { width: `${(streak.current / streak.target) * 100}%` }
                ]} 
              />
            </View>
            <Text style={styles.streakProgressText}>
              {streak.target - streak.current} more days to bonus!
            </Text>
          </View>
        </Card>

        {/* Rewards to Redeem */}
        <View
          style={styles.redeemSection}
          onLayout={(event) => {
            setRedeemSectionY(event.nativeEvent.layout.y);
          }}
        >
          <View style={styles.redeemHeader}>
            <Text style={styles.sectionTitle}>Redeem your beans</Text>
            <TouchableOpacity 
              style={styles.myVouchersButton}
              onPress={() => setShowVouchersModal(true)}
            >
              <Text style={styles.myVouchersText}>My Vouchers ({vouchers.length})</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.primaryBlue} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.redeemScrollContent}
          >
            {REWARD_OPTIONS.map((reward) => (
              <TouchableOpacity 
                key={reward.type}
                style={[
                  styles.redeemCard,
                  totalPoints < reward.points && styles.redeemCardDisabled,
                ]}
                onPress={() => handleRedeemReward(reward)}
                disabled={loading || totalPoints < reward.points}
              >
                <View style={[styles.redeemIcon, { backgroundColor: `${reward.color}20` }]}>
                  <Ionicons name={reward.icon as any} size={24} color={reward.color} />
                </View>
                <Text style={styles.redeemTitle}>{reward.title}</Text>
                <Text style={[
                  styles.redeemPoints,
                  totalPoints < reward.points && styles.redeemPointsDisabled,
                ]}>
                  {reward.points} beans
                </Text>
                {totalPoints >= reward.points && (
                  <View style={styles.redeemBadge}>
                    <Text style={styles.redeemBadgeText}>Available</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* How it Works */}
        <View style={styles.howItWorks}>
          <Text style={styles.howItWorksTitle}>How it works</Text>
          
          <View style={styles.howItWorksItem}>
            <View style={[styles.howItWorksIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="cafe-outline" size={24} color={COLORS.primaryBlue} />
            </View>
            <View style={styles.howItWorksContent}>
              <Text style={styles.howItWorksItemTitle}>Earn Beans</Text>
              <Text style={styles.howItWorksItemText}>
                Get 1 bean for every $1 spent on orders
              </Text>
            </View>
          </View>
          
          <View style={styles.howItWorksItem}>
            <View style={[styles.howItWorksIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="trending-up-outline" size={24} color={COLORS.green} />
            </View>
            <View style={styles.howItWorksContent}>
              <Text style={styles.howItWorksItemTitle}>Level Up</Text>
              <Text style={styles.howItWorksItemText}>
                Reach higher levels for multiplied earnings
              </Text>
            </View>
          </View>
          
          <View style={styles.howItWorksItem}>
            <View style={[styles.howItWorksIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="flame-outline" size={24} color={COLORS.orange} />
            </View>
            <View style={styles.howItWorksContent}>
              <Text style={styles.howItWorksItemTitle}>Build Streaks</Text>
              <Text style={styles.howItWorksItemText}>
                Order 5 days in a row for 50% bonus beans
              </Text>
            </View>
          </View>
          
          <View style={styles.howItWorksItem}>
            <View style={[styles.howItWorksIcon, { backgroundColor: '#FCE4EC' }]}>
              <Ionicons name="gift-outline" size={24} color={COLORS.red} />
            </View>
            <View style={styles.howItWorksContent}>
              <Text style={styles.howItWorksItemTitle}>Redeem Rewards</Text>
              <Text style={styles.howItWorksItemText}>
                Exchange beans for free drinks and more
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {renderLevelDetailsModal()}
      
      {/* Vouchers Modal */}
      <Modal
        visible={showVouchersModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVouchersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>My Vouchers</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowVouchersModal(false)}
              >
                <Ionicons name="close" size={24} color={COLORS.darkNavy} />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {vouchers.length > 0 ? (
                vouchers.map((voucher) => (
                  <View key={voucher.id} style={styles.voucherCard}>
                    <View style={styles.voucherIcon}>
                      <Ionicons 
                        name={
                          voucher.reward_type === 'free_drink' ? 'cafe' :
                          voucher.reward_type === 'size_upgrade' ? 'resize' : 'pizza'
                        } 
                        size={24} 
                        color={COLORS.primaryBlue} 
                      />
                    </View>
                    <View style={styles.voucherInfo}>
                      <Text style={styles.voucherTitle}>
                        {voucher.reward_type === 'free_drink' ? 'Free Drink' :
                         voucher.reward_type === 'size_upgrade' ? 'Size Upgrade' : 'Free Pastry'}
                      </Text>
                      <Text style={styles.voucherCode}>{voucher.code}</Text>
                      <Text style={styles.voucherExpiry}>
                        Expires: {new Date(voucher.expires_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.voucherStatus}>
                      <Text style={styles.voucherStatusText}>Active</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyVouchers}>
                  <Ionicons name="ticket-outline" size={48} color={COLORS.lightGray} />
                  <Text style={styles.emptyVouchersText}>No vouchers yet</Text>
                  <Text style={styles.emptyVouchersSubtext}>Redeem your beans to get vouchers!</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONTS.h2,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  shareText: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.medium,
    color: COLORS.primaryBlue,
    marginLeft: 4,
  },
  levelSummaryCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  levelCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  levelCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelIconLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  levelCardTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  levelCardSubtitle: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  detailsText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
  },
  progressSection: {
    marginBottom: SPACING.md,
  },
  progressBar: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primaryBlue,
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  progressLabel: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
  },
  currentPerks: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingTop: SPACING.md,
  },
  perksTitle: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.medium,
    color: COLORS.darkNavy,
    marginBottom: SPACING.sm,
  },
  perksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  perkBadge: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  perkBadgeText: {
    fontSize: FONTS.caption,
    color: COLORS.darkNavy,
  },
  beansCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  beansHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  beansTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  beansSubtitle: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  moreButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moreText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
  },
  beansCount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  beansNumber: {
    fontSize: 48,
    fontWeight: FONTS.bold,
    color: COLORS.primaryBlue,
    marginRight: SPACING.sm,
  },
  beanIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beansActions: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
    paddingTop: SPACING.md,
  },
  beansAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
  },
  beansActionDivider: {
    width: 1,
    backgroundColor: COLORS.lightGray,
    marginVertical: 2,
  },
  beansActionText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
    marginLeft: SPACING.xs,
  },
  streakCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  streakTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  streakSubtitle: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
  },
  streakCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  streakCountText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.bold,
    color: COLORS.orange,
    marginLeft: 4,
  },
  streakDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  streakDayContainer: {
    alignItems: 'center',
  },
  streakDay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  streakDayActive: {
    backgroundColor: COLORS.orange,
  },
  streakDayInactive: {
    backgroundColor: COLORS.background,
  },
  streakDayCurrent: {
    borderWidth: 2,
    borderColor: COLORS.orange,
  },
  streakDayLabel: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
  },
  streakDayLabelActive: {
    color: COLORS.orange,
    fontWeight: FONTS.bold,
  },
  streakProgress: {
    alignItems: 'center',
  },
  streakProgressBar: {
    width: '100%',
    height: 6,
    backgroundColor: COLORS.background,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  streakProgressFill: {
    height: '100%',
    backgroundColor: COLORS.orange,
    borderRadius: 3,
  },
  streakProgressText: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
  },
  redeemSection: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  redeemScrollContent: {
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  redeemCard: {
    width: 136,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginRight: SPACING.sm,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  redeemIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  redeemTitle: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  redeemPoints: {
    fontSize: FONTS.caption,
    color: COLORS.primaryBlue,
    marginTop: 2,
  },
  howItWorks: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  howItWorksTitle: {
    fontSize: FONTS.h4,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
    marginBottom: SPACING.md,
  },
  howItWorksItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
  },
  howItWorksIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  howItWorksContent: {
    flex: 1,
  },
  howItWorksItemTitle: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  howItWorksItemText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
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
    paddingBottom: SPACING.xl,
  },
  levelModalCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
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
  levelCardCurrent: {
    borderWidth: 2,
    borderColor: COLORS.primaryBlue,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  levelBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  levelInfo: {
    flex: 1,
  },
  levelName: {
    fontSize: FONTS.body,
    fontWeight: FONTS.bold,
    color: COLORS.darkNavy,
  },
  levelRange: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
  },
  currentBadge: {
    backgroundColor: COLORS.primaryBlue,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  currentBadgeText: {
    fontSize: FONTS.caption,
    color: COLORS.white,
    fontWeight: FONTS.bold,
  },
  perksContainer: {
    marginLeft: 52,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  perkText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.darkNavy,
    marginLeft: SPACING.xs,
  },
  // Redeem section additional styles
  redeemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  myVouchersButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myVouchersText: {
    fontSize: FONTS.bodySmall,
    color: COLORS.primaryBlue,
    fontWeight: FONTS.medium,
  },
  redeemCardDisabled: {
    opacity: 0.5,
  },
  redeemPointsDisabled: {
    color: COLORS.gray,
  },
  redeemBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    marginTop: SPACING.xs,
  },
  redeemBadgeText: {
    fontSize: FONTS.caption,
    color: COLORS.green,
    fontWeight: FONTS.medium,
  },
  // Voucher styles
  voucherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  voucherIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  voucherInfo: {
    flex: 1,
  },
  voucherTitle: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
  },
  voucherCode: {
    fontSize: FONTS.bodySmall,
    fontWeight: FONTS.bold,
    color: COLORS.primaryBlue,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  voucherExpiry: {
    fontSize: FONTS.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  voucherStatus: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  voucherStatusText: {
    fontSize: FONTS.caption,
    fontWeight: FONTS.medium,
    color: COLORS.green,
  },
  emptyVouchers: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyVouchersText: {
    fontSize: FONTS.body,
    fontWeight: FONTS.semibold,
    color: COLORS.darkNavy,
    marginTop: SPACING.md,
  },
  emptyVouchersSubtext: {
    fontSize: FONTS.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
});
