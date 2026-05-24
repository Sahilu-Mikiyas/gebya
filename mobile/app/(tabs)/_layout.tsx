import { Tabs } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={[styles.tabEmoji, focused && styles.tabEmojiFocused]}>
      {emoji}
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:         false,
        tabBarStyle:         styles.tabBar,
        tabBarActiveTintColor:   Colors.veggie,
        tabBarInactiveTintColor: Colors.t4,
        tabBarLabelStyle:    styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔍" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ focused }) => <TabIcon emoji="➕" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="list"
        options={{
          title: 'My List',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.s1,
    borderTopColor:  Colors.border,
    borderTopWidth:  1,
    height:          64,
    paddingBottom:   8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  tabEmoji: {
    fontSize: 22,
    opacity:  0.5,
  },
  tabEmojiFocused: {
    opacity: 1,
  },
});
