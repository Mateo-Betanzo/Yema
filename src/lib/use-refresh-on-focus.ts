// Refreshes a query each time its screen gains focus again (spec 004, RF-6): tabs stay mounted, so
// coming back to the Shop would otherwise show the data of the first visit. The first focus is skipped
// because the query has just loaded. The pattern of the TanStack Query guide for React Native, with
// useFocusEffect of expo-router (SDK 58: it runs on every focus and wants a memoized callback).
import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

export function useRefreshOnFocus(refetch: () => unknown) {
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
