import { useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, type ScrollViewInstance } from "react-native";

import { theme } from "@/theme";

type Option<V> = { value: V; label: string; disabled?: boolean };

type Props<V> = {
  /** The accessible name of the row ("Formato"). */
  label: string;
  options: readonly Option<V>[];
  value: V;
  onChange: (value: V) => void;
  /** "onPrimary" on the orange card of "Ventas por tipo" (spec 007): dark chips, the chosen one violet. */
  tone?: "primary" | "onPrimary";
};

// Single-choice chips in a row that scrolls sideways inside the page, as the Shop filters of the Figma
// (spec 003, RF-27; the page itself never scrolls sideways). The chosen chip is filled with the
// primary color. 34 pt drawn, with 7 pt of touch slop above and below to reach 48 pt. A disabled
// option (spec 004: a full slot, a day without slots) says why in its label and ignores taps.
export function FilterChips<V extends string | number | null>({
  label,
  options,
  value,
  onChange,
  tone = "primary",
}: Props<V>) {
  const onPrimary = tone === "onPrimary";
  // Spec 009 (T6): a long row (35 hours) starts where the chosen chip is, once, so a choice far to the
  // right is seen without scrolling; later choices are made by the finger, which already sees them.
  const row = useRef<ScrollViewInstance>(null);
  const scrolled = useRef(false);
  return (
    <ScrollView
      ref={row}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={styles.row}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const disabled = option.disabled ?? false;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onLayout={
              selected
                ? (event) => {
                    if (scrolled.current) return;
                    scrolled.current = true;
                    const x = event.nativeEvent.layout.x - theme.spacing.xl;
                    row.current?.scrollTo({ x: Math.max(0, x), animated: false });
                  }
                : undefined
            }
            hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.chip,
              onPrimary && styles.chipOnPrimary,
              selected && (onPrimary ? styles.selectedOnPrimary : styles.selected),
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.text, onPrimary && styles.textOnPrimary, selected && styles.selectedText]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  selected: {
    backgroundColor: theme.colors.primary,
  },
  chipOnPrimary: {
    backgroundColor: theme.colors.primaryShade,
  },
  // White on accent: 4.69:1, as the Figma's violet "Mes".
  selectedOnPrimary: {
    backgroundColor: theme.colors.accent,
  },
  // The chip keeps its fill and the text its contrast: the label already says why it is disabled.
  disabled: {
    backgroundColor: theme.colors.overlay,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  textOnPrimary: {
    color: theme.colors.text,
  },
  selectedText: {
    color: theme.colors.text,
    fontWeight: theme.typography.weights.semibold,
  },
});
