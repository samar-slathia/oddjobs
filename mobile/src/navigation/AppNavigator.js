import React, { useContext } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import CustomerNavigator from './CustomerNavigator';
import ProviderNavigator from './ProviderNavigator';
import colors from '../theme/colors';

export default function AppNavigator() {
  const { user, loading, isCustomer, isProvider } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthNavigator />
      ) : isProvider ? (
        <ProviderNavigator />
      ) : isCustomer ? (
        <CustomerNavigator />
      ) : (
        <AuthNavigator /> // Fallback for unknown roles or admins
      )}
    </NavigationContainer>
  );
}
