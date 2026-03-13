import { subDays } from "date-fns";

import type { HabitRabbitState } from "@/lib/data";
import { toIsoDay } from "@/lib/habit-rabbit";
import { AppMode, HabitPriority, MoodType, RoomType } from "@/lib/types";

const DEFAULT_STORE_ITEMS: HabitRabbitState["storeItems"] = [
  {
    key: "orange-hat",
    label: "Orange Hat",
    category: "rabbit",
    description: "A warm beanie for your rabbit.",
    carrotCost: 35,
    icon: "\uD83C\uDFA9",
    room: null,
  },
  {
    key: "heart-glasses",
    label: "Heart Glasses",
    category: "rabbit",
    description: "Stylish glasses that stay on in every room.",
    carrotCost: 55,
    icon: "\uD83D\uDD76\uFE0F",
    room: null,
  },
  {
    key: "window-plant",
    label: "Window Plant",
    category: "room",
    description: "A calm green plant for your bedroom.",
    carrotCost: 25,
    icon: "\uD83E\uDEB4",
    room: RoomType.BEDROOM,
  },
  {
    key: "picnic-set",
    label: "Picnic Set",
    category: "room",
    description: "A cozy picnic layout for your garden.",
    carrotCost: 45,
    icon: "\uD83E\uDDFA",
    room: RoomType.GARDEN,
  },
  {
    key: "flamingo",
    label: "Flamingo",
    category: "room",
    description: "A fun garden buddy.",
    carrotCost: 60,
    icon: "\uD83E\uDDA9",
    room: RoomType.GARDEN,
  },
  {
    key: "cat-plush",
    label: "Cat Plush",
    category: "room",
    description: "A tiny plush for your rabbit corner.",
    carrotCost: 20,
    icon: "\uD83D\uDC31",
    room: RoomType.BEDROOM,
  },
];

export function createDefaultHabitRabbitState(): HabitRabbitState {
  const today = new Date();
  const moodPattern = [
    MoodType.NEUTRAL,
    MoodType.HAPPY,
    MoodType.HAPPY,
    MoodType.SAD,
    MoodType.COOL,
    MoodType.NEUTRAL,
    MoodType.BLUSH,
  ] as const;

  return {
    profile: {
      rabbitName: "Study Bunny",
      rabbitHealth: 95,
      energy: 40,
      carrots: 120,
      level: 8,
      mode: AppMode.NORMAL,
      activeRoom: RoomType.BEDROOM,
    },
    habits: [
      {
        id: "habit-study",
        name: "Study with Study Bunny",
        description: null,
        targetPerWeek: 5,
        priority: HabitPriority.HIGH,
        sortOrder: 1,
        colorHex: "#ff0000",
        notifications: false,
        notificationAt: null,
      },
      {
        id: "habit-exercise",
        name: "Exercise",
        description: null,
        targetPerWeek: 3,
        priority: HabitPriority.MEDIUM,
        sortOrder: 2,
        colorHex: "#f59e0b",
        notifications: false,
        notificationAt: null,
      },
      {
        id: "habit-sleep",
        name: "Go to bed before 11 pm",
        description: null,
        targetPerWeek: 5,
        priority: HabitPriority.MEDIUM,
        sortOrder: 3,
        colorHex: "#f59e0b",
        notifications: false,
        notificationAt: null,
      },
      {
        id: "habit-clean",
        name: "Clean room",
        description: null,
        targetPerWeek: 1,
        priority: HabitPriority.LOW,
        sortOrder: 4,
        colorHex: "#d9d900",
        notifications: false,
        notificationAt: null,
      },
      {
        id: "habit-food",
        name: "No fast food",
        description: null,
        targetPerWeek: 6,
        priority: HabitPriority.LOW,
        sortOrder: 5,
        colorHex: "#d9d900",
        notifications: false,
        notificationAt: null,
      },
    ],
    completions: [
      { habitId: "habit-study", day: toIsoDay(subDays(today, 1)) },
      { habitId: "habit-study", day: toIsoDay(subDays(today, 2)) },
      { habitId: "habit-study", day: toIsoDay(subDays(today, 3)) },
      { habitId: "habit-study", day: toIsoDay(subDays(today, 4)) },
      { habitId: "habit-exercise", day: toIsoDay(subDays(today, 1)) },
      { habitId: "habit-exercise", day: toIsoDay(subDays(today, 3)) },
      { habitId: "habit-sleep", day: toIsoDay(subDays(today, 1)) },
      { habitId: "habit-sleep", day: toIsoDay(subDays(today, 2)) },
      { habitId: "habit-sleep", day: toIsoDay(subDays(today, 4)) },
      { habitId: "habit-clean", day: toIsoDay(subDays(today, 5)) },
      { habitId: "habit-food", day: toIsoDay(subDays(today, 1)) },
      { habitId: "habit-food", day: toIsoDay(subDays(today, 2)) },
      { habitId: "habit-food", day: toIsoDay(subDays(today, 4)) },
    ],
    moods: Array.from({ length: 31 }, (_, index) => {
      const date = subDays(today, 30 - index);
      return {
        day: toIsoDay(date),
        mood: moodPattern[index % moodPattern.length],
      };
    }),
    storeItems: DEFAULT_STORE_ITEMS,
    userItems: [
      {
        id: "item-cat-plush",
        itemKey: "cat-plush",
        room: RoomType.BEDROOM,
        x: 72,
        y: 68,
        visible: true,
      },
    ],
  };
}
