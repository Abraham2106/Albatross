import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props { children: ReactNode }
interface State { failed: boolean }

/** Keeps mock UI available if a native/JS probe throws after first paint. */
export class QuietErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* demo: do not redbox */ }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.page}>
        <Text style={styles.eyebrow}>MODO DEMO</Text>
        <Text style={styles.title}>Albatross</Text>
        <Text style={styles.body}>
          El enlace nativo falló. Los datos de esta sesión son de ejemplo; podés recorrer las pantallas igual.
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#E8EEF1', padding: 24, justifyContent: 'center' },
  eyebrow: { color: '#44515C', fontWeight: '700', letterSpacing: 1, fontSize: 13 },
  title: { color: '#12181E', fontSize: 28, fontWeight: '700', marginTop: 8 },
  body: { color: '#44515C', fontSize: 16, lineHeight: 24, marginTop: 12 },
});
