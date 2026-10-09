import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../../theme/colors';

export default function ProviderEarningsScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.headerTitle}>Earnings</Text>
        
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance (Demo)</Text>
          <Text style={styles.balanceAmount}>$450.00</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>12</Text>
            <Text style={styles.statLabel}>Jobs Done</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>4.8</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>
        
        <Text style={styles.note}>
          Note: This is demonstration data. Commission calculations and real payouts are pending backend implementation.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 24 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 24 },
  balanceCard: { backgroundColor: colors.primary, padding: 32, borderRadius: 24, alignItems: 'center', marginBottom: 24 },
  balanceLabel: { fontSize: 16, color: colors.text, opacity: 0.8, marginBottom: 8 },
  balanceAmount: { fontSize: 48, fontWeight: '800', color: colors.text },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  statBox: { width: '47%', backgroundColor: colors.surface, padding: 24, borderRadius: 16, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 4 },
  statLabel: { fontSize: 14, color: colors.textMuted },
  note: { textAlign: 'center', color: colors.textMuted, fontSize: 12, lineHeight: 20, marginTop: 'auto' }
});
