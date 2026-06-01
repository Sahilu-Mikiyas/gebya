import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, DevSettings } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  private handleRestart = () => {
    if (Platform.OS === 'web') {
      window.location.reload();
    } else {
      // Native reload
      DevSettings.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.logoEmoji}>🥬</Text>
            <Text style={styles.logoText}>Gebya</Text>
            
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              Gebya encountered an unexpected error. Don't worry, your price logs are safe!
            </Text>

            <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorContent}>
              <Text style={styles.errorText}>
                {this.state.error?.toString() ?? 'Unknown Error'}
              </Text>
            </ScrollView>

            <TouchableOpacity style={styles.button} onPress={this.handleRestart} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Restart App</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#111',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#222',
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  logoEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#22C55E', // veggie color
    letterSpacing: -1,
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  errorScroll: {
    width: '100%',
    maxHeight: 160,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginBottom: 24,
  },
  errorContent: {
    padding: 16,
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#EF4444', // red
    lineHeight: 18,
  },
  button: {
    width: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#080808',
  },
});
