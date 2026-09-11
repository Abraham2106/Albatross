import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Pressable } from './Mobile';
import { typography, useAppTheme } from '../theme';

const MAX_PHOTOS = 3;

export function PhotoAttachments({ photos, onChange, disabled = false }: {
  photos: string[];
  onChange?: (photos: string[]) => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsSettings, setNeedsSettings] = useState(false);
  const picking = useRef(false);

  const pick = async (source: 'camera' | 'library') => {
    if (!onChange || disabled || picking.current || photos.length >= MAX_PHOTOS) return;
    picking.current = true;
    setBusy(true);
    setError('');
    setNeedsSettings(false);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Permite el acceso a la cámara para fotografiar la placa. También puedes elegir una foto de la galería.');
          setNeedsSettings(!permission.canAskAgain);
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'], quality: 1, allowsEditing: false,
        exif: false, base64: false,
      };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - photos.length });
      if (!result.canceled) {
        const uris = result.assets.map(asset => asset.uri);
        onChange([...new Set([...photos, ...uris])].slice(0, MAX_PHOTOS));
      }
    } catch {
      setError('No se pudo abrir la foto. Intenta de nuevo o elige otra desde la galería.');
    } finally {
      picking.current = false;
      setBusy(false);
    }
  };

  return <View style={styles.section}>
    <Text style={[styles.label, { color: colors.text }]}>Fotos de placa o etiqueta · {photos.length}{onChange ? '/3' : ''}</Text>
    <View style={styles.grid}>
      {photos.map((uri, index) => <View key={uri} style={[styles.tile, { backgroundColor: colors.accentSoft }]}>
        {uri.startsWith('demo://')
          ? <View style={styles.placeholder}><Text style={{ color: colors.secondary }}>Foto demo {index + 1}</Text></View>
          : <Image source={{ uri }} accessibilityLabel={`Foto de placa ${index + 1}`} accessible style={styles.image} contentFit="contain" />}
        {onChange && <Pressable disabled={disabled || busy} accessibilityLabel={`Quitar foto ${index + 1}`} onPress={() => onChange(photos.filter(photo => photo !== uri))}>
          <Text style={[styles.remove, { color: colors.danger }]}>Quitar foto {index + 1}</Text>
        </Pressable>}
      </View>)}
    </View>
    {photos.length === 0 && <Text style={[styles.hint, { color: colors.muted }]}>Adjunta una foto nítida de la placa completa, sin reflejos.</Text>}
    {onChange && photos.length < MAX_PHOTOS && <View style={styles.actions}>
      <Pressable disabled={disabled || busy} onPress={() => void pick('camera')} style={[styles.action, { backgroundColor: colors.accent }]}>
        <Text style={[styles.actionText, { color: colors.onAccent }]}>Tomar foto</Text>
      </Pressable>
      <Pressable disabled={disabled || busy} onPress={() => void pick('library')} style={[styles.action, { borderWidth: 1, borderColor: colors.accent }]}>
        <Text style={[styles.actionText, { color: colors.accent }]}>Elegir de galería</Text>
      </Pressable>
    </View>}
    {busy && <View accessibilityLiveRegion="polite" style={styles.actions}><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.muted }}>Abriendo fotos…</Text></View>}
    {!!error && <Text accessibilityRole="alert" style={[styles.hint, { color: colors.danger }]}>{error}</Text>}
    {needsSettings && <Pressable onPress={() => { void Linking.openSettings().catch(() => setError('Abre Ajustes del teléfono y habilita el permiso de cámara para esta app.')); }}><Text style={{ color: colors.accent }}>Abrir ajustes</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  label: { fontSize: typography.body, fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', height: 220 },
  placeholder: { height: 96, alignItems: 'center', justifyContent: 'center' },
  remove: { textAlign: 'center', fontSize: typography.label, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, alignItems: 'center' },
  action: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  actionText: { fontSize: typography.body, fontWeight: '700' },
  hint: { fontSize: typography.label, lineHeight: 20, marginTop: 8 },
});
