import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../../context/AuthContext';
import apiClient from '../../api/apiClient';
import colors from '../../theme/colors';
import { LogOut, MapPin, Search, AlertCircle } from 'lucide-react-native';

export default function CustomerHomeScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const categories = [
    { id: 'AC Service', name: 'AC Service', icon: '❄️' },
    { id: 'Plumber', name: 'Plumbing', icon: '🔧' },
    { id: 'Electrician', name: 'Electrical', icon: '⚡' },
    { id: 'Cleaner', name: 'Cleaning', icon: '🧹' },
  ];

  const fetchServices = async (category = '') => {
    try {
      setLoading(true);
      setError(null);
      let endpoint = '/services?limit=10';
      if (category) endpoint += `&category=${category}`;
      if (searchQuery) endpoint += `&search=${searchQuery}`;
      
      const response = await apiClient.get(endpoint);
      if (response.success) {
        setServices(response.services || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch services. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [searchQuery]);

  const handleCategoryPress = (categoryName) => {
    fetchServices(categoryName);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name}</Text>
            <View style={styles.locationContainer}>
              <MapPin size={14} color={colors.textMuted} />
              <Text style={styles.locationText}>{user?.location || 'Select Location'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <LogOut size={20} color={colors.error} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Search size={20} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="What do you need help with?"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <Text style={styles.sectionTitle}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
          {categories.map(cat => (
            <TouchableOpacity 
              key={cat.id} 
              style={styles.catCard}
              onPress={() => handleCategoryPress(cat.id)}
            >
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text style={styles.catTitle}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity 
              style={styles.catCard}
              onPress={() => fetchServices('')}
            >
              <Text style={styles.catIcon}>🌍</Text>
              <Text style={styles.catTitle}>All</Text>
          </TouchableOpacity>
        </ScrollView>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Available Services</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <AlertCircle color={colors.error} size={32} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => fetchServices()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : services.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No services found in your area.</Text>
          </View>
        ) : (
          <FlatList
            data={services}
            keyExtractor={item => item._id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.serviceCard}
                onPress={() => navigation.navigate('ServiceDetails', { service: item })}
              >
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceTitle}>{item.title}</Text>
                  <Text style={styles.serviceProvider}>by {item.provider?.name || 'Unknown'}</Text>
                  <View style={styles.serviceMeta}>
                    <Text style={styles.serviceRating}>⭐ {item.rating} ({item.numReviews})</Text>
                    <Text style={styles.serviceLocation}>• {item.location}</Text>
                  </View>
                </View>
                <View style={styles.servicePriceBox}>
                  <Text style={styles.servicePrice}>${item.price}</Text>
                  <Text style={styles.servicePriceType}>{item.priceType}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 24, paddingBottom: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 4 },
  locationContainer: { flexDirection: 'row', alignItems: 'center' },
  locationText: { fontSize: 14, color: colors.textMuted, marginLeft: 4 },
  logoutBtn: { padding: 8, backgroundColor: colors.surface, borderRadius: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, borderRadius: 12, marginBottom: 24 },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, paddingVertical: 16, fontSize: 16, color: colors.text },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 },
  categoriesScroll: { flexGrow: 0, marginBottom: 8 },
  catCard: { backgroundColor: colors.surface, padding: 16, borderRadius: 16, alignItems: 'center', marginRight: 16, width: 88, elevation: 1 },
  catIcon: { fontSize: 28, marginBottom: 8 },
  catTitle: { fontSize: 12, fontWeight: '600', color: colors.text },
  serviceCard: { flexDirection: 'row', backgroundColor: colors.surface, padding: 16, borderRadius: 16, marginBottom: 16, elevation: 1, alignItems: 'center' },
  serviceInfo: { flex: 1 },
  serviceTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  serviceProvider: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center' },
  serviceRating: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
  serviceLocation: { fontSize: 12, color: colors.textMuted, marginLeft: 8 },
  servicePriceBox: { alignItems: 'flex-end', paddingLeft: 16 },
  servicePrice: { fontSize: 18, fontWeight: '800', color: colors.text },
  servicePriceType: { fontSize: 10, color: colors.textMuted, textTransform: 'capitalize' },
  errorContainer: { alignItems: 'center', marginTop: 32 },
  errorText: { color: colors.error, marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 },
  retryText: { fontWeight: '700', color: colors.text },
  emptyContainer: { alignItems: 'center', marginTop: 32 },
  emptyText: { color: colors.textMuted }
});
