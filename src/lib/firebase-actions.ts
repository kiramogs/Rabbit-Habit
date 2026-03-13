import { endOfDay, endOfWeek, isAfter, isBefore, startOfDay, startOfWeek, subWeeks } from "date-fns";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  linkWithPopup,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithCredential,
  signInWithRedirect,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { z } from "zod";

import { createDefaultHabitRabbitState } from "@/lib/default-state";
import { auth, firestore } from "@/lib/firebase";
import { validateHabitChange } from "@/lib/habit-validation";
import {
  clamp,
  EXTRA_SCORE_AT_FULL_HEALTH,
  fromIsoDay,
  LEVEL_SCORE_CAP,
  SCORE_PER_COMPLETION,
  toIsoDay,
} from "@/lib/habit-rabbit";
import type { HabitRabbitState, HabitState } from "@/lib/data";
import { AppMode, HabitPriority, MoodType, RoomType } from "@/lib/types";

const DOCUMENT_SCHEMA_VERSION = 1;
const DEFAULT_RABBIT_NAME = "Study Bunny";

type StoredAccountState = {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  providerIds: string[];
  isAnonymous: boolean;
};

type StoredHabitRabbitDocument = HabitRabbitState & {
  ownerUid: string;
  schemaVersion: number;
  account: StoredAccountState;
  createdAt: unknown;
  updatedAt: unknown;
};

export type AuthViewState = {
  status: "loading" | "signed_out" | "ready";
  uid: string | null;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

const completeHabitInput = z.object({
  habitId: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const moodInput = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.enum(Object.values(MoodType)),
});

const roomInput = z.object({
  room: z.enum(Object.values(RoomType)),
});

const modeInput = z.object({
  mode: z.enum(Object.values(AppMode)),
});

const itemPurchaseInput = z.object({
  itemKey: z.string().min(1),
});

const itemToggleInput = z.object({
  userItemId: z.string().min(1),
});

const habitFieldsInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(180).optional(),
  targetPerWeek: z.number().int().min(1).max(7),
  priority: z.enum(Object.values(HabitPriority)),
});

const createHabitInput = habitFieldsInput;

const updateHabitInput = habitFieldsInput.extend({
  habitId: z.string().min(1),
});

const deleteHabitInput = z.object({
  habitId: z.string().min(1),
});

function cloneState(state: HabitRabbitState): HabitRabbitState {
  return {
    profile: { ...state.profile },
    habits: state.habits.map((habit) => ({ ...habit })),
    completions: state.completions.map((completion) => ({ ...completion })),
    moods: state.moods.map((mood) => ({ ...mood })),
    storeItems: state.storeItems.map((item) => ({ ...item })),
    userItems: state.userItems.map((item) => ({ ...item })),
  };
}

function sortHabits(habits: HabitState[]) {
  return [...habits]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((habit, index) => ({ ...habit, sortOrder: index + 1 }));
}

function colorForPriority(priority: HabitPriority) {
  if (priority === HabitPriority.HIGH) return "#ff0000";
  if (priority === HabitPriority.MEDIUM) return "#f59e0b";
  return "#d9d900";
}

function normalizeState(value: unknown): HabitRabbitState {
  const fallback = createDefaultHabitRabbitState();
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const partial = value as Partial<HabitRabbitState>;
  return {
    profile: { ...fallback.profile, ...(partial.profile ?? {}) },
    habits: Array.isArray(partial.habits) ? partial.habits.map((habit) => ({ ...habit })) : fallback.habits,
    completions: Array.isArray(partial.completions)
      ? partial.completions.map((completion) => ({ ...completion }))
      : fallback.completions,
    moods: Array.isArray(partial.moods) ? partial.moods.map((mood) => ({ ...mood })) : fallback.moods,
    storeItems: Array.isArray(partial.storeItems)
      ? partial.storeItems.map((item) => ({ ...item }))
      : fallback.storeItems,
    userItems: Array.isArray(partial.userItems)
      ? partial.userItems.map((item) => ({ ...item }))
      : fallback.userItems,
  };
}

function getHabitRabbitDocRef(uid: string) {
  return doc(firestore, "users", uid, "apps", "habit-rabbit");
}

let authPersistencePromise: Promise<void> | null = null;
let anonymousSignInPromise: Promise<User> | null = null;

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toStoredAccount(user: User): StoredAccountState {
  const providerIds = user.providerData
    .map((provider) => provider.providerId)
    .filter((providerId): providerId is string => Boolean(providerId));

  return {
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    providerIds: providerIds.length > 0 ? providerIds : [user.isAnonymous ? "anonymous" : "firebase"],
    isAnonymous: user.isAnonymous,
  };
}

function buildDocumentMetadata(user: User) {
  return {
    ownerUid: user.uid,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    account: toStoredAccount(user),
    updatedAt: serverTimestamp(),
  };
}

function buildStoredDocument(
  user: User,
  state: HabitRabbitState,
  existingRaw?: unknown
): StoredHabitRabbitDocument {
  const existing = asRecord(existingRaw);

  return {
    ...cloneState(state),
    ...buildDocumentMetadata(user),
    createdAt: existing && "createdAt" in existing ? existing.createdAt : serverTimestamp(),
  };
}

function needsDocumentMetadataSync(raw: unknown, user: User) {
  const existing = asRecord(raw);
  if (!existing) {
    return true;
  }

  const nextAccount = toStoredAccount(user);
  const existingAccount = asRecord(existing.account);
  const existingProviderIds = Array.isArray(existingAccount?.providerIds)
    ? existingAccount.providerIds.filter((providerId): providerId is string => typeof providerId === "string")
    : [];

  return (
    existing.ownerUid !== user.uid ||
    existing.schemaVersion !== DOCUMENT_SCHEMA_VERSION ||
    existingAccount?.displayName !== nextAccount.displayName ||
    existingAccount?.email !== nextAccount.email ||
    existingAccount?.photoURL !== nextAccount.photoURL ||
    existingAccount?.isAnonymous !== nextAccount.isAnonymous ||
    existingProviderIds.join("|") !== nextAccount.providerIds.join("|")
  );
}

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({
    prompt: "select_account",
  });
  return provider;
}

async function startGoogleSignIn(provider: GoogleAuthProvider) {
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String(error.code) : "";

    if (code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
      return null;
    }

    throw error;
  }
}

function normalizeHabitIdentity(habit: HabitState) {
  return [
    habit.name.trim().toLowerCase(),
    (habit.description ?? "").trim().toLowerCase(),
    habit.targetPerWeek,
    habit.priority,
  ].join("|");
}

function mergeHabitRabbitStates(existingState: HabitRabbitState | null, incomingState: HabitRabbitState) {
  if (!existingState) {
    return cloneState(incomingState);
  }

  const merged = cloneState(existingState);
  const habitIdMap = new Map<string, string>();
  const nextHabits = [...merged.habits];
  const signatures = new Map<string, HabitState>();

  for (const habit of nextHabits) {
    signatures.set(normalizeHabitIdentity(habit), habit);
  }

  for (const incomingHabit of incomingState.habits) {
    const signature = normalizeHabitIdentity(incomingHabit);
    const existingHabit = signatures.get(signature);
    if (existingHabit) {
      habitIdMap.set(incomingHabit.id, existingHabit.id);
      continue;
    }

    const appended = {
      ...incomingHabit,
      sortOrder: nextHabits.length + 1,
    };
    nextHabits.push(appended);
    signatures.set(signature, appended);
    habitIdMap.set(incomingHabit.id, appended.id);
  }

  merged.habits = sortHabits(nextHabits);

  const completionKeys = new Set(
    merged.completions.map((completion) => `${completion.habitId}:${completion.day}`)
  );

  for (const incomingCompletion of incomingState.completions) {
    const mappedHabitId = habitIdMap.get(incomingCompletion.habitId) ?? incomingCompletion.habitId;
    const key = `${mappedHabitId}:${incomingCompletion.day}`;
    if (completionKeys.has(key)) {
      continue;
    }
    completionKeys.add(key);
    merged.completions.push({
      habitId: mappedHabitId,
      day: incomingCompletion.day,
    });
  }

  const moodDays = new Set(merged.moods.map((mood) => mood.day));
  for (const incomingMood of incomingState.moods) {
    if (moodDays.has(incomingMood.day)) {
      continue;
    }
    moodDays.add(incomingMood.day);
    merged.moods.push(incomingMood);
  }

  const ownedKeys = new Set(merged.userItems.map((item) => item.itemKey));
  for (const incomingItem of incomingState.userItems) {
    if (ownedKeys.has(incomingItem.itemKey)) {
      continue;
    }
    ownedKeys.add(incomingItem.itemKey);
    merged.userItems.push(incomingItem);
  }

  merged.profile = {
    ...merged.profile,
    rabbitName:
      merged.profile.rabbitName && merged.profile.rabbitName !== DEFAULT_RABBIT_NAME
        ? merged.profile.rabbitName
        : incomingState.profile.rabbitName,
    rabbitHealth: Math.max(merged.profile.rabbitHealth, incomingState.profile.rabbitHealth),
    energy: Math.max(merged.profile.energy, incomingState.profile.energy),
    carrots: Math.max(merged.profile.carrots, incomingState.profile.carrots),
    level: Math.max(merged.profile.level, incomingState.profile.level),
  };

  return merged;
}

function toAuthViewState(user: User | null): AuthViewState {
  if (!user) {
    return {
      status: "signed_out",
      uid: null,
      isAnonymous: false,
      displayName: null,
      email: null,
      photoURL: null,
    };
  }

  return {
    status: "ready",
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

async function ensureAuthPersistence() {
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence)
      .then(() => undefined)
      .catch((error) => {
        authPersistencePromise = null;
        throw error;
      });
  }

  return authPersistencePromise;
}

async function ensureAuthReady() {
  await ensureAuthPersistence();
  await auth.authStateReady();
}

async function signInAnonymouslyOnce() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (!anonymousSignInPromise) {
    anonymousSignInPromise = signInAnonymously(auth)
      .then(({ user }) => user)
      .finally(() => {
        anonymousSignInPromise = null;
      });
  }

  return anonymousSignInPromise;
}

async function ensureAuthenticatedUser() {
  await ensureAuthReady();

  if (auth.currentUser) {
    return auth.currentUser;
  }

  throw new Error("Start a session before updating your data.");
}

async function readStoredState(uid: string) {
  const snapshot = await getDoc(getHabitRabbitDocRef(uid));
  if (!snapshot.exists()) {
    return null;
  }

  const raw = snapshot.data();
  return {
    raw,
    state: normalizeState(raw),
  };
}

async function seedUserDocument(user: User, preferredState?: HabitRabbitState) {
  const seeded = cloneState(preferredState ?? createDefaultHabitRabbitState());
  await setDoc(getHabitRabbitDocRef(user.uid), buildStoredDocument(user, seeded));
  return seeded;
}

async function ensureUserDocument(user: User, preferredState?: HabitRabbitState) {
  const existing = await readStoredState(user.uid);
  if (existing) {
    return existing.state;
  }

  return seedUserDocument(user, preferredState);
}

async function syncUserDocumentMetadata(user: User) {
  const existing = await readStoredState(user.uid);
  if (!existing) {
    return null;
  }

  if (!needsDocumentMetadataSync(existing.raw, user)) {
    return existing.state;
  }

  await setDoc(getHabitRabbitDocRef(user.uid), buildDocumentMetadata(user), { merge: true });
  return existing.state;
}

async function mergeIntoUserDocument(user: User, incomingState: HabitRabbitState) {
  const existing = await readStoredState(user.uid);
  const mergedState = mergeHabitRabbitStates(existing?.state ?? null, incomingState);
  await setDoc(getHabitRabbitDocRef(user.uid), buildStoredDocument(user, mergedState, existing?.raw));
  return mergedState;
}

function countHabitWeekCompletions(state: HabitRabbitState, habitId: string, day: string) {
  const date = fromIsoDay(day);
  const weekStart = toIsoDay(startOfWeek(date, { weekStartsOn: 0 }));
  const weekEnd = toIsoDay(endOfWeek(date, { weekStartsOn: 0 }));

  return state.completions.filter(
    (completion) =>
      completion.habitId === habitId &&
      completion.day >= weekStart &&
      completion.day <= weekEnd
  ).length;
}

function transactionError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to sync your update.";
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "";

  if (message.includes("Cloud Firestore API has not been used")) {
    return "Firestore is not enabled for project wtf-4ad8e yet. Enable the Firestore API and Firestore Database in Firebase Console.";
  }

  if (code === "permission-denied") {
    return "This session does not have permission to access your data. Check Firestore rules and sign in again.";
  }

  if (code === "auth/operation-not-allowed" || code === "auth/configuration-not-found") {
    return "Firebase Authentication is not fully enabled yet. Turn on Anonymous and Google sign-in in Firebase Authentication.";
  }

  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized for Google sign-in. Add it in Firebase Authentication settings.";
  }

  if (code === "auth/popup-blocked") {
    return "The Google sign-in popup was blocked. Allow popups for this site and try again.";
  }

  if (code === "auth/popup-closed-by-user") {
    return "Google sign-in was cancelled before it finished.";
  }

  if (code === "auth/cancelled-popup-request") {
    return "Another Google sign-in request replaced the first popup. Try again.";
  }

  if (code === "auth/network-request-failed") {
    return "Network error while talking to Firebase. Check your connection and try again.";
  }

  return message;
}

export function subscribeToHabitRabbitState(
  onState: (state: HabitRabbitState) => void,
  onError?: (message: string) => void,
  onAuthChange?: (authState: AuthViewState) => void
) {
  let unsubscribeAuth = () => {};
  let unsubscribeSnapshot = () => {};
  let active = true;

  ensureAuthPersistence()
    .then(() => {
      unsubscribeAuth = onAuthStateChanged(
        auth,
        async (user) => {
          unsubscribeSnapshot();

          if (!active) {
            return;
          }

          if (!user) {
            onAuthChange?.(toAuthViewState(null));
            return;
          }

          onAuthChange?.(toAuthViewState(user));
          void syncUserDocumentMetadata(user).catch((error) => {
            if (active) {
              onError?.(transactionError(error));
            }
          });

          unsubscribeSnapshot = onSnapshot(
            getHabitRabbitDocRef(user.uid),
            async (snapshot) => {
              if (!snapshot.exists()) {
                const seeded = await seedUserDocument(user);
                if (active) {
                  onState(seeded);
                }
                return;
              }

              if (active) {
                onState(normalizeState(snapshot.data()));
              }
            },
            (error) => {
              if (active) {
                onError?.(transactionError(error));
              }
            }
          );
        },
        (error) => {
          if (active) {
            onError?.(transactionError(error));
          }
        }
      );
    })
    .catch((error) => {
      if (active) {
        onError?.(transactionError(error));
      }
    });

  return () => {
    active = false;
    unsubscribeSnapshot();
    unsubscribeAuth();
  };
}

export async function startGuestSessionAction() {
  try {
    await ensureAuthReady();
    const user = auth.currentUser ?? (await signInAnonymouslyOnce());
    await ensureUserDocument(user);
    await syncUserDocumentMetadata(user);
    return { ok: true, auth: toAuthViewState(user) };
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function signInWithGoogleAction() {
  try {
    await ensureAuthReady();

    const provider = createGoogleProvider();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      const result = await startGoogleSignIn(provider);
      if (!result) {
        return { ok: true, redirecting: true, message: "Redirecting to Google sign-in..." };
      }
      await ensureUserDocument(result.user);
      await syncUserDocumentMetadata(result.user);
      return { ok: true, auth: toAuthViewState(result.user), merged: false };
    }

    if (!currentUser.isAnonymous) {
      await syncUserDocumentMetadata(currentUser);
      return { ok: true, auth: toAuthViewState(currentUser), merged: false };
    }

    const anonymousState = (await readStoredState(currentUser.uid))?.state ?? null;

    try {
      const result = await linkWithPopup(currentUser, provider);
      await syncUserDocumentMetadata(result.user);
      return { ok: true, auth: toAuthViewState(result.user), merged: false };
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error ? String(error.code) : "";

      if (
        code !== "auth/credential-already-in-use" &&
        code !== "auth/email-already-in-use" &&
        code !== "auth/account-exists-with-different-credential"
      ) {
        throw error;
      }

      const credential = GoogleAuthProvider.credentialFromError(error as never);
      const result = credential
        ? await signInWithCredential(auth, credential)
        : await signInWithPopup(auth, provider);

      if (anonymousState) {
        await mergeIntoUserDocument(result.user, anonymousState);
      } else {
        await ensureUserDocument(result.user);
      }

      await syncUserDocumentMetadata(result.user);
      return { ok: true, auth: toAuthViewState(result.user), merged: Boolean(anonymousState) };
    }
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function signOutAction() {
  try {
    await ensureAuthReady();
    await signOut(auth);
    return { ok: true, auth: toAuthViewState(null) };
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function completeHabitAction(rawInput: unknown) {
  try {
    const input = completeHabitInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    const result = await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();
      const date = fromIsoDay(input.day);
      const today = new Date();
      const earliest = startOfDay(subWeeks(today, 1));
      const latest = endOfDay(today);

      if (isBefore(date, earliest) || isAfter(date, latest)) {
        throw new Error("You can only check habits from this or last week.");
      }

      const habit = state.habits.find((entry) => entry.id === input.habitId);
      if (!habit) {
        throw new Error("Habit not found.");
      }

      if (state.completions.some((completion) => completion.habitId === input.habitId && completion.day === input.day)) {
        throw new Error("This habit is already checked for that day.");
      }

      const weekCount = countHabitWeekCompletions(state, input.habitId, input.day);
      if (weekCount >= habit.targetPerWeek) {
        throw new Error(`You already reached this habit's weekly goal of ${habit.targetPerWeek}.`);
      }

      state.completions.push({ habitId: input.habitId, day: input.day });

      const bonus = state.profile.rabbitHealth >= 100 ? EXTRA_SCORE_AT_FULL_HEALTH : 0;
      let energy = state.profile.energy + SCORE_PER_COMPLETION + bonus;
      let level = state.profile.level;
      let carrots = state.profile.carrots;
      const rabbitHealth = clamp(state.profile.rabbitHealth + 2, 0, 100);

      while (energy >= LEVEL_SCORE_CAP) {
        energy -= LEVEL_SCORE_CAP;
        level += 1;
        carrots += 10;
      }

      state.profile = {
        ...state.profile,
        rabbitHealth,
        energy,
        carrots,
        level,
      };

      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
      return {
        ok: true,
        profile: {
          rabbitHealth,
          energy,
          carrots,
          level,
        },
      };
    });

    return result;
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function setMoodAction(rawInput: unknown) {
  try {
    const input = moodInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();

      state.moods = state.moods.filter((entry) => entry.day !== input.day);
      state.moods.push({ day: input.day, mood: input.mood });

      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
    });

    return { ok: true, day: input.day, mood: input.mood };
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function setActiveRoomAction(rawInput: unknown) {
  try {
    const input = roomInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();
      state.profile = { ...state.profile, activeRoom: input.room };
      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
    });

    return { ok: true, room: input.room };
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function setAppModeAction(rawInput: unknown) {
  try {
    const input = modeInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();
      state.profile = { ...state.profile, mode: input.mode };
      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
    });

    return { ok: true, mode: input.mode };
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function purchaseStoreItemAction(rawInput: unknown) {
  try {
    const input = itemPurchaseInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    const result = await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();
      const item = state.storeItems.find((entry) => entry.key === input.itemKey);

      if (!item) {
        throw new Error("Store item not found.");
      }
      if (state.userItems.some((entry) => entry.itemKey === item.key)) {
        throw new Error("You already own this item.");
      }
      if (state.profile.carrots < item.carrotCost) {
        throw new Error("Not enough carrots.");
      }

      const userItemId = crypto.randomUUID();
      const room = item.room ?? state.profile.activeRoom;

      state.profile = {
        ...state.profile,
        carrots: state.profile.carrots - item.carrotCost,
      };
      state.userItems.push({
        id: userItemId,
        itemKey: item.key,
        room,
        x: room === RoomType.GARDEN ? 62 : 70,
        y: room === RoomType.GARDEN ? 72 : 66,
        visible: true,
      });

      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
      return {
        ok: true,
        userItemId,
        carrots: state.profile.carrots,
      };
    });

    return result;
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function toggleUserItemVisibilityAction(rawInput: unknown) {
  try {
    const input = itemToggleInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    const result = await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();
      const item = state.userItems.find((entry) => entry.id === input.userItemId);

      if (!item) {
        throw new Error("Item not found.");
      }

      item.visible = !item.visible;
      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
      return { ok: true, userItemId: input.userItemId, visible: item.visible };
    });

    return result;
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function createHabitAction(rawInput: unknown) {
  try {
    const input = createHabitInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    const result = await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();
      const validationError = validateHabitChange({
        habits: state.habits,
        priority: input.priority,
        targetPerWeek: input.targetPerWeek,
      });

      if (validationError) {
        throw new Error(validationError);
      }

      const habit: HabitState = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        targetPerWeek: input.targetPerWeek,
        priority: input.priority,
        sortOrder: state.habits.length + 1,
        colorHex: colorForPriority(input.priority),
        notifications: false,
        notificationAt: null,
      };

      state.habits = sortHabits([...state.habits, habit]);
      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
      return { ok: true, habit };
    });

    return result;
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function updateHabitAction(rawInput: unknown) {
  try {
    const input = updateHabitInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    const result = await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();
      const existing = state.habits.find((habit) => habit.id === input.habitId);

      if (!existing) {
        throw new Error("Habit not found.");
      }

      const validationError = validateHabitChange({
        habits: state.habits,
        priority: input.priority,
        targetPerWeek: input.targetPerWeek,
        habitId: input.habitId,
      });

      if (validationError) {
        throw new Error(validationError);
      }

      const updatedHabit: HabitState = {
        ...existing,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        targetPerWeek: input.targetPerWeek,
        priority: input.priority,
        colorHex: colorForPriority(input.priority),
      };

      state.habits = sortHabits(
        state.habits.map((habit) =>
          habit.id === input.habitId ? updatedHabit : habit
        )
      );

      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
      return { ok: true, habit: updatedHabit };
    });

    return result;
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function deleteHabitAction(rawInput: unknown) {
  try {
    const input = deleteHabitInput.parse(rawInput);
    const user = await ensureAuthenticatedUser();
    const habitRabbitDocRef = getHabitRabbitDocRef(user.uid);
    const result = await runTransaction(firestore, async (transaction) => {
      const snapshot = await transaction.get(habitRabbitDocRef);
      const raw = snapshot.exists() ? snapshot.data() : undefined;
      const state = snapshot.exists() ? normalizeState(raw) : createDefaultHabitRabbitState();
      const existing = state.habits.find((habit) => habit.id === input.habitId);

      if (!existing) {
        throw new Error("Habit not found.");
      }

      state.habits = sortHabits(state.habits.filter((habit) => habit.id !== input.habitId));
      state.completions = state.completions.filter((completion) => completion.habitId !== input.habitId);

      transaction.set(habitRabbitDocRef, buildStoredDocument(user, state, raw));
      return { ok: true, habitId: input.habitId };
    });

    return result;
  } catch (error) {
    return { ok: false, message: transactionError(error) };
  }
}

export async function loadInitialHabitRabbitState() {
  return cloneState(createDefaultHabitRabbitState());
}
