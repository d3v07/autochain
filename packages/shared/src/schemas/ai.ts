import { z } from "zod";
import { AssistantMode, AutonomyLevel, UserRole } from "./auth.js";

export const UpdateAiStateRequest = z
  .object({
    mode: AssistantMode.optional(),
    autonomy: AutonomyLevel.optional(),
  })
  .refine((value) => value.mode !== undefined || value.autonomy !== undefined, {
    message: "Provide mode or autonomy",
  });
export type UpdateAiStateRequest = z.infer<typeof UpdateAiStateRequest>;

export const AiStateResponse = z.object({
  role: UserRole,
  mode: AssistantMode,
  autonomy: AutonomyLevel,
  availableModes: z.array(AssistantMode),
  availableAutonomy: z.array(AutonomyLevel),
  featureFlags: z.array(z.string()),
});
export type AiStateResponse = z.infer<typeof AiStateResponse>;

export const PromptPackResponse = z.object({
  globalSystemPrompt: z.string(),
  rolePrompt: z.string(),
  modePrompt: z.string(),
  agenticSafetyPrompt: z.string(),
  taskTemplates: z.record(z.string(), z.string()),
});
export type PromptPackResponse = z.infer<typeof PromptPackResponse>;
