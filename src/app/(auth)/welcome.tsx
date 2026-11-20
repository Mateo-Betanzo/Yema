import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { ECLIPSE_OVERLAP, WelcomeEclipse } from "@/components/welcome-eclipse";
import { theme } from "@/theme";

// Welcome (spec 002: RF-1, RF-2), as in the Figma of 2026-11-07: black, with the glowing orange
// crescent above the title and the two actions at the bottom.
export default function Welcome() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <WelcomeEclipse />
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Bienvenido
          </Text>
          <Text style={styles.subtitle}>Iniciá sesión o creá tu cuenta</Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton title="Iniciar sesión" onPress={() => router.push("/login")} />
          <PrimaryButton title="Crear cuenta" variant="outline" onPress={() => router.push("/sign-up")} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.black,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: theme.screenMargin,
    paddingBottom: theme.spacing.huge,
  },
  intro: {
    // The title sits on the lower part of the crescent's black disc, as in the Figma.
    marginTop: -ECLIPSE_OVERLAP,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xxl,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
    textAlign: "center",
  },
  actions: {
    gap: theme.spacing.lg,
  },
});
