/** Icon-first bottom tabs; SOS is in every tab header. Offline: no difference. */
import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useApp } from '../../src/app-state/AppContext';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SosButton } from '../../src/components/ui';

type N = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const icon = (name: N) => ({ color, size }: { color: string; size: number }) => (
  <MaterialCommunityIcons name={name} color={color} size={size + 6} />
);

export default function TabsLayout() {
  const { t } = useTranslation();
  const { onboarded } = useApp();
  if (!onboarded) return <Redirect href="/(onboarding)/language" />;
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <SosButton />,
        tabBarStyle: { height: 72, paddingBottom: 10, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 13 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: icon('home-heart') }} />
      <Tabs.Screen name="symptom-check" options={{ title: t('tabs.check'), tabBarIcon: icon('stethoscope') }} />
      <Tabs.Screen name="records" options={{ title: t('tabs.records'), tabBarIcon: icon('folder-heart-outline') }} />
      <Tabs.Screen name="facilities" options={{ title: t('tabs.facilities'), tabBarIcon: icon('hospital-marker') }} />
      <Tabs.Screen name="more" options={{ title: t('tabs.more'), tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}
