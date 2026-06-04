import { makeMapLegendFormatter } from "../../ui/map-legend.mjs";
import { agentCall } from "../agent-call.mjs";
import {
  buildProvisionalMapDisplay,
  printProvisionalMapLegend,
} from "../provisional-map.mjs";
import { generateRouteWithRetry } from "../route-generation.mjs";

function latestSubstrateAdequacy(events) {
  const adequacy = events.findLast((event) => event.type === "substrate_confirmed")
    ?.adequacy;
  return adequacy === "minimal" ? "minimal" : "adequate";
}

export async function handleRoute({ events, bridge, options, ctx }) {
  console.log("");
  console.log(ctx.section("route", "Route"));
  console.log("Generating Smallest actionable route...");
  const substrateAdequacy = latestSubstrateAdequacy(events);
  const routeResult = generateRouteWithRetry({
    callBridgeResult: bridge.callBridgeResult,
    concept: ctx.concept,
    learnerGoal: ctx.learnerGoal,
    launchAttempt: ctx.launchAttempt,
    substrateAdequacy,
    logRawLlm: options.logRawLlm,
    events,
    section: ctx.section,
  });
  if (routeResult.bridgeError) {
    events.push(routeResult.bridgeError);
    console.log(
      `${ctx.section("route", "Route Failed")} ${routeResult.bridgeError.message}`,
    );
    return { llm_calls: [] };
  }
  const route = routeResult.route;
  ctx.firstNode = route.first_node;
  ctx.nodeIds = [ctx.firstNode.id];
  const mapDisplayed = buildProvisionalMapDisplay(
    route.provisional_map,
    route.first_node.id,
  );
  ctx.route = {
    provisional_map: route.provisional_map,
    first_node: route.first_node,
    map_displayed: mapDisplayed,
    substrate_adequacy: substrateAdequacy,
    retry_count: routeResult.retryReasons.length,
    retry_reasons: routeResult.retryReasons,
  };
  const llmRoute = agentCall(ctx.agentLookup, "route", {
    stage: "route_generated",
    ...route.llm_call,
  });
  const llmCold = agentCall(ctx.agentLookup, "cold_attempt", {
    stage: "cold_attempt_prompt",
    provider: "orchestrator",
    model: "contract",
    latency_ms: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
  events.push({ type: "route_generated", substrate_adequacy: substrateAdequacy });
  const mapFmt = makeMapLegendFormatter(ctx.colorEnabled);
  printProvisionalMapLegend(mapDisplayed, ctx.section, ctx.colorEnabled);
  const routeLlm = route.llm_call || {};
  console.log(
    `[Route LLM] ${routeLlm.provider || "unknown"}/${routeLlm.model || "unknown"}` +
      (routeLlm.latency_ms != null ? ` · ${routeLlm.latency_ms}ms` : ""),
  );
  ctx.composerCta = {
    label: "First question",
    text: ctx.firstNode.learner_prompt || "",
  };
  if (!options.loopUi) {
    console.log("");
    console.log(mapFmt.firstQuestion("First question:"));
    console.log(mapFmt.prompt(ctx.firstNode.learner_prompt));
  }
  return { llm_calls: [llmRoute, llmCold] };
}
