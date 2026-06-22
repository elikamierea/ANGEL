import { SHARED_AGENT_TOOL_SCHEMAS } from './agent-tool-schemas.shared.js';

const RESOURCE_ONLY_IMAGE_TOOLS = [
  {
    type: 'function',
    name: 'crop_image',
    description: 'Crop a rectangular region from an image under project root and save as png.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        outPath: { type: 'string' },
      },
      required: ['path', 'x', 'y', 'width', 'height'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_sprite',
    description: 'Generate sprite atlas and metadata from image frame paths. The atlas is composed as a single horizontal row of frames (left-to-right), which is how the engine slices it. All frames MUST share the same pixel dimensions (they are sized from the first frame); if any frame differs the call fails with an error telling you which frame mismatches — resize them to match first. By default an existing sprite at the same path/name is overwritten; set overwrite=false to refuse and keep the existing files instead.',
    parameters: {
      type: 'object',
      properties: {
        images: { type: 'array', items: { type: 'string' }, description: 'Ordered frame image paths (project-root-relative). Every frame must have identical width and height; they are laid out into one horizontal strip in this order.' },
        outPath: { type: 'string' },
        pivotX: { type: 'number' },
        pivotY: { type: 'number' },
        overwrite: { type: 'boolean', description: 'Whether to overwrite an existing sprite (.png/.txt) at the same path/name. Defaults to true. When false and the sprite already exists, nothing is written and the call returns { ok: false, reason: "exists" }.' },
      },
      required: ['images'],
      additionalProperties: false,
    },
  },
];

export const AGENT_TOOL_SCHEMAS_RESOURCE_PROVIDER = [
  ...SHARED_AGENT_TOOL_SCHEMAS,
  ...RESOURCE_ONLY_IMAGE_TOOLS,
];
