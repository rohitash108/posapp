import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAppStore } from '@/store/appStore';

export default function Index() {
  const token = useAppStore((s) => s.token);
  const isHydrated = useAppStore((s) => s.isHydrated);

  if (!isHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1A2B1A' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return token ? <Redirect href="/(app)/pos" /> : <Redirect href="/(auth)/login" />;
}
