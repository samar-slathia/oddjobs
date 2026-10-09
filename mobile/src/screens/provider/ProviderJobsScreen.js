import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import colors from '../../theme/colors';

export default function ProviderJobsScreen() {
  const jobs = [
    { id: '1', title: 'AC Repair', status: 'Completed', date: 'Today, 10:00 AM', amount: '$45' },
    { id: '2', title: 'Plumbing Fix', status: 'Completed', date: 'Yesterday, 2:00 PM', amount: '$60' }
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.headerTitle}>My Jobs</Text>
        <FlatList 
          data={jobs}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingVertical: 16 }}
          renderItem={({ item }) => (
            <View style={styles.jobCard}>
              <View style={styles.jobInfo}>
                <Text style={styles.jobTitle}>{item.title}</Text>
                <Text style={styles.jobDate}>{item.date}</Text>
                <Text style={styles.jobStatus}>{item.status}</Text>
              </View>
              <Text style={styles.jobAmount}>{item.amount}</Text>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 16 },
  jobCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, padding: 16, borderRadius: 16, marginBottom: 16, elevation: 1 },
  jobInfo: { flex: 1 },
  jobTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  jobDate: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  jobStatus: { fontSize: 12, fontWeight: '600', color: colors.success },
  jobAmount: { fontSize: 18, fontWeight: '800', color: colors.text }
});
