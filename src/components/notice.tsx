import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, Text, View } from "react-native";

import { theme } from "@/theme";

// A notice that stays on the screen while something is true, such as "Ya tenés un pedido en curso" in
// the Shop (spec 004, RF-36). Text with an information icon and a primary border, like the errors but
// not an error: nothing failed, the client just cannot buy now.
export function Notice({ message }: { message: string }) {
  return (
    <View style={styles.notice} accessible accessibilityLabel={message}>
      <Feather name="info" size={20} color={theme.colors.text} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.overlay,
  },
  text: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
});
