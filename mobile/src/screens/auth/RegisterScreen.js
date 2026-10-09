import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../../context/AuthContext';
import Input from '../../components/Input';
import Button from '../../components/Button';
import colors from '../../theme/colors';

export default function RegisterScreen({ navigation }) {
  const { register } = useContext(AuthContext);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!name || !email || !password) {
      setError('Name, email, and password are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register({ name, email, password, phone, role: 'customer' });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Sign up to request services</Text>
          </View>

          <View style={styles.form}>
            <Input 
              label="Full Name"
              placeholder="e.g. John Doe"
              value={name}
              onChangeText={setName}
            />
            <Input 
              label="Email Address"
              placeholder="e.g. john@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input 
              label="Phone Number (Optional)"
              placeholder="e.g. 9876543210"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Input 
              label="Password"
              placeholder="Create a password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            
            {error ? <Text style={styles.error}>{error}</Text> : null}
            
            <Button 
              title="Sign Up"
              onPress={handleRegister}
              loading={loading}
              style={styles.button}
            />
            
            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Log In</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.noticeContainer}>
              <Text style={styles.noticeText}>
                Note: Service Provider onboarding requires backend phone OTP verification which is currently unsupported. You can only register as a Customer via this app.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  scrollContent: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 32, fontWeight: '800', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 16, color: colors.textMuted },
  form: { backgroundColor: colors.surface, padding: 24, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 15 },
  button: { marginTop: 16 },
  error: { color: colors.error, marginBottom: 16, textAlign: 'center' },
  loginContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  loginText: { color: colors.textMuted, fontSize: 14 },
  loginLink: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  noticeContainer: { marginTop: 24, padding: 16, backgroundColor: colors.background, borderRadius: 8 },
  noticeText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 }
});
