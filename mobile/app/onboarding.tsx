/**
 * onboarding.tsx — Phase 3
 * 4-slide horizontal pager:
 *  Slide 0 — Splash / Hero
 *  Slide 1 — How It Works (3 animated steps)
 *  Slide 2 — Neighbourhood Picker
 *  Slide 3 — First Log Nudge
 */
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Animated, FlatList, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useToastStore } from '@/stores/toastStore';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PulseButton from '@/components/PulseButton';

const { width: W, height: H } = Dimensions.get('window');
const SLIDES = 4;

// ── Types ──────────────────────────────────────────────────────────────────────
interface CatalogItem { id: string; name: string; emoji: string; unit: string }
interface Market      { id: string; name: string }

// ── Fetchers ───────────────────────────────────────────────────────────────────
async function fetchSubCities(): Promise<string[]> {
  const { data } = await supabase
    .from('markets')
    .select('sub_city')
    .eq('is_active', true);
  const unique = [...new Set((data ?? []).map((r: any) => r.sub_city as string).filter(Boolean))];
  return unique.sort();
}
async function fetchItems(): Promise<CatalogItem[]> {
  const { data } = await supabase.from('items').select('id,name,emoji,unit').order('name').limit(30);
  return data ?? [];
}
async function fetchMarkets(): Promise<Market[]> {
  const { data } = await supabase.from('markets').select('id,name').eq('is_active', true).order('name');
  return data ?? [];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function useSlideAnim(active: boolean) {
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: active ? 1 : 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
  }, [active]);
  return anim;
}

// ── Progress Dots ─────────────────────────────────────────────────────────────
function Dots({ current }: { current: number }) {
  return (
    <View style={dot.row}>
      {Array.from({ length: SLIDES }).map((_, i) => (
        <View
          key={i}
          style={[dot.base, i === current ? dot.active : dot.inactive]}
        />
      ))}
    </View>
  );
}
const dot = StyleSheet.create({
  row:      { flexDirection: 'row', gap: 6, alignItems: 'center' },
  base:     { height: 6, borderRadius: 3 },
  active:   { width: 20, backgroundColor: Colors.veggie },
  inactive: { width: 6,  backgroundColor: Colors.s4 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 0 — Splash / Hero
// ═══════════════════════════════════════════════════════════════════════════════
function SlideHero({ onNext }: { onNext: () => void }) {
  const leftX  = useRef(new Animated.Value(-80)).current;
  const rightX = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Badges fly in
    Animated.parallel([
      Animated.spring(leftX,  { toValue: 0, useNativeDriver: true, delay: 200, tension: 60 }),
      Animated.spring(rightX, { toValue: 0, useNativeDriver: true, delay: 350, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 600, delay: 100, useNativeDriver: true }),
    ]).start();

    // Pulsing dot
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[s.slide, { opacity }]}>
      {/* Floating badges */}
      <View style={s.badgesRow}>
        <Animated.View style={[s.badge, s.badgeLeft, { transform: [{ translateX: leftX }] }]}>
          <Text style={s.badgeEmoji}>🏆</Text>
          <Text style={s.badgeTxt}>Cheapest nearby</Text>
        </Animated.View>

        <Animated.View style={[s.badge, s.badgeRight, { transform: [{ translateX: rightX }] }]}>
          <Animated.View style={[s.pulseDot, { transform: [{ scale: pulse }] }]} />
          <Text style={s.badgeTxt}>247 logs today</Text>
        </Animated.View>
      </View>

      {/* Hero illustration area */}
      <View style={s.heroArt}>
        <Text style={s.heroEmoji}>🛒</Text>
        <View style={s.heroGlow} />
      </View>

      {/* Copy */}
      <Text style={s.heroTitle}>Know before{'\n'}you go.</Text>
      <Text style={s.heroSub}>
        Community-powered prices from markets across Addis Ababa — always fresh, always free.
      </Text>

      <PulseButton label="Get Started →" onPress={onNext} style={s.cta} />
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — How It Works
// ═══════════════════════════════════════════════════════════════════════════════
const HOW_STEPS = [
  { icon: '📍', title: 'Someone logs a price', sub: 'A community member at Shola or Merkato logs what they actually paid.' },
  { icon: '🤖', title: 'Algorithm validates it', sub: 'We flag outliers, average community data, and detect anomalies.' },
  { icon: '💰', title: 'You find the best deal', sub: 'Compare prices across markets before you leave home — save ETB every trip.' },
];

function SlideHow({ onNext }: { onNext: () => void }) {
  const anims = HOW_STEPS.map((_, i) => useRef(new Animated.Value(0)).current);
  const lineH = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const seq = HOW_STEPS.map((_, i) =>
      Animated.parallel([
        Animated.spring(anims[i], { toValue: 1, useNativeDriver: true, tension: 70, friction: 12 }),
      ])
    );
    Animated.sequence([
      Animated.delay(100),
      ...seq.map((a, i) => Animated.sequence([a, Animated.delay(i < 2 ? 150 : 0)])),
    ]).start();

    Animated.timing(lineH, { toValue: 1, duration: 900, delay: 200, useNativeDriver: false }).start();
  }, []);

  return (
    <View style={s.slide}>
      <Text style={s.slideTitle}>How Gebya works</Text>
      <Text style={s.slideSub}>Three simple steps that save you money every week.</Text>

      <View style={s.stepsWrap}>
        {/* Connector line */}
        <Animated.View style={[s.connectorLine, {
          height: lineH.interpolate({ inputRange: [0,1], outputRange: ['0%', '72%'] })
        }]} />

        {HOW_STEPS.map((step, i) => (
          <Animated.View
            key={i}
            style={[
              s.step,
              {
                opacity:   anims[i],
                transform: [{ translateX: anims[i].interpolate({ inputRange: [0,1], outputRange: [40, 0] }) }],
              },
            ]}
          >
            <View style={s.stepIconWrap}>
              <Text style={s.stepIcon}>{step.icon}</Text>
            </View>
            <View style={s.stepBody}>
              <Text style={s.stepTitle}>{step.title}</Text>
              <Text style={s.stepSub}>{step.sub}</Text>
            </View>
          </Animated.View>
        ))}
      </View>

      <PulseButton label="Next →" onPress={onNext} style={s.cta} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — Neighbourhood Picker
// ═══════════════════════════════════════════════════════════════════════════════
function SlideNeighbourhood({ onNext }: { onNext: (sub: string) => void }) {
  const { data: subCities = [], isLoading } = useQuery({
    queryKey: ['sub-cities'],
    queryFn: fetchSubCities,
  });
  const [selected, setSelected] = useState<string | null>(null);

  const choose = async () => {
    if (!selected) return;
    onNext(selected);
  };

  return (
    <View style={s.slide}>
      <Text style={s.slideTitle}>Where do you shop?</Text>
      <Text style={s.slideSub}>We'll show prices closest to you first.</Text>

      {isLoading ? (
        <ActivityIndicator color={Colors.veggie} style={{ marginTop: 40 }} />
      ) : (
        <View style={s.cityGrid}>
          {subCities.map((city) => {
            const active = selected === city;
            return (
              <TouchableOpacity
                key={city}
                style={[s.cityChip, active && s.cityChipActive]}
                onPress={() => setSelected(city)}
                activeOpacity={0.75}
              >
                {active && <Text style={s.cityCheck}>✓ </Text>}
                <Text style={[s.cityTxt, active && s.cityTxtActive]}>{city}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <PulseButton
        label={selected ? `Continue with ${selected} →` : 'Select your area'}
        onPress={choose}
        disabled={!selected}
        style={s.cta}
        color={selected ? Colors.veggie : Colors.s3}
        textColor={selected ? Colors.bg : Colors.t4}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — First Log Nudge
// ═══════════════════════════════════════════════════════════════════════════════
function SlideFirstLog({ onSkip, onLog }: { onSkip: () => void; onLog: () => void }) {
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, tension: 60, delay: 200 }).start();
  }, []);

  return (
    <View style={s.slide}>
      <Text style={s.slideTitle}>Log your first price</Text>
      <Text style={s.slideSub}>Earn Pioneer Points and help your whole community.</Text>

      {/* Pioneer reward card */}
      <Animated.View style={[s.rewardCard, {
        opacity:   cardAnim,
        transform: [{ translateY: cardAnim.interpolate({ inputRange: [0,1], outputRange: [30, 0] }) }],
      }]}>
        <Text style={s.rewardEmoji}>🏅</Text>
        <View style={s.rewardBody}>
          <Text style={s.rewardTitle}>Pioneer Bonus</Text>
          <Text style={s.rewardSub}>First log from a market = <Text style={s.rewardPts}>+25 Pioneer Points</Text></Text>
        </View>
      </Animated.View>

      {/* How it works mini steps */}
      <View style={s.miniSteps}>
        {[
          { n: '1', t: 'Pick an item you know the price of' },
          { n: '2', t: 'Select the market where you saw it' },
          { n: '3', t: 'Enter the price and submit' },
        ].map((step) => (
          <View key={step.n} style={s.miniStep}>
            <View style={s.miniNum}><Text style={s.miniNumTxt}>{step.n}</Text></View>
            <Text style={s.miniStepTxt}>{step.t}</Text>
          </View>
        ))}
      </View>

      <PulseButton label="Log My First Price →" onPress={onLog} style={s.cta} />

      <TouchableOpacity onPress={onSkip} style={s.skipBtn} activeOpacity={0.6}>
        <Text style={s.skipTxt}>Skip, explore first</Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT — Onboarding container
// ═══════════════════════════════════════════════════════════════════════════════
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { completeOnboarding } = useOnboardingStore();
  const { showToast } = useToastStore();

  const scrollRef = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(0);
  const [neighbourhood, setNeighbourhood] = useState<string | null>(null);

  const goTo = useCallback((index: number) => {
    scrollRef.current?.scrollTo({ x: W * index, animated: true });
    setCurrent(index);
  }, []);

  const next = useCallback(() => goTo(Math.min(current + 1, SLIDES - 1)), [current, goTo]);

  // Save neighbourhood + advance
  const handleNeighbourhood = useCallback(async (sub: string) => {
    setNeighbourhood(sub);
    if (user) {
      await supabase.from('profiles').update({ neighbourhood: sub }).eq('id', user.id);
    }
    goTo(3);
  }, [user, goTo]);

  // Finish — mark onboarded
  const finish = useCallback(async (logFirst: boolean) => {
    await completeOnboarding();
    if (user) {
      await supabase.from('profiles').update({ onboarded: true }).eq('id', user.id);
    }
    if (logFirst) {
      router.replace('/(tabs)/log');
    } else {
      router.replace('/(tabs)');
      showToast('Welcome to Gebya! 🎉', 'success');
    }
  }, [user, completeOnboarding, router, showToast]);

  return (
    <View style={[ob.root, { paddingTop: insets.top }]}>
      {/* Top bar — dots + skip */}
      <View style={ob.topBar}>
        <Dots current={current} />
        {current < 3 && (
          <TouchableOpacity onPress={() => finish(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={ob.skipTopTxt}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}   // controlled programmatically
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ width: W * SLIDES }}
      >
        <SlideHero onNext={next} />
        <SlideHow  onNext={next} />
        <SlideNeighbourhood onNext={handleNeighbourhood} />
        <SlideFirstLog
          onSkip={() => finish(false)}
          onLog={() => finish(true)}
        />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared styles
// ═══════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  slide: {
    width:          W,
    flex:           1,
    paddingHorizontal: 28,
    paddingTop:     20,
    paddingBottom:  24,
    alignItems:     'center',
  },

  // ── Slide 0 ─────────────────────────────────────────────────────────────────
  badgesRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    width:          '100%',
    marginBottom:   12,
  },
  badge: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderRadius:   100,
    backgroundColor: Colors.s2,
    borderWidth:    1,
    borderColor:    Colors.border,
  },
  badgeLeft:  {},
  badgeRight: {},
  badgeEmoji: { fontSize: 14 },
  badgeTxt:   { fontSize: 12, fontWeight: '700', color: Colors.t2 },
  pulseDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.veggie },

  heroArt:   {
    width:        140,
    height:       140,
    borderRadius: 70,
    backgroundColor: Colors.veggie + '12',
    alignItems:   'center',
    justifyContent: 'center',
    marginVertical: 20,
    position:     'relative',
  },
  heroEmoji: { fontSize: 64 },
  heroGlow:  {
    position:       'absolute',
    width:          180,
    height:         180,
    borderRadius:   90,
    backgroundColor: Colors.veggie + '08',
  },

  heroTitle: {
    fontSize:      38,
    fontWeight:    '900',
    color:         Colors.t1,
    letterSpacing: -1.5,
    textAlign:     'center',
    lineHeight:    44,
    marginBottom:  14,
  },
  heroSub: {
    fontSize:   15,
    color:      Colors.t4,
    textAlign:  'center',
    lineHeight: 22,
    marginBottom: 8,
  },

  // ── Slide 1 ─────────────────────────────────────────────────────────────────
  slideTitle: {
    fontSize:      26,
    fontWeight:    '900',
    color:         Colors.t1,
    letterSpacing: -0.8,
    textAlign:     'center',
    marginBottom:  8,
  },
  slideSub: {
    fontSize:     14,
    color:        Colors.t4,
    textAlign:    'center',
    lineHeight:   21,
    marginBottom: 28,
  },

  stepsWrap:     { width: '100%', gap: 0, position: 'relative', marginBottom: 28 },
  connectorLine: {
    position:        'absolute',
    left:            22,
    top:             36,
    width:           2,
    backgroundColor: Colors.veggie + '40',
    borderRadius:    1,
  },
  step:      { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14, paddingLeft: 6 },
  stepIconWrap: {
    width:          44,
    height:         44,
    borderRadius:   22,
    backgroundColor: Colors.s2,
    borderWidth:    1,
    borderColor:    Colors.border,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    zIndex:         1,
  },
  stepIcon:  { fontSize: 20 },
  stepBody:  { flex: 1, paddingTop: 2 },
  stepTitle: { fontSize: 15, fontWeight: '800', color: Colors.t1, marginBottom: 4 },
  stepSub:   { fontSize: 13, color: Colors.t4, lineHeight: 19 },

  // ── Slide 2 ─────────────────────────────────────────────────────────────────
  cityGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            10,
    justifyContent: 'center',
    marginBottom:   28,
    width:          '100%',
  },
  cityChip: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical:    11,
    borderRadius:   12,
    borderWidth:    1.5,
    borderColor:    Colors.border,
    backgroundColor: Colors.s1,
  },
  cityChipActive: {
    borderColor:     Colors.veggie,
    backgroundColor: Colors.veggie + '15',
  },
  cityCheck:    { fontSize: 12, color: Colors.veggie, fontWeight: '800' },
  cityTxt:      { fontSize: 14, fontWeight: '600', color: Colors.t3 },
  cityTxtActive:{ color: Colors.veggie, fontWeight: '800' },

  // ── Slide 3 ─────────────────────────────────────────────────────────────────
  rewardCard: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            14,
    backgroundColor: Colors.birr + '12',
    borderRadius:   16,
    borderWidth:    1,
    borderColor:    Colors.birr + '40',
    padding:        18,
    width:          '100%',
    marginBottom:   24,
  },
  rewardEmoji: { fontSize: 36 },
  rewardBody:  { flex: 1 },
  rewardTitle: { fontSize: 15, fontWeight: '800', color: Colors.t1 },
  rewardSub:   { fontSize: 13, color: Colors.t3, marginTop: 3, lineHeight: 18 },
  rewardPts:   { color: Colors.birr, fontWeight: '800' },

  miniSteps:  { width: '100%', gap: 12, marginBottom: 28 },
  miniStep:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniNum:    {
    width:          28,
    height:         28,
    borderRadius:   14,
    backgroundColor: Colors.veggie + '20',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  miniNumTxt:  { fontSize: 13, fontWeight: '900', color: Colors.veggie },
  miniStepTxt: { fontSize: 14, color: Colors.t3, flex: 1, lineHeight: 20 },

  skipBtn: { marginTop: 16, paddingVertical: 10 },
  skipTxt: { fontSize: 14, color: Colors.t5, textDecorationLine: 'underline' },

  // ── Shared CTA ───────────────────────────────────────────────────────────────
  cta: { width: '100%', marginTop: 8 },
});

const ob = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: 24,
    paddingTop:     12,
    paddingBottom:  8,
  },
  skipTopTxt: { fontSize: 14, color: Colors.t4, fontWeight: '600' },
});
