
"use client";

import Image from "next/image";
import {
  addDays,
  addMonths,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";

import {
  type AuthViewState,
  completeHabitAction,
  createHabitAction,
  deleteHabitAction,
  purchaseStoreItemAction,
  setActiveRoomAction,
  setAppModeAction,
  setMoodAction,
  signInWithGoogleAction,
  signOutAction,
  subscribeToHabitRabbitState,
  toggleUserItemVisibilityAction,
  updateHabitAction,
} from "@/lib/firebase-actions";
import type { HabitRabbitState, HabitState } from "@/lib/data";
import { validateHabitChange } from "@/lib/habit-validation";
import {
  APP_MODE_COPY,
  APP_TABS,
  EXTRA_SCORE_AT_FULL_HEALTH,
  LEVEL_SCORE_CAP,
  MOOD_META,
  monthGoalTarget,
  PRIORITY_META,
  ROOM_META,
  SCORE_PER_COMPLETION,
  TAB_SCREEN_TITLES,
  toIsoDay,
  type AppTab,
  daysForCalendarMonth,
  getWeekDays,
} from "@/lib/habit-rabbit";
import { AppMode, HabitPriority, MoodType, RoomType } from "@/lib/types";

type HabitRabbitAppProps = {
  state: HabitRabbitState;
};

type ServerResult = {
  ok: boolean;
  message?: string;
  [key: string]: unknown;
};

const WEEK_DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function levelProgress(energy: number) {
  return Math.max(0, Math.min(100, energy));
}

function completionKey(habitId: string, day: string) {
  return `${habitId}:${day}`;
}

function asPercent(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function cloneState(value: HabitRabbitState): HabitRabbitState {
  return {
    profile: { ...value.profile },
    habits: value.habits.map((habit) => ({ ...habit })),
    completions: value.completions.map((completion) => ({ ...completion })),
    moods: value.moods.map((mood) => ({ ...mood })),
    storeItems: value.storeItems.map((item) => ({ ...item })),
    userItems: value.userItems.map((item) => ({ ...item })),
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

export function HabitRabbitApp({ state }: HabitRabbitAppProps) {
  const [isPending, startTransition] = useTransition();
  const [isAuthPending, startAuthTransition] = useTransition();
  const [liveState, setLiveState] = useState(() => cloneState(state));
  const [tab, setTab] = useState<AppTab>("home");
  const [habitWeekAnchor, setHabitWeekAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [statsMonth, setStatsMonth] = useState(() => startOfDay(new Date()));
  const [moodMonth, setMoodMonth] = useState(() => startOfDay(new Date()));
  const [selectedMoodDay, setSelectedMoodDay] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [habitName, setHabitName] = useState("");
  const [habitDescription, setHabitDescription] = useState("");
  const [habitTarget, setHabitTarget] = useState(3);
  const [habitPriority, setHabitPriority] = useState<HabitPriority>(HabitPriority.LOW);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthViewState>({
    status: "loading",
    uid: null,
    isAnonymous: true,
    displayName: null,
    email: null,
    photoURL: null,
  });

  const liveStateRef = useRef(liveState);

  const resetHabitForm = () => {
    setEditingHabitId(null);
    setHabitName("");
    setHabitDescription("");
    setHabitTarget(3);
    setHabitPriority(HabitPriority.LOW);
  };

  const populateHabitForm = (habit: HabitState) => {
    setEditingHabitId(habit.id);
    setHabitName(habit.name);
    setHabitDescription(habit.description ?? "");
    setHabitTarget(habit.targetPerWeek);
    setHabitPriority(habit.priority);
  };

  useEffect(() => {
    setLiveState(cloneState(state));
  }, [state]);

  useEffect(() => {
    const unsubscribe = subscribeToHabitRabbitState(
      (nextState) => {
        setLiveState(cloneState(nextState));
      },
      (message) => {
        setFlash(message);
      },
      (nextAuthState) => {
        setAuthState(nextAuthState);
        if (nextAuthState.status === "signed_out") {
          setLiveState(cloneState(state));
          setTab("home");
          setSelectedMoodDay(null);
          setEditingHabitId(null);
          setHabitName("");
          setHabitDescription("");
          setHabitTarget(3);
          setHabitPriority(HabitPriority.LOW);
        }
      }
    );

    return unsubscribe;
  }, [state]);

  useEffect(() => {
    liveStateRef.current = liveState;
  }, [liveState]);

  useEffect(() => {
    if (!editingHabitId) {
      return;
    }

    const stillExists = liveState.habits.some((habit) => habit.id === editingHabitId);
    if (!stillExists) {
      setEditingHabitId(null);
      setHabitName("");
      setHabitDescription("");
      setHabitTarget(3);
      setHabitPriority(HabitPriority.LOW);
    }
  }, [editingHabitId, liveState.habits]);

  const completionSet = useMemo(() => {
    return new Set(liveState.completions.map((completion) => completionKey(completion.habitId, completion.day)));
  }, [liveState.completions]);

  const moodMap = useMemo(() => {
    return new Map(liveState.moods.map((entry) => [entry.day, entry.mood]));
  }, [liveState.moods]);

  const ownedItemMap = useMemo(() => {
    return new Map(liveState.userItems.map((item) => [item.itemKey, item]));
  }, [liveState.userItems]);

  const completionsByHabit = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const completion of liveState.completions) {
      const prev = map.get(completion.habitId) ?? [];
      prev.push(completion.day);
      map.set(completion.habitId, prev);
    }
    return map;
  }, [liveState.completions]);

  const habitWeekDays = useMemo(() => getWeekDays(habitWeekAnchor), [habitWeekAnchor]);
  const moodCalendar = useMemo(() => daysForCalendarMonth(moodMonth), [moodMonth]);
  const monthPrefix = format(statsMonth, "yyyy-MM");
  const today = startOfDay(new Date());
  const oneWeekAgo = startOfDay(subDays(today, 7));
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 });

  const runServer = (
    operation: () => Promise<ServerResult>,
    onSuccess?: (result: ServerResult) => void,
    onError?: (message: string) => void
  ) => {
    startTransition(async () => {
      try {
        const result = await operation();
        if (!result.ok) {
          const message = result.message ?? "Unable to sync your update.";
          setFlash(message);
          onError?.(message);
          return;
        }
        if (result.message) {
          setFlash(result.message);
        }
        onSuccess?.(result);
      } catch {
        const message = "Unable to sync your update.";
        setFlash(message);
        onError?.(message);
      }
    });
  };

  const runAuthOperation = (
    operation: () => Promise<ServerResult>,
    onSuccess?: (result: ServerResult) => void
  ) => {
    startAuthTransition(async () => {
      try {
        const result = await operation();
        if (!result.ok) {
          setFlash(result.message ?? "Unable to update your session.");
          return;
        }
        onSuccess?.(result);
      } catch {
        setFlash("Unable to update your session.");
      }
    });
  };

  const handleSetMood = (day: string, mood: MoodType) => {
    const previous = liveStateRef.current.moods.find((entry) => entry.day === day) ?? null;
    setLiveState((prev) => {
      const moods = prev.moods.filter((entry) => entry.day !== day);
      moods.push({ day, mood });
      return { ...prev, moods };
    });

    runServer(
      () => setMoodAction({ day, mood }),
      undefined,
      () => {
        setLiveState((prev) => {
          const moods = prev.moods.filter((entry) => entry.day !== day);
          if (previous) moods.push(previous);
          return { ...prev, moods };
        });
      }
    );
  };

  const handleSetRoom = (room: RoomType) => {
    const previousRoom = liveStateRef.current.profile.activeRoom;
    if (previousRoom === room) return;

    setLiveState((prev) => ({
      ...prev,
      profile: { ...prev.profile, activeRoom: room },
    }));

    runServer(
      () => setActiveRoomAction({ room }),
      undefined,
      () => {
        setLiveState((prev) => ({
          ...prev,
          profile: { ...prev.profile, activeRoom: previousRoom },
        }));
      }
    );
  };

  const handleSetMode = (mode: AppMode) => {
    const previousMode = liveStateRef.current.profile.mode;
    if (previousMode === mode) return;

    setLiveState((prev) => ({
      ...prev,
      profile: { ...prev.profile, mode },
    }));

    runServer(
      () => setAppModeAction({ mode }),
      undefined,
      () => {
        setLiveState((prev) => ({
          ...prev,
          profile: { ...prev.profile, mode: previousMode },
        }));
      }
    );
  };

  const handleCompleteHabit = (habitId: string, day: string) => {
    const key = completionKey(habitId, day);
    if (completionSet.has(key)) {
      return;
    }

    const habit = liveStateRef.current.habits.find((entry) => entry.id === habitId);
    if (!habit) {
      setFlash("Habit not found.");
      return;
    }

    const previousProfile = { ...liveStateRef.current.profile };

    setLiveState((prev) => {
      const completions = [...prev.completions, { habitId, day }];
      const bonus = prev.profile.rabbitHealth >= 100 ? EXTRA_SCORE_AT_FULL_HEALTH : 0;
      let energy = prev.profile.energy + SCORE_PER_COMPLETION + bonus;
      let level = prev.profile.level;
      let carrots = prev.profile.carrots;
      const rabbitHealth = Math.max(0, Math.min(100, prev.profile.rabbitHealth + 2));

      while (energy >= LEVEL_SCORE_CAP) {
        energy -= LEVEL_SCORE_CAP;
        level += 1;
        carrots += 10;
      }

      return {
        ...prev,
        completions,
        profile: {
          ...prev.profile,
          rabbitHealth,
          energy,
          carrots,
          level,
        },
      };
    });

    runServer(
      () => completeHabitAction({ habitId, day }),
      (result) => {
        if (result.profile && typeof result.profile === "object") {
          const profile = result.profile as {
            rabbitHealth: number;
            energy: number;
            carrots: number;
            level: number;
          };
          setLiveState((prev) => ({
            ...prev,
            profile: {
              ...prev.profile,
              rabbitHealth: profile.rabbitHealth,
              energy: profile.energy,
              carrots: profile.carrots,
              level: profile.level,
            },
          }));
        }
      },
      () => {
        setLiveState((prev) => ({
          ...prev,
          completions: prev.completions.filter(
            (completion) => !(completion.habitId === habitId && completion.day === day)
          ),
          profile: previousProfile,
        }));
      }
    );
  };

  const handleStartEditHabit = (habitId: string) => {
    const habit = liveStateRef.current.habits.find((entry) => entry.id === habitId);
    if (!habit) {
      setFlash("Habit not found.");
      return;
    }

    populateHabitForm(habit);
  };

  const handleCancelHabitEdit = () => {
    resetHabitForm();
  };

  const submitHabitForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = habitName.trim();
    const trimmedDescription = habitDescription.trim();
    const currentEditingHabitId = editingHabitId;

    if (!trimmedName) {
      setFlash("Habit name is required.");
      return;
    }

    const validationError = validateHabitChange({
      habits: liveStateRef.current.habits,
      priority: habitPriority,
      targetPerWeek: habitTarget,
      habitId: currentEditingHabitId ?? undefined,
    });

    if (validationError) {
      setFlash(validationError);
      return;
    }

    if (currentEditingHabitId) {
      const previousHabit = liveStateRef.current.habits.find(
        (habit) => habit.id === currentEditingHabitId
      );

      if (!previousHabit) {
        setFlash("Habit not found.");
        return;
      }

      const updatedHabit: HabitState = {
        ...previousHabit,
        name: trimmedName,
        description: trimmedDescription || null,
        targetPerWeek: habitTarget,
        priority: habitPriority,
        colorHex: colorForPriority(habitPriority),
      };

      setLiveState((prev) => ({
        ...prev,
        habits: sortHabits(
          prev.habits.map((habit) =>
            habit.id === currentEditingHabitId ? updatedHabit : habit
          )
        ),
      }));
      resetHabitForm();

      runServer(
        () =>
          updateHabitAction({
            habitId: currentEditingHabitId,
            name: trimmedName,
            description: trimmedDescription,
            targetPerWeek: habitTarget,
            priority: habitPriority,
          }),
        (result) => {
          const syncedHabit = (result.habit as HabitState | undefined) ?? null;
          if (!syncedHabit) return;

          setLiveState((prev) => ({
            ...prev,
            habits: sortHabits(
              prev.habits.map((habit) =>
                habit.id === currentEditingHabitId ? syncedHabit : habit
              )
            ),
          }));
        },
        () => {
          setLiveState((prev) => ({
            ...prev,
            habits: sortHabits(
              prev.habits.map((habit) =>
                habit.id === currentEditingHabitId ? previousHabit : habit
              )
            ),
          }));
          populateHabitForm(previousHabit);
        }
      );

      return;
    }

    const tempId = `tmp-${crypto.randomUUID()}`;
    const maxSort = liveStateRef.current.habits.reduce((acc, habit) => Math.max(acc, habit.sortOrder), 0);
    const tempHabit: HabitState = {
      id: tempId,
      name: trimmedName,
      description: trimmedDescription || null,
      targetPerWeek: habitTarget,
      priority: habitPriority,
      sortOrder: maxSort + 1,
      colorHex: colorForPriority(habitPriority),
      notifications: false,
      notificationAt: null,
    };

    setLiveState((prev) => ({
      ...prev,
      habits: sortHabits([...prev.habits, tempHabit]),
    }));
    resetHabitForm();

    runServer(
      () =>
        createHabitAction({
          name: trimmedName,
          description: tempHabit.description ?? "",
          targetPerWeek: tempHabit.targetPerWeek,
          priority: tempHabit.priority,
        }),
      (result) => {
        const createdHabit = (result.habit as HabitState | undefined) ?? null;
        if (!createdHabit) return;
        setLiveState((prev) => ({
          ...prev,
          habits: sortHabits(
            prev.habits.map((habit) => (habit.id === tempId ? { ...createdHabit } : habit))
          ),
        }));
      },
      () => {
        setLiveState((prev) => ({
          ...prev,
          habits: sortHabits(prev.habits.filter((habit) => habit.id !== tempId)),
        }));
      }
    );
  };

  const handleDeleteHabit = (habitId: string) => {
    const snapshot = liveStateRef.current;
    const removedHabit = snapshot.habits.find((habit) => habit.id === habitId);
    if (!removedHabit) return;
    const removedCompletions = snapshot.completions.filter((completion) => completion.habitId === habitId);
    const wasEditingDeletedHabit = editingHabitId === habitId;

    if (wasEditingDeletedHabit) {
      resetHabitForm();
    }

    setLiveState((prev) => ({
      ...prev,
      habits: sortHabits(prev.habits.filter((habit) => habit.id !== habitId)),
      completions: prev.completions.filter((completion) => completion.habitId !== habitId),
    }));

    runServer(
      () => deleteHabitAction({ habitId }),
      undefined,
      () => {
        setLiveState((prev) => ({
          ...prev,
          habits: sortHabits([...prev.habits, removedHabit]),
          completions: [...prev.completions, ...removedCompletions],
        }));
        if (wasEditingDeletedHabit) {
          populateHabitForm(removedHabit);
        }
      }
    );
  };

  const handleBuyItem = (itemKey: string) => {
    const snapshot = liveStateRef.current;
    const item = snapshot.storeItems.find((entry) => entry.key === itemKey);
    if (!item) return;
    if (snapshot.userItems.some((entry) => entry.itemKey === itemKey)) {
      setFlash("You already own this item.");
      return;
    }
    if (snapshot.profile.carrots < item.carrotCost) {
      setFlash("Not enough carrots.");
      return;
    }

    const tempId = `tmp-${crypto.randomUUID()}`;
    const room = item.room ?? snapshot.profile.activeRoom;
    const optimisticItem = {
      id: tempId,
      itemKey: item.key,
      room,
      x: room === RoomType.GARDEN ? 62 : 70,
      y: room === RoomType.GARDEN ? 72 : 66,
      visible: true,
    };

    setLiveState((prev) => ({
      ...prev,
      profile: { ...prev.profile, carrots: prev.profile.carrots - item.carrotCost },
      userItems: [...prev.userItems, optimisticItem],
    }));

    runServer(
      () => purchaseStoreItemAction({ itemKey }),
      (result) => {
        const userItemId =
          typeof result.userItemId === "string" || typeof result.userItemId === "number"
            ? String(result.userItemId)
            : null;
        const carrots = typeof result.carrots === "number" ? result.carrots : null;
        setLiveState((prev) => ({
          ...prev,
          profile: {
            ...prev.profile,
            carrots: carrots ?? prev.profile.carrots,
          },
          userItems: prev.userItems.map((entry) =>
            entry.id === tempId && userItemId ? { ...entry, id: userItemId } : entry
          ),
        }));
      },
      () => {
        setLiveState((prev) => ({
          ...prev,
          profile: { ...prev.profile, carrots: prev.profile.carrots + item.carrotCost },
          userItems: prev.userItems.filter((entry) => entry.id !== tempId),
        }));
      }
    );
  };

  const handleToggleItemVisibility = (userItemId: string) => {
    const current = liveStateRef.current.userItems.find((entry) => entry.id === userItemId);
    if (!current) return;

    setLiveState((prev) => ({
      ...prev,
      userItems: prev.userItems.map((entry) =>
        entry.id === userItemId ? { ...entry, visible: !entry.visible } : entry
      ),
    }));

    runServer(
      () => toggleUserItemVisibilityAction({ userItemId }),
      undefined,
      () => {
        setLiveState((prev) => ({
          ...prev,
          userItems: prev.userItems.map((entry) =>
            entry.id === userItemId ? { ...entry, visible: current.visible } : entry
          ),
        }));
      }
    );
  };

  const handleGoogleSignIn = () => {
    runAuthOperation(() => signInWithGoogleAction(), (result) => {
      if (result.redirecting) {
        setFlash(result.message ?? "Redirecting to Google sign-in...");
        return;
      }
      if (result.merged) {
        setFlash("Google account connected. Existing guest progress was merged into your account.");
        return;
      }

      setFlash("Google account connected.");
    });
  };

  const handleSignOut = () => {
    runAuthOperation(() => signOutAction(), () => {
      setFlash("Signed out.");
    });
  };

  if (authState.status !== "ready") {
    return (
      <AuthLandingScreen
        isLoading={authState.status === "loading"}
        isAuthPending={isAuthPending}
        flash={flash}
        onGoogleSignIn={handleGoogleSignIn}
      />
    );
  }

  const sessionSubtitle = authState.isAnonymous
    ? "Guest session active on this device"
    : authState.email || "Google account synced";

  return (
    <main className="hr-page">
      <section className="app-shell">
        <header className="screen-header">
          <div className="header-brand">
            <span className="brand-pill">Habit Rabbit</span>
            <div>
              <h1 className="screen-heading">{TAB_SCREEN_TITLES[tab]}</h1>
              <p className="screen-subtitle">{sessionSubtitle}</p>
            </div>
          </div>
          <div className="header-meta">
            <div className="status-bars">
              <StatusChip icon="/assets/icons/image18.png" value={`${liveState.profile.level}`} />
              <StatusChip icon="/assets/icons/image6.png" value={`${liveState.profile.carrots}`} />
              <StatusChip icon="/assets/icons/image10.png" value={`${liveState.profile.rabbitHealth}%`} />
            </div>
            <button
              type="button"
              className={clsx("profile-shortcut", tab === "profile" && "active")}
              onClick={() => setTab("profile")}
              aria-label="Open Profile"
            >
              <ProfileAvatar authState={authState} className="profile-shortcut-avatar" />
              <span>Profile</span>
            </button>
          </div>
        </header>

        <nav className="tab-strip">
          {APP_TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={clsx("tab-button", tab === entry.key && "active")}
              onClick={() => setTab(entry.key)}
              aria-label={entry.label}
            >
              <Image src={entry.icon} alt="" width={20} height={20} />
              <span>{entry.label}</span>
            </button>
          ))}
        </nav>

        <div className={clsx("screen-card", tab)}>
          {tab === "home" && <HomeScreen state={liveState} onRoomChange={handleSetRoom} onModeChange={handleSetMode} />}
          {tab === "habits" && (
            <HabitScreen
              state={liveState}
              weekDays={habitWeekDays}
              completionSet={completionSet}
              moodMap={moodMap}
              oneWeekAgo={oneWeekAgo}
              today={today}
              onPrevWeek={() => setHabitWeekAnchor((prev) => subDays(prev, 7))}
              onNextWeek={() =>
                setHabitWeekAnchor((prev) =>
                  prev.getTime() < currentWeekStart.getTime() ? addDays(prev, 7) : prev
                )
              }
              onComplete={handleCompleteHabit}
              onEditHabit={handleStartEditHabit}
              onDeleteHabit={handleDeleteHabit}
              onSubmitHabit={submitHabitForm}
              onCancelHabitEdit={handleCancelHabitEdit}
              habitName={habitName}
              setHabitName={setHabitName}
              habitDescription={habitDescription}
              setHabitDescription={setHabitDescription}
              habitTarget={habitTarget}
              setHabitTarget={setHabitTarget}
              habitPriority={habitPriority}
              setHabitPriority={setHabitPriority}
              editingHabitId={editingHabitId}
            />
          )}
          {tab === "stats" && (
            <StatsScreen
              state={liveState}
              completionsByHabit={completionsByHabit}
              monthPrefix={monthPrefix}
              monthDate={statsMonth}
              onPrevMonth={() => setStatsMonth((prev) => subMonths(prev, 1))}
              onNextMonth={() => setStatsMonth((prev) => addMonths(prev, 1))}
            />
          )}
          {tab === "moods" && (
            <MoodScreen
              monthDate={moodMonth}
              calendar={moodCalendar}
              selectedMoodDay={selectedMoodDay}
              moodMap={moodMap}
              onPrevMonth={() => setMoodMonth((prev) => subMonths(prev, 1))}
              onNextMonth={() => setMoodMonth((prev) => addMonths(prev, 1))}
              onSelectDay={(day) => setSelectedMoodDay(day)}
              onSetMood={handleSetMood}
            />
          )}
          {tab === "store" && (
            <StoreScreen
              state={liveState}
              ownedItemMap={ownedItemMap}
              onBuy={handleBuyItem}
              onToggleVisibility={handleToggleItemVisibility}
            />
          )}
          {tab === "profile" && (
            <ProfileScreen
              state={liveState}
              authState={authState}
              isAuthPending={isAuthPending}
              onGoogleSignIn={handleGoogleSignIn}
              onSignOut={handleSignOut}
            />
          )}
        </div>

        <footer className="screen-footer">
          <div className="level-bar">
            <div className="level-fill" style={{ width: asPercent(levelProgress(liveState.profile.energy)) }} />
            <span>Level {liveState.profile.level}</span>
          </div>
          <p className="health-tip">{APP_MODE_COPY[liveState.profile.mode].tip}</p>
          {flash ? <p className="flash-text">{flash}</p> : null}
          {isAuthPending ? <p className="flash-text">Updating session...</p> : null}
          {isPending ? <p className="flash-text">Syncing...</p> : null}
        </footer>
      </section>
    </main>
  );
}

function AuthLandingScreen({
  isLoading,
  isAuthPending,
  flash,
  onGoogleSignIn,
}: {
  isLoading: boolean;
  isAuthPending: boolean;
  flash: string | null;
  onGoogleSignIn: () => void;
}) {
  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-card">
          <Image
            src="/assets/hrbunny.png"
            alt="Habit Rabbit"
            width={72}
            height={72}
            className="auth-logo"
          />
          <div className="auth-card-copy">
            <span className="brand-pill">Habit Rabbit</span>
            <h1 className="auth-title">Sign in</h1>
          </div>

          <div className="auth-actions">
            <button
              type="button"
              className="primary-btn auth-cta"
              onClick={onGoogleSignIn}
              disabled={isLoading || isAuthPending}
            >
              {isLoading ? "Restoring session..." : isAuthPending ? "Connecting..." : "Continue with Google"}
            </button>
          </div>

          {flash ? <p className="flash-text">{flash}</p> : null}
          {!flash ? (
            <p className="health-tip auth-status">
              {isLoading ? "Checking your saved sign-in state." : "Use your Google account to continue."}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function StatusChip({ icon, value }: { icon: string; value: string }) {
  return (
    <div className="status-chip">
      <Image src={icon} alt="" width={16} height={16} />
      <span>{value}</span>
    </div>
  );
}

function ProfileAvatar({
  authState,
  className,
}: {
  authState: AuthViewState;
  className?: string;
}) {
  const avatarLetter = (authState.displayName || authState.email || "R").slice(0, 1).toUpperCase();
  if (authState.photoURL) {
    return (
      <>
        {/* Google profile photos are dynamic third-party URLs, so a plain img keeps this auth badge simple. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={authState.photoURL}
          alt={authState.displayName || authState.email || "Profile avatar"}
          className={clsx("account-avatar", className)}
          referrerPolicy="no-referrer"
        />
      </>
    );
  }

  return <span className={clsx("account-avatar", "placeholder", className)}>{avatarLetter}</span>;
}

function HomeScreen({
  state,
  onRoomChange,
  onModeChange,
}: {
  state: HabitRabbitState;
  onRoomChange: (room: RoomType) => void;
  onModeChange: (mode: AppMode) => void;
}) {
  const visibleItems = state.userItems.filter(
    (item) => item.visible && item.room === state.profile.activeRoom
  );

  return (
    <div className="home-screen">
      <div className={clsx("room-canvas", state.profile.activeRoom === RoomType.GARDEN && "garden")}>
        <div className="room-layer wall" />
        <div className="room-layer floor" />
        {state.profile.activeRoom === RoomType.BEDROOM ? (
          <>
            <div className="furniture closet" />
            <div className="furniture desk" />
            <div className="furniture bed" />
            <div className="furniture rug" />
          </>
        ) : (
          <>
            <div className="furniture tree" />
            <div className="furniture flower-bed" />
            <div className="furniture pond" />
            <div className="furniture bench" />
          </>
        )}

        <div className="rabbit-avatar">
          <Image src="/assets/hrbunny.png" alt="Rabbit avatar" width={68} height={68} />
        </div>

        {visibleItems.map((item) => {
          const storeItem = state.storeItems.find((candidate) => candidate.key === item.itemKey);
          if (!storeItem) return null;
          return (
            <span
              key={item.id}
              className="placed-item"
              style={{
                left: `${item.x ?? 70}%`,
                top: `${item.y ?? 68}%`,
              }}
            >
              {storeItem.icon}
            </span>
          );
        })}
      </div>

      <div className="home-controls">
        <div className="control-group">
          {Object.entries(ROOM_META).map(([room, copy]) => (
            <button
              key={room}
              type="button"
              className={clsx("pill-button", state.profile.activeRoom === room && "active")}
              onClick={() => onRoomChange(room as RoomType)}
            >
              {copy.label}
            </button>
          ))}
        </div>
        <div className="control-group">
          {Object.entries(APP_MODE_COPY).map(([mode, copy]) => (
            <button
              key={mode}
              type="button"
              className={clsx("pill-button", state.profile.mode === mode && "active")}
              onClick={() => onModeChange(mode as AppMode)}
            >
              {copy.label}
            </button>
          ))}
        </div>
        <div className="home-caption">
          Rabbit: <strong>{state.profile.rabbitName}</strong>
        </div>
      </div>
    </div>
  );
}

function ProfileScreen({
  state,
  authState,
  isAuthPending,
  onGoogleSignIn,
  onSignOut,
}: {
  state: HabitRabbitState;
  authState: AuthViewState;
  isAuthPending: boolean;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
}) {
  const sessionLabel = authState.isAnonymous ? "Guest session" : "Google account";
  const sessionDescription = authState.isAnonymous
    ? "This guest session is stored on this device through Firebase Anonymous Auth. Connect Google to keep the same data tied to your account."
    : "Your data is attached to your Google account and kept available across refreshes and future sessions.";
  const uidPreview = authState.uid
    ? `${authState.uid.slice(0, 8)}...${authState.uid.slice(-4)}`
    : "Unavailable";

  return (
    <div className="profile-screen">
      <section className="profile-hero">
        <ProfileAvatar authState={authState} className="profile-hero-avatar" />
        <div className="profile-hero-copy">
          <span className="account-label">{sessionLabel}</span>
          <strong>{authState.displayName || authState.email || "Habit Rabbit User"}</strong>
          <small>{sessionDescription}</small>
        </div>
      </section>

      <section className="profile-grid">
        <article className="profile-stat-card">
          <span>Session</span>
          <strong>{authState.isAnonymous ? "Guest" : "Google"}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Habit count</span>
          <strong>{state.habits.length}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Owned items</span>
          <strong>{state.userItems.length}</strong>
        </article>
      </section>

      <section className="profile-panel">
        <h3>Account controls</h3>
        <p>{authState.email || "No email is attached to this session yet."}</p>
        <p>Session ID: {uidPreview}</p>
        <div className="profile-actions">
          {authState.isAnonymous ? (
            <button
              type="button"
              className="primary-btn auth-btn"
              onClick={onGoogleSignIn}
              disabled={isAuthPending}
            >
              {isAuthPending ? "Connecting..." : "Sign in with Google"}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-btn auth-btn"
            onClick={onSignOut}
            disabled={isAuthPending}
          >
            {isAuthPending ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </section>

      <section className="profile-panel">
        <h3>Data storage</h3>
        <p>
          Habits, moods, stats, store items, and profile progress are stored per user in Firestore
          under a private document path.
        </p>
        <p>Rabbit name: {state.profile.rabbitName}</p>
      </section>
    </div>
  );
}

function HabitScreen({
  state,
  weekDays,
  completionSet,
  moodMap,
  oneWeekAgo,
  today,
  onPrevWeek,
  onNextWeek,
  onComplete,
  onEditHabit,
  onDeleteHabit,
  onSubmitHabit,
  onCancelHabitEdit,
  habitName,
  setHabitName,
  habitDescription,
  setHabitDescription,
  habitTarget,
  setHabitTarget,
  habitPriority,
  setHabitPriority,
  editingHabitId,
}: {
  state: HabitRabbitState;
  weekDays: Date[];
  completionSet: Set<string>;
  moodMap: Map<string, MoodType>;
  oneWeekAgo: Date;
  today: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onComplete: (habitId: string, day: string) => void;
  onEditHabit: (habitId: string) => void;
  onDeleteHabit: (habitId: string) => void;
  onSubmitHabit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancelHabitEdit: () => void;
  habitName: string;
  setHabitName: (value: string) => void;
  habitDescription: string;
  setHabitDescription: (value: string) => void;
  habitTarget: number;
  setHabitTarget: (value: number) => void;
  habitPriority: HabitPriority;
  setHabitPriority: (value: HabitPriority) => void;
  editingHabitId: string | null;
}) {
  const weekLabel = format(weekDays[0], "MMMM yyyy");
  const isEditing = Boolean(editingHabitId);

  return (
    <div className="habit-screen">
      <div className="sheet-header">
        <button type="button" className="arrow-btn" onClick={onPrevWeek} aria-label="Previous week">
          <Image src="/assets/icons/image15.png" alt="" width={12} height={18} />
        </button>
        <strong>{weekLabel}</strong>
        <button type="button" className="arrow-btn mirrored" onClick={onNextWeek} aria-label="Next week">
          <Image src="/assets/icons/image15.png" alt="" width={12} height={18} />
        </button>
      </div>

      <div className="week-grid heading">
        {WEEK_DAY_LABELS.map((label, index) => (
          <div key={label} className="day-cell">
            <span>{label}</span>
            <small>{format(weekDays[index], "d")}</small>
          </div>
        ))}
      </div>

      <div className="week-grid moods">
        {weekDays.map((date) => {
          const day = toIsoDay(date);
          const mood = moodMap.get(day) ?? MoodType.NEUTRAL;
          const tone = MOOD_META[mood];
          return (
            <div key={day} className="mood-bubble" style={{ background: tone.bg }}>
              <span>{tone.face}</span>
            </div>
          );
        })}
      </div>

      <div className="habit-list">
        {state.habits.map((habit) => {
          const weekDone = weekDays.reduce((count, date) => {
            const key = completionKey(habit.id, toIsoDay(date));
            return count + (completionSet.has(key) ? 1 : 0);
          }, 0);

          return (
            <div key={habit.id} className={clsx("habit-row", editingHabitId === habit.id && "editing")}>
              <div className="habit-title">
                <Image
                  src={PRIORITY_META[habit.priority].dot}
                  alt={PRIORITY_META[habit.priority].label}
                  width={14}
                  height={14}
                />
                <div className="habit-copy">
                  <span>{habit.name}</span>
                  {habit.description ? <small>{habit.description}</small> : null}
                </div>
                <strong>{weekDone}/{habit.targetPerWeek}</strong>
                <div className="habit-actions">
                  <button
                    type="button"
                    className="habit-edit-btn"
                    onClick={() => onEditHabit(habit.id)}
                    aria-label={`Edit ${habit.name}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="habit-delete-btn"
                    onClick={() => onDeleteHabit(habit.id)}
                    aria-label={`Delete ${habit.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="habit-dots">
                {weekDays.map((date) => {
                  const day = toIsoDay(date);
                  const key = completionKey(habit.id, day);
                  const checked = completionSet.has(key);
                  const disabled =
                    isBefore(date, oneWeekAgo) ||
                    isAfter(date, today) ||
                    checked;
                  return (
                    <button
                      key={day}
                      type="button"
                      className={clsx("dot-btn", checked && "checked")}
                      disabled={disabled}
                      onClick={() => onComplete(habit.id, day)}
                      aria-label={`Mark ${habit.name} on ${day}`}
                    >
                      {checked ? "\u2713" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <form className="habit-form" onSubmit={onSubmitHabit}>
        <div className="form-title">{isEditing ? "Edit Habit" : "Add Habit"}</div>
        <input
          type="text"
          value={habitName}
          onChange={(event) => setHabitName(event.target.value)}
          placeholder="Habit name"
          maxLength={60}
        />
        <input
          type="text"
          value={habitDescription}
          onChange={(event) => setHabitDescription(event.target.value)}
          placeholder="Description (optional)"
          maxLength={180}
        />
        <div className="form-grid">
          <label>
            Weekly goal
            <select
              value={habitTarget}
              onChange={(event) => setHabitTarget(Number(event.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((amount) => (
                <option key={amount} value={amount}>
                  {amount}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={habitPriority}
              onChange={(event) => setHabitPriority(event.target.value as HabitPriority)}
            >
              <option value={HabitPriority.HIGH}>High (1 max)</option>
              <option value={HabitPriority.MEDIUM}>Medium (2 max)</option>
              <option value={HabitPriority.LOW}>Low</option>
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-btn">
            {isEditing ? "Save Habit" : "Add Habit"}
          </button>
          {isEditing ? (
            <button type="button" className="secondary-btn" onClick={onCancelHabitEdit}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function StatsScreen({
  state,
  completionsByHabit,
  monthPrefix,
  monthDate,
  onPrevMonth,
  onNextMonth,
}: {
  state: HabitRabbitState;
  completionsByHabit: Map<string, string[]>;
  monthPrefix: string;
  monthDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  return (
    <div className="stats-screen">
      <div className="sheet-header">
        <button type="button" className="arrow-btn" onClick={onPrevMonth} aria-label="Previous month">
          <Image src="/assets/icons/image15.png" alt="" width={12} height={18} />
        </button>
        <strong>{format(monthDate, "MMMM yyyy")}</strong>
        <button type="button" className="arrow-btn mirrored" onClick={onNextMonth} aria-label="Next month">
          <Image src="/assets/icons/image15.png" alt="" width={12} height={18} />
        </button>
      </div>

      <div className="stats-head">
        <span>Habit name</span>
        <span>Monthly Goal %</span>
        <span>Month</span>
        <span>Lifetime</span>
      </div>

      <div className="stats-list">
        {state.habits.map((habit) => {
          const entries = completionsByHabit.get(habit.id) ?? [];
          const monthCount = entries.filter((day) => day.startsWith(monthPrefix)).length;
          const lifetimeCount = entries.length;
          const monthTarget = monthGoalTarget(habit.targetPerWeek, monthDate);
          const percent = Math.round((monthCount / monthTarget) * 100);
          return (
            <div key={habit.id} className="stats-row">
              <div className="habit-name">{habit.name}</div>
              <div className="goal-pill">
                <div className="goal-fill" style={{ width: asPercent(percent) }} />
                <span>{Math.min(percent, 999)}%</span>
              </div>
              <div>{monthCount}</div>
              <div>{lifetimeCount}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoodScreen({
  monthDate,
  calendar,
  selectedMoodDay,
  moodMap,
  onPrevMonth,
  onNextMonth,
  onSelectDay,
  onSetMood,
}: {
  monthDate: Date;
  calendar: ReturnType<typeof daysForCalendarMonth>;
  selectedMoodDay: string | null;
  moodMap: Map<string, MoodType>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (day: string) => void;
  onSetMood: (day: string, mood: MoodType) => void;
}) {
  return (
    <div className="mood-screen">
      <div className="sheet-header">
        <button type="button" className="arrow-btn" onClick={onPrevMonth} aria-label="Previous month">
          <Image src="/assets/icons/image15.png" alt="" width={12} height={18} />
        </button>
        <strong>{format(monthDate, "MMMM yyyy")}</strong>
        <button type="button" className="arrow-btn mirrored" onClick={onNextMonth} aria-label="Next month">
          <Image src="/assets/icons/image15.png" alt="" width={12} height={18} />
        </button>
      </div>

      <div className="week-grid heading compact">
        {WEEK_DAY_LABELS.map((label) => (
          <div key={label} className="day-cell">
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {calendar.map((cell) => {
          const day = toIsoDay(cell.date);
          const mood = moodMap.get(day) ?? MoodType.NEUTRAL;
          const tone = MOOD_META[mood];
          return (
            <button
              key={day}
              type="button"
              className={clsx("calendar-cell", !cell.inMonth && "muted", selectedMoodDay === day && "active")}
              disabled={!cell.inMonth}
              onClick={() => onSelectDay(day)}
            >
              <small>{cell.dayNumber}</small>
              <span className="calendar-mood" style={{ background: tone.bg }}>
                {tone.face}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mood-editor">
        <span>Tip: tap mood icon to edit</span>
        <div className="mood-picker">
          {Object.entries(MOOD_META).map(([mood, tone]) => (
            <button
              key={mood}
              type="button"
              className="mood-choice"
              style={{ background: tone.bg }}
              disabled={!selectedMoodDay}
              onClick={() => selectedMoodDay && onSetMood(selectedMoodDay, mood as MoodType)}
            >
              {tone.face}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoreScreen({
  state,
  ownedItemMap,
  onBuy,
  onToggleVisibility,
}: {
  state: HabitRabbitState;
  ownedItemMap: Map<string, HabitRabbitState["userItems"][number]>;
  onBuy: (itemKey: string) => void;
  onToggleVisibility: (userItemId: string) => void;
}) {
  const rabbitItems = state.storeItems.filter((item) => item.category === "rabbit");
  const roomItems = state.storeItems.filter((item) => item.category === "room");

  return (
    <div className="store-screen">
      <div className="store-balance">
        <Image src="/assets/icons/image6.png" alt="" width={16} height={16} />
        <strong>{state.profile.carrots} carrots</strong>
      </div>

      <StoreSection
        title="Rabbit Cosmetics"
        items={rabbitItems}
        ownedItemMap={ownedItemMap}
        onBuy={onBuy}
        onToggleVisibility={onToggleVisibility}
      />
      <StoreSection
        title="Room Items"
        items={roomItems}
        ownedItemMap={ownedItemMap}
        onBuy={onBuy}
        onToggleVisibility={onToggleVisibility}
      />
    </div>
  );
}

function StoreSection({
  title,
  items,
  ownedItemMap,
  onBuy,
  onToggleVisibility,
}: {
  title: string;
  items: HabitRabbitState["storeItems"];
  ownedItemMap: Map<string, HabitRabbitState["userItems"][number]>;
  onBuy: (itemKey: string) => void;
  onToggleVisibility: (userItemId: string) => void;
}) {
  return (
    <div className="store-section">
      <h3>{title}</h3>
      <div className="store-grid">
        {items.map((item) => {
          const owned = ownedItemMap.get(item.key);
          return (
            <article key={item.key} className="store-card">
              <div className="store-icon">{item.icon}</div>
              <div className="store-text">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
                {item.room ? <small className="room-tag">{item.room.toLowerCase()}</small> : null}
              </div>
              {!owned ? (
                <button type="button" className="store-btn" onClick={() => onBuy(item.key)}>
                  Buy {item.carrotCost}
                </button>
              ) : (
                <button
                  type="button"
                  className={clsx("store-btn", owned.visible && "owned")}
                  onClick={() => onToggleVisibility(owned.id)}
                >
                  {owned.visible ? "Hide" : "Show"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
