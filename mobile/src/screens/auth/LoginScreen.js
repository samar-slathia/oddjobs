import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../../context/AuthContext';
import Input from '../../components/Input';
import Button from '../../components/Button';
import colors from '../../theme/colors';
import { LogIn } from 'lucide-react-native';

export default function LoginScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials and network connection.');
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
            <View style={styles.logoContainer}>
              <LogIn color={colors.text} size={32} />
            </View>
            <Text style={styles.title}>OddKar</Text>
            <Text style={styles.subtitle}>Enter your details to proceed</Text>
          </View>

          <View style={styles.form}>
            <Input 
              label="Email Address"
              placeholder="e.g. john@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input 
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            
            {error ? <Text style={styles.error}>{error}</Text> : null}
            
            <Button 
              title="Log In"
              onPress={handleLogin}
              loading={loading}
              style={styles.button}
            />
            
            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.registerLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.footerText}>
              For this phase, please use existing demonstration accounts.
            </Text>
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
  header: { alignItems: 'center', marginBottom: 40 },
  logoContainer: { 
    width: 64, height: 64, borderRadius: 32, 
    backgroundColor: colors.primary, 
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16
  },
  title: { fontSize: 32, fontWeight: '800', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 16, color: colors.textMuted },
  form: { backgroundColor: colors.surface, padding: 24, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 15 },
  button: { marginTop: 16 },
  error: { color: colors.error, marginBottom: 16, textAlign: 'center' },
  registerContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  registerText: { color: colors.textMuted, fontSize: 14 },
  registerLink: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  footerText: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 24 }
});
