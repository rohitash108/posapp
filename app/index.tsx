import { Redirect } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet, Easing } from 'react-native';
import { useAppStore } from '@/store/appStore';

function AnimatedSplash() {
  const logoScale   = useRef(new Animated.Value(0.55)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const dotScale    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Phase 1: Logo springs in
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: 0.6,
        duration: 600,
        delay: 100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Phase 2: Text fades in
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 350,
        delay: 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      // Phase 3: Pulse the glow continuously
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpacity, { toValue: 0.85, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();

      // Phase 4: Dot bounce
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotScale, { toValue: 1.35, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dotScale, { toValue: 1,    duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  return (
    <View style={s.shell}>
      {/* Radial glow behind logo */}
      <Animated.View style={[s.glow, { opacity: glowOpacity }]} />

      {/* Logo */}
      <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
        <View style={s.logoRing}>
          <Image
            source={require('../assets/gtc-logo.png')}
            style={s.logo}
            resizeMode="contain"
          />
        </View>
      </Animated.View>

      {/* Brand text */}
      <Animated.View style={{ opacity: textOpacity, alignItems: 'center', marginTop: 24 }}>
        <Text style={s.brand}>csPos Mobile</Text>
        <Text style={s.tagline}>Restaurant Management System</Text>
      </Animated.View>

      {/* Pulsing dot loader */}
      <Animated.View style={[s.dotWrap, { opacity: textOpacity }]}>
        {[0, 1, 2].map(i => (
          <DotBounce key={i} delay={i * 180} />
        ))}
      </Animated.View>
    </View>
  );
}

function DotBounce({ delay }: { delay: number }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: -8, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0,  duration: 380, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
        Animated.delay(400),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[s.dot, { transform: [{ translateY: y }] }]} />
  );
}

const s = StyleSheet.create({
  shell:   { flex: 1, backgroundColor: '#1A2B1A', alignItems: 'center', justifyContent: 'center' },
  glow:    {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: '#C9A52A',
    shadowColor: '#C9A52A', shadowOpacity: 1, shadowRadius: 80, shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  logoRing:{
    width: 148, height: 148, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5, borderColor: 'rgba(201,165,42,0.35)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#C9A52A', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  logo:    { width: 110, height: 110 },
  brand:   { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  tagline: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.45)', marginTop: 4, letterSpacing: 1 },
  dotWrap: { flexDirection: 'row', gap: 8, marginTop: 48, alignItems: 'center' },
  dot:     { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#C9A52A' },
});

export default function Index() {
  const token       = useAppStore((s) => s.token);
  const isHydrated  = useAppStore((s) => s.isHydrated);

  if (!isHydrated) return <AnimatedSplash />;

  return token ? <Redirect href="/(app)/dashboard" /> : <Redirect href="/(auth)/login" />;
}
