import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
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
  return <SafeAreaProvider><AppProvider><NavigationContainer><Stack.Navigator initialRouteName="Home" screenOptions={{ headerStyle: { backgroundColor: '#102A43' }, headerTintColor: '#FFFFFF', headerTitleStyle: { fontWeight: '700' } }}>
    <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Albatross' }} />
    <Stack.Screen name="ConnectComputer" component={ConnectScreen} options={{ title: 'Conectar computadora' }} />
    <Stack.Screen name="NewCapture" component={NewCaptureScreen} options={{ title: 'Nueva observación' }} />
    <Stack.Screen name="CaptureProgress" component={CaptureProgressScreen} options={{ title: 'Estado' }} />
    <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Revisión humana' }} />
    <Stack.Screen name="Detail" component={DetailScreen} options={{ title: 'Detalle' }} />
  </Stack.Navigator></NavigationContainer><ScenarioSelector /></AppProvider></SafeAreaProvider>;
}
