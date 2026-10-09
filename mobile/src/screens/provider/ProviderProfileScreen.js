import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AuthContext } from '../../context/AuthContext';
import Button from '../../components/Button';
import colors from '../../theme/colors';
import { User, LogOut } from 'lucide-react-native';

export default function ProviderProfileScreen() {
  const { user, logout } = useContext(AuthContext);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.headerTitle}>Profile</Text>
        
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <User size={40} color={colors.primary} />
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Service Provider</Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />
        
        <Button 
          title="Log Out" 
          onPress={logout} 
          variant="secondary"
          style={styles.logoutBtn}
          textStyle={{ color: colors.error }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 24 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 24 },
  profileCard: { backgroundColor: colors.surface, padding: 32, borderRadius: 24, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  name: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 4 },
  email: { fontSize: 14, color: colors.textMuted, marginBottom: 16 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.primary, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.text },
  logoutBtn: { borderColor: colors.error, borderWidth: 1 }
});
