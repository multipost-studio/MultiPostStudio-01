import type { AiFailureReason } from "./models";

/** Why a request got templated output instead of a model's answer. */
export type AiFallback = "disabled" | "no_key" | "empty" | AiFailureReason;

const NO_CREDITS = "no AI credits were used";

/**
 * What the user is told when an AI action returned templated output. Each cause has
 * a different fix (connect a key, replace a key, wait for quota…), so the message
 * names the cause and the next step instead of a generic "AI isn't configured".
 */
export function templatedNotice(reason: AiFallback | undefined): string {
  switch (reason) {
    case "no_key":
      return `No AI key is connected, so this is templated output. Connect your own key in Settings → AI Providers for real AI results; ${NO_CREDITS}.`;
    case "invalid_key":
      return `Your AI provider rejected the key, so this is templated output. Reconnect it in Settings → AI Providers; ${NO_CREDITS}.`;
    case "quota":
      return `Your AI provider says the key is out of quota or rate limited, so this is templated output. Try again shortly; ${NO_CREDITS}.`;
    case "model_unavailable":
      return `Your AI provider's model isn't available right now, so this is templated output. Run Test Connection in Settings → AI Providers; ${NO_CREDITS}.`;
    case "unreachable":
    case "provider_error":
    case "empty":
      return `Your AI provider didn't return a usable answer, so this is templated output; ${NO_CREDITS}.`;
    case "disabled":
    default:
      return `AI isn't configured on this deployment, so this is templated output; ${NO_CREDITS}.`;
  }
}
