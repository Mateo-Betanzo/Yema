import { Image } from "expo-image";

// The app icons: SVGs of assets/svg (Iconoir, 24 × 24 with a 1.5 stroke). expo-image draws them on iOS
// and Android, and tintColor paints every drawn pixel, so the color inside the file does not matter.
// The iOS decoder misdraws some elliptical arcs (`A`): a new file must not use them. Decorative: the
// button around an icon carries the accessible label. The icons without an SVG still use Feather.
// The "G" of Google keeps its four colors (a brand mark, /feature 2026-11-19): it is never tinted.
export const ICONS = {
  calendar: require("@/assets/svg/calendar.svg"),
  cart: require("@/assets/svg/cart.svg"),
  clock: require("@/assets/svg/clock.svg"),
  "edit-pencil": require("@/assets/svg/edit-pencil.svg"),
  eye: require("@/assets/svg/eye.svg"),
  "eye-closed": require("@/assets/svg/eye-closed.svg"),
  google: require("@/assets/svg/google.svg"),
  "home-simple": require("@/assets/svg/home-simple.svg"),
  list: require("@/assets/svg/list.svg"),
  "log-out": require("@/assets/svg/log-out.svg"),
  menu: require("@/assets/svg/menu.svg"),
  minus: require("@/assets/svg/minus.svg"),
  "more-vert": require("@/assets/svg/more-vert.svg"),
  package: require("@/assets/svg/package.svg"),
  plus: require("@/assets/svg/plus.svg"),
  sparks: require("@/assets/svg/sparks.svg"),
  user: require("@/assets/svg/user.svg"),
  "view-grid": require("@/assets/svg/view-grid.svg"),
} as const;

export type IconName = keyof typeof ICONS;

const KEEPS_ITS_COLORS: ReadonlySet<IconName> = new Set(["google"]);

type Props = {
  name: IconName;
  size: number;
  color: string;
};

// Tests find it by `icon:<name>` (with includeHiddenElements, since readers skip it).
export function Icon({ name, size, color }: Props) {
  return (
    <Image
      source={ICONS[name]}
      tintColor={KEEPS_ITS_COLORS.has(name) ? undefined : color}
      style={{ width: size, height: size }}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`icon:${name}`}
    />
  );
}
