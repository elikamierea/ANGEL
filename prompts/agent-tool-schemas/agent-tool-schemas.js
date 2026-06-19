import { AGENT_TOOL_SCHEMAS_DESIGNER } from './agent-tool-schemas.designer.js';
import { AGENT_TOOL_SCHEMAS_ORCHESTRATOR } from './agent-tool-schemas.orchestrator.js';
import { AGENT_TOOL_SCHEMAS_PROGRAMMER } from './agent-tool-schemas.programmer.js';
import { AGENT_TOOL_SCHEMAS_RESOURCE_PROVIDER } from './agent-tool-schemas.resource-provider.js';

export function getToolSchemasByAgent(agentId) {
  switch (String(agentId || '').trim()) {
    case 'designer':
      return AGENT_TOOL_SCHEMAS_DESIGNER;
    case 'orchestrator':
      return AGENT_TOOL_SCHEMAS_ORCHESTRATOR;
    case 'programmer':
      return AGENT_TOOL_SCHEMAS_PROGRAMMER;
    case 'resource':
      return AGENT_TOOL_SCHEMAS_RESOURCE_PROVIDER;
    default:
      return AGENT_TOOL_SCHEMAS_ORCHESTRATOR;
  }
}

export const AGENT_FUNCTION_TOOL_SCHEMAS = AGENT_TOOL_SCHEMAS_ORCHESTRATOR;
