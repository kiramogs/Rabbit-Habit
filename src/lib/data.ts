import type {
  AppMode as AppModeType,
  HabitPriority as HabitPriorityType,
  MoodType as MoodTypeType,
  RoomType as RoomTypeType,
} from "@/lib/types";

export type ProfileState = {
  rabbitName: string;
  rabbitHealth: number;
  energy: number;
  carrots: number;
  level: number;
  mode: AppModeType;
  activeRoom: RoomTypeType;
};

export type HabitState = {
  id: string;
  name: string;
  description: string | null;
  targetPerWeek: number;
  priority: HabitPriorityType;
  sortOrder: number;
  colorHex: string;
  notifications: boolean;
  notificationAt: string | null;
};

export type CompletionState = {
  habitId: string;
  day: string;
};

export type MoodState = {
  day: string;
  mood: MoodTypeType;
};

export type StoreItemState = {
  key: string;
  label: string;
  category: string;
  description: string;
  carrotCost: number;
  icon: string;
  room: RoomTypeType | null;
};

export type UserItemState = {
  id: string;
  itemKey: string;
  room: RoomTypeType;
  x: number | null;
  y: number | null;
  visible: boolean;
};

export type HabitRabbitState = {
  profile: ProfileState;
  habits: HabitState[];
  completions: CompletionState[];
  moods: MoodState[];
  storeItems: StoreItemState[];
  userItems: UserItemState[];
};
