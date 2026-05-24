import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Browse Items</Text>
      <Text style={styles.sub}>Coming in Sprint 2 🚀</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: Colors.t1 },
  sub:   { fontSize: 14, color: Colors.t4, marginTop: 8 },
});
