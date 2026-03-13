export const HabitPriority = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type HabitPriority = (typeof HabitPriority)[keyof typeof HabitPriority];

export const MoodType = {
  HAPPY: "HAPPY",
  SAD: "SAD",
  ANGRY: "ANGRY",
  COOL: "COOL",
  SICK: "SICK",
  BLUSH: "BLUSH",
  NEUTRAL: "NEUTRAL",
} as const;

export type MoodType = (typeof MoodType)[keyof typeof MoodType];

export const AppMode = {
  NORMAL: "NORMAL",
  CHALLENGE: "CHALLENGE",
  VACATION: "VACATION",
} as const;

export type AppMode = (typeof AppMode)[keyof typeof AppMode];

export const RoomType = {
  BEDROOM: "BEDROOM",
  GARDEN: "GARDEN",
} as const;

export type RoomType = (typeof RoomType)[keyof typeof RoomType];
