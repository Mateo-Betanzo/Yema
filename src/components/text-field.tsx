import Feather from "@expo/vector-icons/Feather";
import { useState, type Ref } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";

import { Icon } from "@/components/icon";
import { theme } from "@/theme";

type Props = Omit<TextInputProps, "style" | "secureTextEntry" | "accessibilityLabel"> & {
  /** Read by the screen reader (the Figma only shows placeholders). */
  label: string;
  error?: string;
  /** A password: hidden, with a button to show it. */
  password?: boolean;
  ref?: Ref<TextInputInstance>;
};

// A pill field as in docs/design/auth.png (spec 002). The error goes below, with an icon and the
// primary border: never in primary text, which does not reach 4.5:1 on the background.
export function TextField({ label, error, password = false, ref, onFocus, onBlur, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.container}>
      <View style={[styles.field, (focused || error) && styles.fieldHighlighted]}>
        <TextInput
          ref={ref}
          {...input}
          accessibilityLabel={label}
          accessibilityHint={error}
          secureTextEntry={password && !visible}
          placeholderTextColor={theme.colors.textSecondary}
          selectionColor={theme.colors.primary}
          style={styles.input}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            hitSlop={theme.spacing.sm}
            onPress={() => setVisible(!visible)}
            style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
          >
            <Icon name={visible ? "eye" : "eye-closed"} size={24} color={theme.colors.textSecondary} />
          </Pressable>
        )}
      </View>
      {error ? (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={14} color={theme.colors.primary} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const FIELD_HEIGHT = 56;

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  field: {
    minHeight: FIELD_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radii.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.fieldBorder,
    backgroundColor: theme.colors.black,
    paddingLeft: theme.spacing.xl,
  },
  fieldHighlighted: {
    borderColor: theme.colors.primary,
  },
  input: {
    flex: 1,
    minHeight: FIELD_HEIGHT,
    paddingRight: theme.spacing.xl,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  eye: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.xs,
  },
  pressed: {
    opacity: 0.6,
  },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
  },
});
