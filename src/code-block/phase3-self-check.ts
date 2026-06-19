import { BlockRegistry } from "./block-registry";
import { BlockToolAdapter } from "./block-tool-adapter";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Phase3SelfCheck failed: ${message}`);
  }
}

export function runPhase3SelfCheck(): void {
  const registry = new BlockRegistry();
  const adapter = new BlockToolAdapter(registry);

  const seedErr = registry.seedFile("src/game/player.cpp", "");
  assert(!seedErr, "seed file should succeed");

  const includeCreate = registry.createBlock({
    path: "src/game/player.cpp",
    name: "INCLUDE",
    featureKey: "INCLUDE",
    type: "include",
    ownerAgent: "Orchestrator",
    initialContent: '#include "player.hpp"',
    position: "file_top",
    expectedRevision: 0,
  });

  assert(includeCreate.applied, "INCLUDE block should be creatable");

  const implCreate = registry.createBlock({
    path: "src/game/player.cpp",
    name: "MOVE_IMPL",
    featureKey: "MOVE_IMPL",
    type: "class_impl",
    ownerAgent: "Programmer",
    initialContent: "void Player::move() {}",
    position: "file_end",
    expectedRevision: includeCreate.newRevision,
  });

  assert(implCreate.applied, "impl block should be creatable");

  const dupInclude = registry.createBlock({
    path: "src/game/player.cpp",
    name: "INCLUDE",
    featureKey: "INCLUDE_2",
    type: "include",
    ownerAgent: "Orchestrator",
    initialContent: "#include <vector>",
    position: "file_end",
    expectedRevision: implCreate.newRevision,
  });

  assert(!dupInclude.applied, "second INCLUDE should be rejected");
  assert(dupInclude.error?.code === "CONSTRAINT_VIOLATION", "duplicate INCLUDE should be constraint error");

  const includeUpdateDenied = registry.updateBlock({
    blockId: "src/game/player.cpp#INCLUDE",
    newContent: "#include <string>",
    expectedRevision: implCreate.newRevision,
    actor: "Programmer",
  });

  assert(!includeUpdateDenied.applied, "non-Orchestrator include update should fail");
  assert(includeUpdateDenied.error?.code === "PERMISSION_DENIED", "permission code mismatch");

  const headerSeed = registry.seedFile("src/game/player.hpp", "");
  assert(!headerSeed, "hpp seed should be supported");

  const listed = adapter.code_list_blocks({ path: "src/game/player.cpp" });
  assert(listed.applied, "tool adapter list should work");
  assert(listed.blocks.length === 2, "list should contain created cpp blocks");

  const read = adapter.code_read_block({ blockId: "src/game/player.cpp#MOVE_IMPL" });
  assert(read.applied, "tool adapter read should work");

  const updated = adapter.code_update_block({
    blockId: "src/game/player.cpp#MOVE_IMPL",
    expectedRevision: implCreate.newRevision,
    newContent: "void Player::move() { /* updated */ }",
    actor: "Programmer",
  });
  assert(updated.applied, "tool adapter update should work");

  const bind = adapter.code_bind_block_to_node({
    nodeId: "node-move",
    blockId: "src/game/player.cpp#MOVE_IMPL",
    expectedRevision: 0,
  });
  assert(bind.applied, "block->node bind should work");
  assert(adapter.listBindingsByNode("node-move").includes("src/game/player.cpp#MOVE_IMPL"), "binding lookup should work");

  const blindWrite = adapter.code_write_entire_file();
  assert(!blindWrite.applied, "whole-file write path should be rejected");
  assert(blindWrite.error?.code === "CONSTRAINT_VIOLATION", "blind write rejection code mismatch");

  const headerBlock = registry.createBlock({
    path: "src/game/player.hpp",
    name: "GUARD_OR_PRAGMA",
    featureKey: "GUARD_OR_PRAGMA",
    type: "guard_or_pragma",
    ownerAgent: "Orchestrator",
    initialContent: "#pragma once",
    position: "file_top",
    expectedRevision: 0,
  });

  assert(headerBlock.applied, ".hpp block create should work");
}
