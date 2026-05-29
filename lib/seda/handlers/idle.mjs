export async function handleIdle({ events, prompt, ctx }) {
  if (ctx.scripted && !events.some((e) => e.type === "idle_new_concept")) {
    const concept = await prompt.ask("concept", "Concept: ");
    ctx.concept = concept;
    events.push({ type: "idle_new_concept", concept });
    return {};
  }
  while (true) {
    console.log("");
    console.log(ctx.section("idle", "Idle"));
    console.log("Type a concept to explore, /redrill, or /exit.");
    const cmd = (await prompt.ask("cmd", "> ")).trim();
    if (!cmd && ctx.scripted) {
      events.push({ type: "idle_exit" });
      return {};
    }
    if (cmd === "/exit" || cmd === "/quit") {
      events.push({ type: "idle_exit" });
      return {};
    }
    if (cmd === "/redrill") {
      events.push({ type: "idle_redrill" });
      return {};
    }
    if (cmd === "/help" || cmd === "/?") {
      console.log(
        "Commands: type a concept name to start a new drill, /redrill to re-drill the current node, /exit to quit.",
      );
      continue;
    }
    if (!cmd) continue;
    ctx.concept = cmd;
    events.push({ type: "idle_new_concept", concept: cmd });
    return {};
  }
}
