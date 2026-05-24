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

export default function LoginScreen() {
  const [email,     setEmail]     = useState('');
  const [sent,      setSent]      = useState(false);
  const [loading,   setLoading]   = useState(false);

  const sendMagicLink = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email first');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSent(true);
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

        {!sent ? (
          <>
            <Text style={styles.label}>Sign in / Create account</Text>
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
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={sendMagicLink}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={Colors.bg} />
                : <Text style={styles.btnText}>Send Magic Link ✉️</Text>}
            </TouchableOpacity>
            <Text style={styles.hint}>
              We'll email you a one-tap sign-in link. No password needed.
            </Text>
          </>
        ) : (
          <View style={styles.sentBox}>
            <Text style={styles.sentEmoji}>✉️</Text>
            <Text style={styles.sentTitle}>Check your email</Text>
            <Text style={styles.sentBody}>
              We sent a magic link to{'\n'}
              <Text style={styles.sentEmail}>{email}</Text>
              {'\n\n'}Tap the link in the email to sign in.
            </Text>
            <TouchableOpacity
              style={styles.resendBtn}
              onPress={() => setSent(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.resendText}>Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}
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
    marginBottom: 48,
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
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.t2,
    marginBottom: 12,
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
  sentBox: {
    alignItems: 'center',
    padding: 16,
  },
  sentEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  sentTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.t1,
    marginBottom: 12,
  },
  sentBody: {
    fontSize: 15,
    color: Colors.t3,
    textAlign: 'center',
    lineHeight: 22,
  },
  sentEmail: {
    color: Colors.veggie,
    fontWeight: '600',
  },
  resendBtn: {
    marginTop: 28,
    padding: 12,
  },
  resendText: {
    fontSize: 14,
    color: Colors.t4,
    textDecorationLine: 'underline',
  },
});
