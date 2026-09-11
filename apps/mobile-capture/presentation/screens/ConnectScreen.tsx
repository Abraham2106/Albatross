import { Pressable, ScrollView } from '../components/Mobile';
import { Colors, typography, useAppTheme } from '../theme';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppContext } from '../context/AppContext';

export const ConnectScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useAppTheme(); const styles = createStyles(colors);
  const { connection, acceptInvitation, disconnectComputer, setPairingStatus } = useAppContext();
  const [raw, setRaw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pair = async () => {
    setLoading(true);
    setError('');
    try { await acceptInvitation(raw); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer la invitación.'); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>TU ESTACIÓN DE TRABAJO</Text>
      <Text style={styles.title}>Conectar computadora</Text>
      <Text style={styles.description}>
        Crea una invitación desde Configuración en la app de escritorio y pégala aquí para vincular este teléfono.
      </Text>
      <TextInput
        accessibilityLabel="Invitación de la computadora" style={styles.input}
        value={raw}
        onChangeText={setRaw}
        placeholder='{"v":1,"k":"…","t":"…","e":"…"}'
        placeholderTextColor={colors.muted}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.muted}>Leyendo invitación…</Text>
        </View>
      ) : connection.status === 'disconnected' || connection.status === 'expired' || connection.status === 'revoked' ? (
        <Pressable disabled={!raw.trim()} style={styles.primary} onPress={() => { void pair(); }}>
          <Text style={styles.primaryText}>Guardar invitación</Text>
        </Pressable>
      ) : (
        <View style={styles.peer}>
          <Text style={styles.peerStatus}>{connection.status === 'connected' ? 'Lista en modo demo' : '○ Invitación guardada'}</Text>
          <Text style={styles.peerName}>{connection.computerName}</Text>
          <Text style={styles.muted}>Huella: {connection.fingerprint}</Text>
          <Text style={styles.muted}>La invitación está guardada. Esta versión de demostración todavía no envía ni procesa observaciones.</Text>
          <Pressable style={styles.primary} onPress={() => setPairingStatus('connected')}>
            <Text style={styles.primaryText}>Simular conexión (demo)</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={disconnectComputer}>
            <Text style={styles.secondaryText}>Olvidar invitación</Text>
          </Pressable>
        </View>
      )}
      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>Volver</Text>
      </Pressable>
    </ScrollView>
  );
};

const createStyles = (colors: Colors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20 },
  eyebrow: { color: colors.secondary, fontSize: typography.label, fontWeight: '700', letterSpacing: 1 },
  title: { color: colors.text, fontSize: typography.headline, fontWeight: '700', marginTop: 6 },
  description: { color: colors.secondary, lineHeight: 21, marginTop: 12, marginBottom: 18 },
  input: { minHeight: 120, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, color: colors.text, fontFamily: 'monospace', textAlignVertical: 'top' },
  error: { color: colors.danger, marginTop: 10, fontWeight: '700' },
  center: { alignItems: 'center', padding: 20 },
  muted: { color: colors.muted, fontSize: typography.label, marginTop: 8 },
  primary: { backgroundColor: colors.accent, borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 18 },
  primaryText: { color: colors.onAccent, fontSize: typography.body, fontWeight: '700' },
  peer: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, borderLeftWidth: 4, borderLeftColor: colors.success, marginTop: 18 },
  peerStatus: { color: colors.success, fontWeight: '700' },
  peerName: { color: colors.text, fontSize: typography.title, fontWeight: '700', marginTop: 12 },
  secondary: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: colors.secondary, fontWeight: '700' },
  back: { alignItems: 'center', padding: 18 },
  backText: { color: colors.secondary, fontWeight: '700' },
});
