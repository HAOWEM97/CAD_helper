import { describe, expect, it } from 'vitest';
import {
  createInitialUiState,
  RIGHT_PANEL_WIDTH_DEFAULT,
  RIGHT_PANEL_WIDTH_MAX,
  RIGHT_PANEL_WIDTH_MIN,
  setRightPanelWidth,
} from '@/state/slices/uiSlice';
import uiReducer from '@/state/slices/uiSlice';
import {
  createUiStateFromPersisted,
  pickPersistableUiState,
} from '@/services/draft/draftPersistence';

describe('ui state', () => {
  it('stores right panel width with bounds', () => {
    expect(createInitialUiState().rightPanelWidth).toBe(RIGHT_PANEL_WIDTH_DEFAULT);

    let state = uiReducer(undefined, setRightPanelWidth(520));
    expect(state.rightPanelWidth).toBe(520);

    state = uiReducer(state, setRightPanelWidth(100));
    expect(state.rightPanelWidth).toBe(RIGHT_PANEL_WIDTH_MIN);

    state = uiReducer(state, setRightPanelWidth(900));
    expect(state.rightPanelWidth).toBe(RIGHT_PANEL_WIDTH_MAX);
  });

  it('persists and restores right panel width as draft UI state', () => {
    const state = uiReducer(undefined, setRightPanelWidth(456));
    const persisted = pickPersistableUiState(state);

    expect(persisted.rightPanelWidth).toBe(456);
    expect(createUiStateFromPersisted(persisted, createInitialUiState()).rightPanelWidth).toBe(456);
    expect(
      createUiStateFromPersisted({ ...persisted, rightPanelWidth: 999 }, createInitialUiState())
        .rightPanelWidth,
    ).toBe(RIGHT_PANEL_WIDTH_MAX);
  });
});
