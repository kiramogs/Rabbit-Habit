import {
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  format,
  getDate,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { AppMode, HabitPriority, MoodType, RoomType } from "@/lib/types";

export type AppTab = "home" | "habits" | "stats" | "moods" | "store" | "profile";

export const APP_TABS: Array<{ key: AppTab; label: string; icon: string }> = [
  { key: "home", label: "Home", icon: "/assets/icons/image3.png" },
  { key: "habits", label: "Habits", icon: "/assets/icons/image11.png" },
  { key: "stats", label: "Stats", icon: "/assets/icons/image19.png" },
  { key: "moods", label: "Moods", icon: "/assets/icons/image20.png" },
  { key: "store", label: "Store", icon: "/assets/icons/image4.png" },
];

export const TAB_SCREEN_TITLES: Record<AppTab, string> = {
  home: "Meet your Habit Rabbit!",
  habits: "Complete your habits!",
  stats: "View statistics!",
  moods: "Track your moods!",
  store: "Design your rabbit's home!",
  profile: "Manage your profile",
};

export const PRIORITY_META: Record<
  HabitPriority,
  { label: string; dot: string; color: string }
> = {
  HIGH: { label: "High", dot: "/assets/icons/image12.png", color: "#ff0000" },
  MEDIUM: { label: "Medium", dot: "/assets/icons/image9.png", color: "#f59e0b" },
  LOW: { label: "Low", dot: "/assets/icons/image7.png", color: "#d9d900" },
};

export const APP_MODE_COPY: Record<
  AppMode,
  { label: string; tip: string }
> = {
  NORMAL: {
    label: "Normal",
    tip: "At 0% health, levels drop slowly over time.",
  },
  CHALLENGE: {
    label: "Challenge",
    tip: "At 0% health, all energy and levels are reset.",
  },
  VACATION: {
    label: "Vacation",
    tip: "Health does not decay while this mode is active.",
  },
};

export const MOOD_META: Record<
  MoodType,
  {
    label: string;
    face: string;
    bg: string;
  }
> = {
  HAPPY: { label: "Happy", face: "😀", bg: "#9ddc66" },
  SAD: { label: "Sad", face: "😟", bg: "#f07575" },
  ANGRY: { label: "Angry", face: "😠", bg: "#f3874f" },
  COOL: { label: "Cool", face: "😎", bg: "#f2d56b" },
  SICK: { label: "Sick", face: "😵", bg: "#c0c5ce" },
  BLUSH: { label: "Blush", face: "😊", bg: "#e8a2c3" },
  NEUTRAL: { label: "Neutral", face: "😐", bg: "#efc96e" },
};

export const ROOM_META: Record<
  RoomType,
  {
    label: string;
    src: string;
  }
> = {
  BEDROOM: {
    label: "Bedroom",
    src: "/assets/screens/screen1.png",
  },
  GARDEN: {
    label: "Garden",
    src: "/assets/screens/screen5.png",
  },
};

export const SCORE_PER_COMPLETION = 15;
export const EXTRA_SCORE_AT_FULL_HEALTH = 5;
export const LEVEL_SCORE_CAP = 100;

export function toIsoDay(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function fromIsoDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function daysForCalendarMonth(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end }).map((day) => ({
    date: day,
    dayNumber: getDate(day),
    inMonth: isSameMonth(day, month),
  }));
}

export function getWeekDays(weekAnchor: Date) {
  const start = startOfWeek(weekAnchor, { weekStartsOn: 0 });
  return eachDayOfInterval({
    start,
    end: endOfWeek(weekAnchor, { weekStartsOn: 0 }),
  });
}

export function monthGoalTarget(targetPerWeek: number, month: Date) {
  const totalDays = endOfMonth(month).getDate();
  const approxWeeks = Math.ceil(totalDays / 7);
  return Math.max(1, targetPerWeek * approxWeeks);
}
