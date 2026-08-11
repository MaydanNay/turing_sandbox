import { create } from 'zustand';

interface StationMissionState {
  /** Placement ids completed this match (client-only). */
  completedIds: Record<string, true>;
  activePlacementId: string | null;
  toast: string | null;
  open: (placementId: string) => void;
  close: () => void;
  complete: (placementId: string, message?: string) => void;
  isCompleted: (placementId: string) => boolean;
  clearToast: () => void;
  resetMatch: () => void;
}

export const useStationMissionStore = create<StationMissionState>((set, get) => ({
  completedIds: {},
  activePlacementId: null,
  toast: null,
  open: (placementId) => {
    if (get().completedIds[placementId]) return;
    set({ activePlacementId: placementId });
  },
  close: () => set({ activePlacementId: null }),
  complete: (placementId, message) => {
    set((s) => ({
      completedIds: { ...s.completedIds, [placementId]: true },
      activePlacementId: null,
      toast: message ?? 'Станция выполнена',
    }));
  },
  isCompleted: (placementId) => Boolean(get().completedIds[placementId]),
  clearToast: () => set({ toast: null }),
  resetMatch: () =>
    set({ completedIds: {}, activePlacementId: null, toast: null }),
}));
