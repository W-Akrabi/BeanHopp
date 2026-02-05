import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { COLORS } from '../src/constants/theme';

export default function Index() {
  const router = useRouter();
  const { isInitialized, user } = useAuthStore();

  useEffect(() => {
    if (isInitialized) {
      if (user) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(auth)/onboarding');
      }
    }
  }, [isInitialized, user]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primaryBlue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
