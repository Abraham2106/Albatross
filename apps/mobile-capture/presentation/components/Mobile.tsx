import React from 'react';
import { Pressable as NativePressable, PressableProps, ScrollView as NativeScrollView, ScrollViewProps, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme';

/** One touch contract for all mobile actions, including text-only controls. */
export function Pressable({ style, disabled, accessibilityState, ...props }: PressableProps) {
 return <NativePressable {...props} disabled={disabled} accessibilityRole={props.accessibilityRole ?? 'button'} accessibilityState={{ ...accessibilityState, disabled: !!disabled }} style={state => [{ minHeight: 48, minWidth: 48, justifyContent: 'center' }, typeof style === 'function' ? style(state) : style, { opacity: disabled ? 0.45 : state.pressed ? 0.65 : 1 }]} />;
}
export function ScrollView({ contentContainerStyle, ...props }: ScrollViewProps) {
 const insets = useSafeAreaInsets(); const { colors } = useAppTheme();
 return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 44}>
  <NativeScrollView {...props} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} contentContainerStyle={[contentContainerStyle, { paddingBottom: insets.bottom + 32, paddingLeft: Math.max(insets.left, 20), paddingRight: Math.max(insets.right, 20), width: '100%', maxWidth: 680, alignSelf: 'center' }]} />
 </KeyboardAvoidingView>;
}
