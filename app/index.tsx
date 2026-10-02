import { Redirect } from 'expo-router';
import { useApp } from '../src/app-state/AppContext';

export default function Index() {
  const { onboarded } = useApp();
  return <Redirect href={onboarded ? '/(tabs)/home' : '/(onboarding)/language'} />;
}
