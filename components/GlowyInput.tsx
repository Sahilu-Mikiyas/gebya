/**
 * GlowyInput — Phase 11-F
 * A TextInput wrapper that shows a green glow border on focus.
 * Web-safe: uses plain state (no Animated) to toggle border + shadow.
 *
 * Usage:
 *   <GlowyInput
 *     value={note}
 *     onChangeText={setNote}
 *     placeholder="Add a note…"
 *   />
 */
import { useState } from 'react';
import {
  TextInput,
  TextInputProps,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Colors } from '@/constants/colors';

interface GlowyInputProps extends TextInputProps {
  containerStyle?: StyleProp<ViewStyle>;
}

export default function GlowyInput({
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...rest
}: GlowyInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...rest}
      style={[
        styles.base,
        style,
        focused && styles.focused,
      ]}
      placeholderTextColor={Colors.t5}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.s2,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    12,
    paddingHorizontal: 14,
    paddingVertical:   13,
    color:           Colors.t1,
    fontSize:        14,
  },
  focused: {
    borderColor:   Colors.veggie + '80',
    shadowColor:   Colors.veggie,
    shadowOpacity: 0.15,
    shadowRadius:  8,
    shadowOffset:  { width: 0, height: 0 },
    elevation:     0,
  },
});
