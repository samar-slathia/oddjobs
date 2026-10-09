import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, User, Star } from 'lucide-react-native';
import colors from '../../theme/colors';
import Button from '../../components/Button';

export default function ServiceDetailsScreen({ route, navigation }) {
  const { service } = route.params;

  const handleBook = () => {
    Alert.alert(
      "Booking Flow Paused",
      "The current backend requires booking a specific provider. The new Rapido-inspired architecture (Category-based booking with atomic provider dispatch) is being designed and will be implemented in the next phase.",
      [{ text: "Understood", style: "cancel" }]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        <Text style={styles.title}>{service.title}</Text>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{service.category}</Text>
        </View>

        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{service.description}</Text>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <MapPin size={20} color={colors.primaryDark} />
          </View>
          <View>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>{service.location}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <User size={20} color={colors.primaryDark} />
          </View>
          <View>
            <Text style={styles.infoLabel}>Provider</Text>
            <Text style={styles.infoValue}>{service.provider?.name || 'Unknown'}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <Star size={20} color={colors.primaryDark} />
          </View>
          <View>
            <Text style={styles.infoLabel}>Rating</Text>
            <Text style={styles.infoValue}>{service.rating} ({service.numReviews} reviews)</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Price</Text>
          <Text style={styles.priceValue}>${service.price} <Text style={styles.priceType}>/{service.priceType}</Text></Text>
        </View>
        <Button 
          title="Book Now" 
          onPress={handleBook} 
          style={styles.bookBtn} 
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: colors.surface },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  container: { flex: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: 12 },
  categoryBadge: { alignSelf: 'flex-start', backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginBottom: 24 },
  categoryText: { color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
  description: { fontSize: 15, color: colors.textMuted, lineHeight: 24, marginBottom: 24 },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: 24 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  infoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  infoLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 16, fontWeight: '600', color: colors.text },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, flexDirection: 'row', padding: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center', justifyContent: 'space-between' },
  priceContainer: { flex: 1 },
  priceLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  priceValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  priceType: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  bookBtn: { flex: 1, marginLeft: 24, paddingVertical: 14 }
});
