import { HabitRabbitApp } from "@/components/habit-rabbit-app";
import { createDefaultHabitRabbitState } from "@/lib/default-state";

export const dynamic = "force-dynamic";

export default function Home() {
  const state = createDefaultHabitRabbitState();
  return <HabitRabbitApp state={state} />;
}
