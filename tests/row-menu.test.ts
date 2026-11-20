import { Alert } from "react-native";

import { openRowMenu } from "@/components/row-menu";

// The "⋮" menu of every card (spec 003, RF-44; spec 009, RF-18, RF-26): the system Alert. Android shows at
// most three buttons (React Native, Alert.js), so "Cancelar" does not appear there: the menu is cancelable,
// so tapping outside it or "atrás" closes it, as "Cancelar" does on iOS (impeccable harden, 2026-11-19).
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

test("opens the system menu with its options, closable by tapping outside or going back", () => {
  const options = [{ text: "Editar" }, { text: "Cancelar", style: "cancel" as const }];
  openRowMenu("Pack Mediano", options);
  expect(alert).toHaveBeenCalledWith("Pack Mediano", undefined, options, { cancelable: true });
});
