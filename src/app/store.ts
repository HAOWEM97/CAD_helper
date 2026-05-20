import { configureStore } from '@reduxjs/toolkit';
import projectReducer from '@/state/slices/projectSlice';
import uiReducer, { createInitialUiState } from '@/state/slices/uiSlice';
import {
  createUiStateFromPersisted,
  loadPersistedDraft,
  pickPersistableUiState,
  savePersistedDraft,
} from '@/services/draft/draftPersistence';

const persistedDraft = loadPersistedDraft();

export const store = configureStore({
  reducer: {
    project: projectReducer,
    ui: uiReducer,
  },
  preloadedState: persistedDraft
    ? {
        project: {
          current: persistedDraft.project,
        },
        ui: createUiStateFromPersisted(persistedDraft.ui, createInitialUiState()),
      }
    : undefined,
});

if (typeof window !== 'undefined') {
  let saveTimer: number | undefined;

  store.subscribe(() => {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer);
    }

    saveTimer = window.setTimeout(() => {
      const state = store.getState();
      savePersistedDraft(state.project.current, pickPersistableUiState(state.ui));
    }, 250);
  });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
