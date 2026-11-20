import { theme } from "@/theme";

/**
 * The Stack options of the menu of the Perfil (ProfileMenu), for each role's _layout.tsx: the native
 * sheet, as tall as its options (animate-expo: a sheet that is its own destination is a formSheet); with
 * "Reduce motion", it appears and goes away without sliding (spec 010, RF-19; spec 011, RF-4). Apart from
 * ProfileMenu so a layout does not load the session.
 */
export function profileMenuOptions(reduced: boolean) {
  return {
    presentation: "formSheet",
    sheetAllowedDetents: "fitToContents",
    sheetGrabberVisible: true,
    sheetCornerRadius: theme.radii.xl,
    contentStyle: { backgroundColor: theme.colors.overlay },
    animation: reduced ? "none" : "default",
  } as const;
}
