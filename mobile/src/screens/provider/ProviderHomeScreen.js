import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useContext } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { AuthContext } from '../../context/AuthContext';
import colors from '../../theme/colors';
import { Bell } from 'lucide-react-native';

export default function ProviderHomeScreen() {
  const { user } = useContext(AuthContext);
  const [isOnline, setIsOnline] = React.useState(true);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hi, {user?.name}</Text>
            <Text style={styles.subtitle}>Ready for your next job?</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn}>
            <Bell size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.statusCard, { backgroundColor: isOnline ? colors.success : colors.textMuted }]}>
          <Text style={styles.statusText}>{isOnline ? "You're Online" : "You're Offline"}</Text>
          <Switch 
            value={isOnline} 
            onValueChange={setIsOnline}
            trackColor={{ false: '#767577', true: '#fff' }}
            thumbColor={isOnline ? colors.success : '#f4f3f4'}
          />
        </View>

        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No incoming requests</Text>
          <Text style={styles.emptySub}>When a customer requests a service, it will appear here.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  greeting: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 16, color: colors.textMuted },
  iconBtn: { padding: 12, backgroundColor: colors.surface, borderRadius: 12 },
  statusCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 16, marginBottom: 32 },
  statusText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 32 }
});
