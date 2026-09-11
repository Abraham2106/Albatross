import { StatusBar } from 'expo-status-bar';
import { useAppTheme } from './presentation/theme';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { checkBareRuntime } from './adapters/qvac/checkBareRuntime';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './presentation/context/AppContext';
import { ScenarioSelector } from './presentation/components/ScenarioSelector';
import { HomeScreen } from './presentation/screens/HomeScreen';
import { ConnectScreen } from './presentation/screens/ConnectScreen';
import { NewCaptureScreen } from './presentation/screens/NewCaptureScreen';
import { CaptureProgressScreen } from './presentation/screens/CaptureProgressScreen';
import { ReviewScreen } from './presentation/screens/ReviewScreen';
import { DetailScreen } from './presentation/screens/DetailScreen';

const Stack = createNativeStackNavigator();
export default function App() {
  useEffect(() => {
    if (__DEV__ && Platform.OS !== 'web') {
      void checkBareRuntime().then(
        () => console.info('[Bare] Native IPC round trip passed'),
        (error: unknown) => console.error('[Bare] Native IPC check failed', error),
      );
    }
  }, []);
  const { colors, dark } = useAppTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent } };
  return <SafeAreaProvider><StatusBar style={dark ? 'light' : 'dark'} /><AppProvider><NavigationContainer theme={theme}><Stack.Navigator initialRouteName="Home" screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.accent, headerTitleStyle: { fontWeight: '700' } }}>
    <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Albatross', headerRight: () => <ScenarioSelector /> }} />
    <Stack.Screen name="ConnectComputer" component={ConnectScreen} options={{ title: 'Conectar computadora' }} />
    <Stack.Screen name="NewCapture" component={NewCaptureScreen} options={{ title: 'Nueva observación' }} />
    <Stack.Screen name="CaptureProgress" component={CaptureProgressScreen} options={{ title: 'Estado' }} />
    <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Revisión humana' }} />
    <Stack.Screen name="Detail" component={DetailScreen} options={{ title: 'Detalle' }} />
  </Stack.Navigator></NavigationContainer></AppProvider></SafeAreaProvider>;
}
