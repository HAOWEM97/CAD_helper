import { configureStore } from '@reduxjs/toolkit';
import projectReducer from '@/state/slices/projectSlice';
import uiReducer from '@/state/slices/uiSlice';

export const store = configureStore({
  reducer: {
    project: projectReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
