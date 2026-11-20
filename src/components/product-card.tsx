import { Pressable, StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/components/primary-button";
import { theme } from "@/theme";

type Props = {
  title: string;
  /** The price, formatted ("$10.500"). */
  price: string;
  /** "Quedan N" or "Sin stock" (spec 004, RF-5), in text. */
  remaining: string;
  /** Opens the detail of the product (spec 003, RF-29). */
  onOpen: () => void;
  /** "Agregar": one unit to the cart (spec 004, RF-8); the Shop applies the limits. */
  onBuy: () => void;
  /** No stock or an active order (spec 004, RF-10 and RF-36). */
  buyDisabled?: boolean;
  /** "Tu más comprado": the whole width, violet and white as the highlighted row of the Figma. */
  wide?: boolean;
};

// A product of the Shop grid (/feature 2026-11-18; the Figma has a list, deviation in MEMORY.md): the name,
// the price and the units left are one button that opens the detail, and "Agregar" sits below, as wide as
// the card, on its own so a screen reader reaches it apart. No egg image (spec 003, RF-31 as changed on
// 2026-11-18) and no description: both live in the detail. "Agregar" is the pill of the app and the card follows it:
// its radius is the one of the button (half its 56 pt) plus the padding, so both curves run parallel. The
// texts sit one padding further in, clear of the round top corners. In a row of the grid the cards stretch
// to the same height and "Agregar" stays at the bottom.
export function ProductCard({
  title,
  price,
  remaining,
  onOpen,
  onBuy,
  buyDisabled = false,
  wide = false,
}: Props) {
  return (
    <View testID={wide ? "product-card-wide" : "product-card"} style={[styles.card, wide && styles.cardWide]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, price, remaining].join(", ")}
        onPress={onOpen}
        style={({ pressed }) => [styles.texts, pressed && styles.pressed]}
      >
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.price}>{price}</Text>
        <Text style={[styles.secondary, wide && styles.onViolet]}>{remaining}</Text>
      </Pressable>
      <PrimaryButton
        title="Agregar"
        accessibilityLabel={`Agregar ${title}`}
        variant={wide ? "light" : "primary"}
        disabled={buyDisabled}
        onPress={onBuy}
      />
    </View>
  );
}

// Half the 56 pt of PrimaryButton (a pill) plus the padding: 28 + 12.
const BUTTON_HEIGHT = 56;
const CARD_PADDING = theme.spacing.md;
const CARD_RADIUS = BUTTON_HEIGHT / 2 + CARD_PADDING;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    justifyContent: "space-between",
    gap: theme.spacing.lg,
    padding: CARD_PADDING,
    borderRadius: CARD_RADIUS,
    backgroundColor: theme.colors.surface,
  },
  // The highlighted row of the Figma: violet with white texts (4.69:1) and a white "Agregar".
  cardWide: {
    flex: 0,
    backgroundColor: theme.colors.accent,
  },
  onViolet: {
    color: theme.colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  // One more padding on the sides and on top: 24 pt from the edge, inside the curve of a 40 pt corner.
  texts: {
    gap: theme.spacing.xs,
    paddingHorizontal: CARD_PADDING,
    paddingTop: CARD_PADDING,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  price: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  // textSecondary on surface: 4.94:1.
  secondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
});
