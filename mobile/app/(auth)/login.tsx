import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

type Mode = 'signIn' | 'signUp';

export default function LoginScreen() {
  const [mode,     setMode]     = useState<Mode>('signIn');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Fill in both fields');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    if (mode === 'signIn') {
      const { error } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      });
      setLoading(false);
      if (error) {
        console.error('[signIn]', error.message);
        Alert.alert('Sign in failed', error.message);
      }
      // Success → onAuthStateChange in _layout.tsx handles navigation automatically.
    } else {
      const { data, error } = await supabase.auth.signUp({
        email:    email.trim().toLowerCase(),
        password,
      });
      setLoading(false);
      if (error) {
        console.error('[signUp]', error.message);
        Alert.alert('Sign up failed', error.message);
      } else if (!data.session) {
        // Email confirmation is ON in Supabase — user must click the link first.
        Alert.alert(
          'Check your email',
          'We sent a confirmation link to ' + email.trim() +
          '.\n\nClick it, then come back and Sign In.\n\n' +
          'Tip: disable "Confirm email" in Supabase → Auth → Providers → Email to skip this.'
        );
      }
      // If session exists (confirm email OFF) → onAuthStateChange navigates automatically.
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Text style={styles.logoEmoji}>🛒</Text>
          <Text style={styles.logoText}>Gebya</Text>
          <Text style={styles.tagline}>ጉርሻ ዋጋ — Community prices</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'signIn' && styles.toggleActive]}
            onPress={() => setMode('signIn')}
          >
            <Text style={[styles.toggleText, mode === 'signIn' && styles.toggleTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'signUp' && styles.toggleActive]}
            onPress={() => setMode('signUp')}
          >
            <Text style={[styles.toggleText, mode === 'signUp' && styles.toggleTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Inputs */}
        <TextInput
          style={styles.input}
          placeholder="your@email.com"
          placeholderTextColor={Colors.t4}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 6 chars)"
          placeholderTextColor={Colors.t4}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={submit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={Colors.bg} />
            : <Text style={styles.btnText}>
                {mode === 'signIn' ? 'Sign In →' : 'Create Account →'}
              </Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          {mode === 'signIn'
            ? "Don't have an account? Tap Create Account above."
            : 'Already have an account? Tap Sign In above.'}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    flex: 1,
    padding: 28,
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.t1,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 13,
    color: Colors.t4,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.s2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: Colors.veggie,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.t3,
  },
  toggleTextActive: {
    color: Colors.bg,
  },
  input: {
    backgroundColor: Colors.s2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    fontSize: 16,
    color: Colors.t1,
    marginBottom: 14,
  },
  btn: {
    backgroundColor: Colors.veggie,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.bg,
  },
  hint: {
    fontSize: 12,
    color: Colors.t4,
    textAlign: 'center',
    lineHeight: 18,
  },
});
