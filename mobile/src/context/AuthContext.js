import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/apiClient';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync('token');
      if (!token) {
        setUser(null);
        return;
      }
      const data = await apiClient.get('/auth/me');
      if (data.success && data.user) {
        setUser(data.user);
      } else {
        await SecureStore.deleteItemAsync('token');
        setUser(null);
      }
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        await SecureStore.deleteItemAsync('token');
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const login = async (email, password) => {
    const data = await apiClient.post('/auth/login', { email, password });
    if (data.success && data.token) {
      await SecureStore.setItemAsync('token', data.token);
      setUser(data.user);
    }
    return data;
  };

  const register = async (userData) => {
    const data = await apiClient.post('/auth/register', userData);
    if (data.success && data.token) {
      await SecureStore.setItemAsync('token', data.token);
      setUser(data.user);
    }
    return data;
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (e) {
      // Ignore if logout API fails (e.g. network issue)
    } finally {
      await SecureStore.deleteItemAsync('token');
      setUser(null);
    }
  };

  const isCustomer = user?.role === 'customer';
  const isProvider = user?.role === 'service_provider';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuthStatus, isCustomer, isProvider }}>
      {children}
    </AuthContext.Provider>
  );
};
