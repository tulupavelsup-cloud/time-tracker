/**
 * Точка входа слоя данных. Компоненты импортируют ТОЛЬКО отсюда
 * (или из подмодулей src/api/*), сырых запросов supabase в UI быть не должно.
 *
 * Демо-режим: при ?demo=1 в URL все функции подменяются in-memory моком
 * (src/api/demo.ts) с теми же сигнатурами — без Supabase и без логина.
 * Реальный код-путь не меняется.
 */

import * as realAuth from './auth';
import * as realCategories from './categories';
import * as realTasks from './tasks';
import * as realSessions from './sessions';
import * as realAdjust from './adjust';
import * as realEdits from './edits';
import * as realStats from './stats';
import * as demo from './demo';

export * from './types';

/** true — приложение открыто с ?demo=1: работаем на моке, без Supabase. */
export const IS_DEMO: boolean =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('demo') === '1';

export const signUp = IS_DEMO ? demo.signUp : realAuth.signUp;
export const signIn = IS_DEMO ? demo.signIn : realAuth.signIn;
export const signOut = IS_DEMO ? demo.signOut : realAuth.signOut;
export const getUser = IS_DEMO ? demo.getUser : realAuth.getUser;
export const onAuthStateChange = IS_DEMO ? demo.onAuthStateChange : realAuth.onAuthStateChange;
export const requestPasswordReset = IS_DEMO ? demo.requestPasswordReset : realAuth.requestPasswordReset;
export const setNewPassword = IS_DEMO ? demo.setNewPassword : realAuth.setNewPassword;

export const getCategories = IS_DEMO ? demo.getCategories : realCategories.getCategories;
export const createCategory = IS_DEMO ? demo.createCategory : realCategories.createCategory;
export const updateCategory = IS_DEMO ? demo.updateCategory : realCategories.updateCategory;
export const archiveCategory = IS_DEMO ? demo.archiveCategory : realCategories.archiveCategory;

export const getTasks = IS_DEMO ? demo.getTasks : realTasks.getTasks;
export const createTask = IS_DEMO ? demo.createTask : realTasks.createTask;
export const updateTask = IS_DEMO ? demo.updateTask : realTasks.updateTask;
export const archiveTask = IS_DEMO ? demo.archiveTask : realTasks.archiveTask;

export const startSession = IS_DEMO ? demo.startSession : realSessions.startSession;
export const stopSession = IS_DEMO ? demo.stopSession : realSessions.stopSession;
export const getActiveSession = IS_DEMO ? demo.getActiveSession : realSessions.getActiveSession;
export const getLastSession = IS_DEMO ? demo.getLastSession : realSessions.getLastSession;
export const closeStaleSession = IS_DEMO ? demo.closeStaleSession : realSessions.closeStaleSession;

export const addTime = IS_DEMO ? demo.addTime : realAdjust.addTime;
export const subtractTime = IS_DEMO ? demo.subtractTime : realAdjust.subtractTime;
export const getDayInfo = IS_DEMO ? demo.getDayInfo : realAdjust.getDayInfo;
export const undoTimeEdit = IS_DEMO ? demo.undoTimeEdit : realAdjust.undoTimeEdit;
export const listTimeEdits = IS_DEMO ? demo.listTimeEdits : realEdits.listTimeEdits;
export const isEditLogAvailable = IS_DEMO ? demo.isEditLogAvailable : realEdits.isEditLogAvailable;

export const getCategoryTotals = IS_DEMO ? demo.getCategoryTotals : realStats.getCategoryTotals;
export const getTaskTotals = IS_DEMO ? demo.getTaskTotals : realStats.getTaskTotals;
export const getTodayTotals = IS_DEMO ? demo.getTodayTotals : realStats.getTodayTotals;
export const getStats = IS_DEMO ? demo.getStats : realStats.getStats;
