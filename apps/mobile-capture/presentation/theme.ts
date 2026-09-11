import { useColorScheme } from 'react-native';
export const typography = { display: 32, headline: 28, title: 18, body: 16, label: 13 };
// Matches ui/cib-ui-5/cib-ui/src/styles.css; muted text uses tinta-2 for small mobile labels.
export const lightColors = {
 background: '#E8EEF1', surface: '#FFFFFF', text: '#12181E', secondary: '#44515C', muted: '#44515C',
 accent: '#00655B', onAccent: '#FFFFFF', accentSoft: '#E2EFED', border: '#D5DEE4',
 success: '#0F7A3D', successSoft: '#E6F4EA', warning: '#96570B', warningSoft: '#FBF0DD', danger: '#B3261E',
};
export const darkColors: typeof lightColors = {
 background: '#0C1114', surface: '#141B20', text: '#E8EEF1', secondary: '#9AABB6', muted: '#9AABB6',
 accent: '#5EC8BC', onAccent: '#0C1114', accentSoft: '#163532', border: '#2C3942',
 success: '#5DCA86', successSoft: '#143322', warning: '#E0A35A', warningSoft: '#332410', danger: '#F07167',
};
export type Colors = typeof lightColors;
export function useAppTheme() { const dark = useColorScheme() === 'dark'; return { dark, colors: dark ? darkColors : lightColors }; }
