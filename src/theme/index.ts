import { colors } from "./colors";
import { radii, screenMargin, spacing } from "./spacing";
import { typography } from "./typography";

// The look of the floating tab bar: the overlay with a surface border. The round buttons of the Perfil
// menu and the cart of the Home share it.
const barSurface = { backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.surface } as const;

export const theme = { colors, spacing, screenMargin, radii, typography, barSurface } as const;

export { barSurface, colors, radii, screenMargin, spacing, typography };
