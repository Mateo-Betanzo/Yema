import { StyleSheet, Text, View } from "react-native";

import { PageScreen } from "@/components/page-screen";
import type { Profile } from "@/lib/session";
import { theme } from "@/theme";

type Props = {
  profile: Profile;
  email: string | null;
  /** Opens the menu of the Perfil (spec 010, RF-16; spec 011, RF-1), where "Cerrar sesión" lives. */
  onMenu: () => void;
};

// Perfil of both roles (spec 002, RF-29). Empty data is left out: the admin may have no phone or address
// (RF-37). Both roles have a round menu button next to the title (the action of the header, as the cart
// of the Home), which opens their menu with "Cerrar sesión" (spec 010 for the client, spec 011 for the
// admin). /feature 2026-11-18: the frame and the title of every other screen (PageScreen and ScreenHeader).
export function ProfileView({ profile, email, onMenu }: Props) {
  const rows: [string, string | null][] = [
    ["Email", email],
    ["Teléfono", profile.phone],
    ["Dirección", profile.address],
    ["Referencias", profile.address_notes],
  ];

  return (
    <PageScreen title="Perfil" back={false} tabRoot action={{ icon: "menu", label: "Abrir menú", onPress: onMenu }}>
      <Text style={styles.name}>{`${profile.first_name} ${profile.last_name}`}</Text>
      <View style={styles.card}>
        {rows
          .filter((row): row is [string, string] => Boolean(row[1]))
          .map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
      </View>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  row: {
    gap: theme.spacing.xs,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
});
