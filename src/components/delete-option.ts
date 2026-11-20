import { Alert, type AlertButton } from "react-native";

import { catalogErrorMessage } from "@/logic/catalog-errors";

/**
 * "Eliminar" of the "⋮" menus of Productos and Tipos y formatos (spec 003, RF-44 to RF-49, cambio del
 * RF-34) and of the delivery schedule (spec 009, cambio del 2026-11-19, RF-20 to RF-22): destructive, last
 * before "Cancelar". It always asks "¿Eliminar <nombre>? No se puede deshacer." (the archive is final);
 * when the base refuses, it says why with the messages of its list (`message`, the catalog's by default).
 */
export function deleteOption(
  name: string,
  remove: () => Promise<unknown>,
  message: (error: unknown) => string = catalogErrorMessage,
): AlertButton {
  return {
    text: "Eliminar",
    style: "destructive",
    onPress: () =>
      Alert.alert(`¿Eliminar ${name}?`, "No se puede deshacer.", [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              await remove();
            } catch (error) {
              Alert.alert("No se pudo eliminar", message(error));
            }
          },
        },
      ]),
  };
}
