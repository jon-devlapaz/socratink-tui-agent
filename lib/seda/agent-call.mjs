export function agentCall(agentLookup, id, call = {}) {
  const agent = agentLookup.get(id);
  if (!agent) throw new Error(`agent-contract-missing:${id}`);
  return {
    agent: agent.name,
    agent_id: agent.id,
    job: agent.job,
    required_outputs: agent.required_outputs,
    may_propose_events: agent.may_propose_events,
    truth_permission: agent.truth_permission,
    failure_mode_to_guard: agent.failure_mode_to_guard,
    ...call,
  };
}
