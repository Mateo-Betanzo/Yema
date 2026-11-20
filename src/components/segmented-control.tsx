import { Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "@/theme";

type Option<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  options: readonly Option<V>[];
  value: V;
  onChange: (value: V) => void;
};

// A two-option pill, as the "Resumen / Historial" switch of the Figma (spec 003: "Productos · Stock",
// RF-25). The chosen option is filled with the primary color. Tabs for the screen reader.
export function SegmentedControl<V extends string>({ options, value, onChange }: Props<V>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            style={({ pressed }) => [styles.option, selected && styles.selected, pressed && !selected && styles.pressed]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
  },
  option: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: {
    backgroundColor: theme.colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  selectedLabel: {
    color: theme.colors.text,
    fontWeight: theme.typography.weights.semibold,
  },
});
