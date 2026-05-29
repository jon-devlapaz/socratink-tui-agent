import { makeMapLegendFormatter } from "../ui/map-legend.mjs";

export function buildProvisionalMapDisplay(provisionalMap, activeSubnodeId) {
  const metadata = provisionalMap?.metadata || {};
  const backbone = Array.isArray(provisionalMap?.backbone)
    ? provisionalMap.backbone
    : [];
  const clusters = Array.isArray(provisionalMap?.clusters)
    ? provisionalMap.clusters
    : [];
  const rooms = [];

  for (const cluster of clusters) {
    const subnodes = Array.isArray(cluster.subnodes) ? cluster.subnodes : [];
    for (const subnode of subnodes) {
      const scaffold = subnode.learner_scaffold || {};
      rooms.push({
        id: subnode.id,
        cluster_id: cluster.id,
        cluster_label: cluster.label,
        subnode_label: subnode.label,
        task_label: scaffold.task_label || subnode.label,
        status: subnode.id === activeSubnodeId ? "active" : "locked",
      });
    }
  }

  const activeRoom = rooms.find((room) => room.status === "active");

  return {
    framing: "hypothesis map — not graph truth yet",
    core_thesis: String(metadata.core_thesis || "").trim(),
    backbone: backbone.map((item) => ({
      id: item.id,
      principle: item.principle,
      dependent_clusters: item.dependent_clusters || [],
    })),
    rooms,
    active_subnode_id: activeSubnodeId,
    active_task_label: activeRoom?.task_label || null,
  };
}

export function printProvisionalMapLegend(display, section, colorEnabled) {
  const fmt = makeMapLegendFormatter(colorEnabled);
  console.log("");
  console.log(section("map", "Hypothesis Map"));
  console.log(fmt.framing(display.framing));
  if (display.core_thesis) {
    console.log(
      `${fmt.sectionLabel("Thesis:")} ${fmt.thesis(display.core_thesis)}`,
    );
  }
  if (display.backbone.length) {
    console.log(fmt.sectionLabel("Pillars:"));
    for (const item of display.backbone) {
      console.log(`  · ${fmt.pillar(item.principle)}`);
    }
  }
  if (display.rooms.length) {
    console.log(fmt.sectionLabel("Rooms:"));
    for (const room of display.rooms) {
      const tag = room.status === "active" ? "active" : "locked";
      const suffix =
        room.status === "active" && room.task_label ? ` — ${room.task_label}` : "";
      const tagText = `[${tag}]`;
      const body = `${room.cluster_label}${suffix}`;
      if (room.status === "active") {
        console.log(
          `  · ${fmt.roomId(room.id)} ${fmt.tagActive(tagText)} ${fmt.roomActive(body)}`,
        );
      } else {
        console.log(
          `  · ${fmt.roomId(room.id)} ${fmt.tagLocked(tagText)} ${fmt.roomLocked(body)}`,
        );
      }
    }
  }
}
