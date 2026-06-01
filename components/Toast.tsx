/**
 * Global floating toast — animated slide-up entry and fade-out exit.
 * Rendered once in RootLayout above everything.
 */
import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore, Toast } from '@/stores/toastStore';
import { Colors } from '@/constants/colors';

const TYPE_COLOR: Record<Toast['type'], string> = {
  success: Colors.veggie,
  warning: Colors.birr,
  error:   Colors.flagged,
  info:    Colors.deal,
};

const TYPE_ICON: Record<Toast['type'], string> = {
  success: '✓',
  warning: '⚠',
  error:   '✕',
  info:    'ℹ',
};

// ── Animated single toast ─────────────────────────────────────────────────────
function AnimatedToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const color = TYPE_COLOR[toast.type];

  useEffect(() => {
    // Slide up + fade in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0, friction: 8, tension: 80, useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1, duration: 250, useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss: fade + slide out after 3.6s
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0, duration: 220, useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -20, duration: 220, useNativeDriver: true,
        }),
      ]).start(() => onDismiss());
    }, 3_600);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={{ transform: [{ translateY }], opacity }}>
      <TouchableOpacity
        style={[styles.toast, { borderLeftColor: color }]}
        onPress={onDismiss}
        activeOpacity={0.9}
      >
        <View style={[styles.iconWrap, { backgroundColor: color + '25' }]}>
          <Text style={[styles.icon, { color }]}>{TYPE_ICON[toast.type]}</Text>
        </View>
        <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Container ─────────────────────────────────────────────────────────────────
export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      {toasts.map((t) => (
        <AnimatedToast key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left:     16,
    right:    16,
    zIndex:   9999,
    gap:      8,
  },
  toast: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    backgroundColor: Colors.s2,
    borderRadius:    14,
    padding:         14,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderLeftWidth: 4,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.35,
    shadowRadius:    10,
    elevation:       12,
  },
  iconWrap: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  icon:    { fontSize: 15, fontWeight: '800' },
  message: { flex: 1, fontSize: 14, color: Colors.t1, lineHeight: 20 },
});
