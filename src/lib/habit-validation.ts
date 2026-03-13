import type { HabitState } from "@/lib/data";
import { HabitPriority } from "@/lib/types";

type ValidateHabitChangeInput = {
  habits: HabitState[];
  priority: HabitState["priority"];
  targetPerWeek: number;
  habitId?: string;
};

export function validateHabitChange({
  habits,
  priority,
  targetPerWeek,
  habitId,
}: ValidateHabitChangeInput) {
  if (targetPerWeek < 1 || targetPerWeek > 7) {
    return "Weekly goal must be between 1 and 7.";
  }

  if (!habitId && habits.length >= 20) {
    return "You can add up to 20 habits total.";
  }

  const comparableHabits = habitId
    ? habits.filter((habit) => habit.id !== habitId)
    : habits;

  const highCount = comparableHabits.filter(
    (habit) => habit.priority === HabitPriority.HIGH
  ).length;
  const mediumCount = comparableHabits.filter(
    (habit) => habit.priority === HabitPriority.MEDIUM
  ).length;

  if (priority === HabitPriority.HIGH && highCount >= 1) {
    return "Only one high-priority habit is allowed.";
  }

  if (priority === HabitPriority.MEDIUM && mediumCount >= 2) {
    return "Only two medium-priority habits are allowed.";
  }

  return null;
}
