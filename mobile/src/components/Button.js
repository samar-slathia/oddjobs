import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import colors from '../theme/colors';

export default function Button({ title, onPress, loading, style, textStyle, variant = 'primary' }) {
  const isPrimary = variant === 'primary';
  const backgroundColor = isPrimary ? colors.primary : colors.surface;
  const textColor = isPrimary ? colors.text : colors.primaryDark;
  const borderColor = isPrimary ? colors.primary : colors.border;

  return (
    <TouchableOpacity 
      style={[styles.button, { backgroundColor, borderColor: borderColor, borderWidth: isPrimary ? 0 : 1 }, style]} 
      onPress={onPress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  }
});
