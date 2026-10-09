import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ProviderHomeScreen from '../screens/provider/ProviderHomeScreen';
import ProviderJobsScreen from '../screens/provider/ProviderJobsScreen';
import ProviderEarningsScreen from '../screens/provider/ProviderEarningsScreen';
import ProviderProfileScreen from '../screens/provider/ProviderProfileScreen';
import { Home, Briefcase, DollarSign, User } from 'lucide-react-native';
import colors from '../theme/colors';

const Tab = createBottomTabNavigator();

export default function ProviderNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Home') return <Home color={color} size={size} />;
          if (route.name === 'Jobs') return <Briefcase color={color} size={size} />;
          if (route.name === 'Earnings') return <DollarSign color={color} size={size} />;
          if (route.name === 'Profile') return <User color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={ProviderHomeScreen} />
      <Tab.Screen name="Jobs" component={ProviderJobsScreen} />
      <Tab.Screen name="Earnings" component={ProviderEarningsScreen} />
      <Tab.Screen name="Profile" component={ProviderProfileScreen} />
    </Tab.Navigator>
  );
}
