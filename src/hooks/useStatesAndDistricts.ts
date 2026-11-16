import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface PlaceOption {
  id: number;
  name: string;
}

/**
 * The State and District pickers' lists: the active rows of the `states` and
 * `districts` tables. The cart's delivery form and the edit-order popup both
 * read them through here, so an order is corrected from exactly the choices it
 * was placed with.
 *
 * The states are fetched once per page load and shared. Districts follow the
 * state passed in, matched without regard to case or stray spaces -- a state
 * carried in from an old order as "tamil nadu " still finds its districts.
 *
 * Districts are de-duplicated by name: the table holds a few twice (Coimbatore,
 * Madurai, Mysuru, Bengaluru Urban), and a picker offering the same place twice
 * only invites the question of which one is right.
 */

let statesRequest: Promise<PlaceOption[]> | null = null;

function loadStates(): Promise<PlaceOption[]> {
  statesRequest ??= (async () => {
    const { data, error } = await supabase
      .from("states")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (error) {
      // Not cached, so the next form to open tries again.
      statesRequest = null;
      throw error;
    }
    return (data || []) as PlaceOption[];
  })();
  return statesRequest;
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export function useStatesAndDistricts(stateName: string) {
  const [states, setStates] = useState<PlaceOption[]>([]);
  const [districts, setDistricts] = useState<PlaceOption[]>([]);

  useEffect(() => {
    let live = true;
    loadStates()
      .then((rows) => live && setStates(rows))
      .catch((error) => console.error("Failed to load states:", error));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    // Cleared at once, so a district list never sits under the wrong state
    // while the new one loads.
    setDistricts([]);
    const state = stateName.trim()
      ? states.find((s) => sameName(s.name, stateName))
      : undefined;
    if (!state) return;
    let live = true;
    (async () => {
      const { data, error } = await supabase
        .from("districts")
        .select("id, name")
        .eq("state_id", state.id)
        .eq("is_active", true)
        .order("name");
      if (error) {
        console.error("Failed to load districts:", error);
        return;
      }
      if (!live) return;
      const seen = new Set<string>();
      setDistricts(
        ((data || []) as PlaceOption[]).filter((d) => {
          const key = d.name.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
    })();
    return () => {
      live = false;
    };
  }, [stateName, states]);

  return {
    states,
    districts,
    /** The list's own spelling of a state, or undefined if it is not in the list. */
    canonicalState: (name: string) => states.find((s) => sameName(s.name, name))?.name,
    /** The list's own spelling of a district of the current state. */
    canonicalDistrict: (name: string) =>
      districts.find((d) => sameName(d.name, name))?.name,
  };
}
