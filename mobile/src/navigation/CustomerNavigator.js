import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CustomerHomeScreen from '../screens/customer/CustomerHomeScreen';
import ServiceDetailsScreen from '../screens/customer/ServiceDetailsScreen';

const Stack = createNativeStackNavigator();

export default function CustomerNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={CustomerHomeScreen} />
      <Stack.Screen name="ServiceDetails" component={ServiceDetailsScreen} />
    </Stack.Navigator>
  );
}
