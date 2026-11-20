import { Alert, type AlertButton } from "react-native";

/**
 * The "⋮" menu of a card (Productos, Tipos y formatos and the delivery schedule: spec 003, RF-44; spec 009,
 * RF-18, RF-26): the system Alert with its options, "Cancelar" last. Android shows at most three buttons
 * (React Native, Alert.js), so "Cancelar" does not appear there: the menu is cancelable, so tapping outside
 * it or "atrás" closes it without doing anything (impeccable harden, 2026-11-19).
 */
export function openRowMenu(title: string, options: AlertButton[]) {
  Alert.alert(title, undefined, options, { cancelable: true });
}
