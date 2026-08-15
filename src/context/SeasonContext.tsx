import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { Database } from "../types/supabase";

export type Season = Database["public"]["Tables"]["seasons"]["Row"];

interface SeasonContextType {
  seasons: Season[];
  /** The season the storefront sells from. Exactly one, enforced by the DB. */
  activeSeason: Season | null;
  /** The season admin screens are currently working in. Defaults to active. */
  selectedSeason: Season | null;
  selectedSeasonId: string | null;
  setSelectedSeasonId: (id: string) => void;
  /** True when the selected season is closed and not unlocked by a superadmin. */
  isSelectedReadOnly: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const SeasonContext = createContext<SeasonContextType | undefined>(undefined);

const STORAGE_KEY = "swc.selectedSeasonId";

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSeasons = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("seasons")
        .select("*")
        .order("start_date", { ascending: false });

      if (err) throw err;
      setSeasons(data || []);
      setError(null);
    } catch (e) {
      console.error("Error loading seasons:", e);
      setError(e instanceof Error ? e.message : "Failed to load seasons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeasons();

    // A season being activated or closed changes what every screen shows,
    // so keep it live rather than requiring a reload.
    const channel = supabase
      .channel("seasons-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seasons" },
        () => fetchSeasons()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSeasons]);

  const activeSeason = useMemo(
    () => seasons.find((s) => s.status === "active") || null,
    [seasons]
  );

  // Discard a RESTORED selection that points at a closed season, once, when
  // the season list first loads. Reopening Stock Management in a read-only
  // archive days later helps nobody.
  //
  // This only affects the value restored from storage — selecting a closed
  // season during the session still works, which is how archives are viewed.
  // A stored DRAFT is kept: that is deliberate work on next season's catalog.
  const sanitisedRestore = useRef(false);
  useEffect(() => {
    if (sanitisedRestore.current || loading || seasons.length === 0) return;
    sanitisedRestore.current = true;

    if (!selectedSeasonId) return;
    const stored = seasons.find((s) => s.id === selectedSeasonId);
    if (!stored || stored.status === "closed") {
      setSelectedSeasonIdState(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [loading, seasons, selectedSeasonId]);

  // Fall back to the active season when nothing is stored, or when the stored
  // id points at a season that no longer exists.
  const selectedSeason = useMemo(() => {
    if (selectedSeasonId) {
      const found = seasons.find((s) => s.id === selectedSeasonId);
      if (found) return found;
    }
    return activeSeason;
  }, [seasons, selectedSeasonId, activeSeason]);

  const setSelectedSeasonId = useCallback((id: string) => {
    setSelectedSeasonIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const isSelectedReadOnly = useMemo(
    () =>
      !!selectedSeason &&
      selectedSeason.status === "closed" &&
      !selectedSeason.is_unlocked,
    [selectedSeason]
  );

  const value: SeasonContextType = {
    seasons,
    activeSeason,
    selectedSeason,
    selectedSeasonId: selectedSeason?.id ?? null,
    setSelectedSeasonId,
    isSelectedReadOnly,
    loading,
    error,
    refresh: fetchSeasons,
  };

  return (
    <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>
  );
}

export function useSeasons() {
  const context = useContext(SeasonContext);
  if (context === undefined) {
    throw new Error("useSeasons must be used within a SeasonProvider");
  }
  return context;
}

/**
 * Season lifecycle operations. Every one is a SECURITY DEFINER function that
 * re-checks the caller's role in the database, so the UI guard is convenience,
 * not the actual boundary.
 */
export function useSeasonActions() {
  const { refresh } = useSeasons();

  const createSeason = async (input: {
    code: string;
    name: string;
    start_date: string;
    end_date: string;
  }) => {
    const { data, error } = await supabase
      .from("seasons")
      .insert({ ...input, status: "draft" })
      .select()
      .single();
    if (error) throw error;
    await refresh();
    return data;
  };

  const updateSeason = async (
    seasonId: string,
    patch: Partial<{
      code: string;
      name: string;
      start_date: string;
      end_date: string;
    }>
  ) => {
    const { error } = await supabase
      .from("seasons")
      .update(patch)
      .eq("id", seasonId);
    if (error) throw error;
    await refresh();
  };

  const copyForward = async (
    sourceSeasonId: string,
    targetSeasonId: string,
    carryStockProductIds: string[]
  ) => {
    const { data, error } = await supabase.rpc("copy_season_products", {
      p_source_season: sourceSeasonId,
      p_target_season: targetSeasonId,
      p_carry_stock_ids: carryStockProductIds,
    });
    if (error) throw error;
    await refresh();
    return data as unknown as number;
  };

  const activateSeason = async (seasonId: string) => {
    const { error } = await supabase.rpc("activate_season", {
      p_season: seasonId,
    });
    if (error) throw error;
    await refresh();
  };

  const closeSeason = async (seasonId: string) => {
    const { error } = await supabase.rpc("close_season", { p_season: seasonId });
    if (error) throw error;
    await refresh();
  };

  const setSeasonUnlocked = async (seasonId: string, unlocked: boolean) => {
    const { error } = await supabase.rpc("set_season_unlocked", {
      p_season: seasonId,
      p_unlocked: unlocked,
    });
    if (error) throw error;
    await refresh();
  };

  return {
    createSeason,
    updateSeason,
    copyForward,
    activateSeason,
    closeSeason,
    setSeasonUnlocked,
  };
}
