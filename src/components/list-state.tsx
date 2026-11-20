import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { theme } from "@/theme";

type Props = {
  loading: boolean;
  /** The message when the list could not load, or null. */
  error: string | null;
  /** The message when there is nothing to show, or null. */
  empty: string | null;
  onRetry: () => void;
  children: ReactNode;
};

// Loading, error (with "Reintentar") and empty states for every list (spec 003, RF-30). Otherwise it
// shows the list.
export function ListState({ loading, error, empty, onRetry, children }: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Cargando" color={theme.colors.text} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.message} accessibilityRole="alert">
          {error}
        </Text>
        <PrimaryButton title="Reintentar" variant="outline" onPress={onRetry} />
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{empty}</Text>
      </View>
    );
  }
  return children;
}

const styles = StyleSheet.create({
  center: {
    paddingVertical: theme.spacing.huge,
    gap: theme.spacing.lg,
    alignItems: "stretch",
    justifyContent: "center",
  },
  message: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
    textAlign: "center",
  },
});
