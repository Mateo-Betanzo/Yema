import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "@/components/icon";
import { theme } from "@/theme";

type Props = {
  title: string;
  /** Secondary lines under the title: description, price, units, status… */
  lines: readonly string[];
  /** Something on the right (the "⋮" menu of Products). */
  trailing?: ReactNode;
  /** A product without stock or not visible: its image fades; the texts keep their contrast. */
  dimmed?: boolean;
  /** An amount on the right, part of the button (the total of an order in the history, spec 006). */
  amount?: string;
  /** The amount in grey: an order that was not charged (spec 006, RF-19). */
  amountMuted?: boolean;
  onPress?: () => void;
  /**
   * Spec 009, RF-26, RF-27: with onPress, the whole card is one button with this label ("Opciones de Pack
   * Mediano") and a drawn "⋮" inside, that opens the menu of the row; its lines become its value.
   */
  menuLabel?: string;
};

// A product row, as the cards of Products and Shop in the Figma (spec 003: RF-16, RF-26, RF-31): the
// same egg image for every product (exported from the Figma), the title and its lines. When it can be
// pressed, its image and texts are one button named by its texts.
export function ProductRow({
  title,
  lines,
  trailing,
  dimmed = false,
  amount,
  amountMuted = false,
  onPress,
  menuLabel,
}: Props) {
  const content = (
    <>
      <Image
        testID="egg-image"
        source={require("@/assets/images/egg.png")}
        style={[styles.image, dimmed && styles.dimmed]}
        accessible={false}
      />
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {lines.map((line) => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
      </View>
      {amount ? <Text style={[styles.amount, amountMuted && styles.amountMuted]}>{amount}</Text> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row}>
        {content}
        {trailing}
      </View>
    );
  }
  if (menuLabel) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={menuLabel}
        accessibilityValue={{ text: [...lines, ...(amount ? [amount] : [])].join(", ") }}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {content}
        <Icon name="more-vert" size={24} color={theme.colors.text} />
      </Pressable>
    );
  }
  // The trailing control stays outside the pressable part: inside a button, screen readers would group
  // it with the row and it could not be reached on its own (the "+" of the Shop, spec 004).
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, ...lines, ...(amount ? [amount] : [])].join(", ")}
        onPress={onPress}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
      {trailing}
    </View>
  );
}

const IMAGE_SIZE = 60;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.lg,
  },
  // Only the image fades: fading the texts took the secondary ones below 4.5:1 on the card.
  dimmed: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: theme.radii.lg,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  line: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  amount: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  // textSecondary on surface: 4.94:1.
  amountMuted: {
    color: theme.colors.textSecondary,
  },
});
