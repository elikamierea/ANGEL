export const SHARED_AGENT_TOOL_SCHEMAS = [
  {
    type: 'function',
    name: 'list_node',
    description: 'Return visible nodes in DFS order for the requested layer. layer is required. Optionally provide root to list only that visible node and its descendants as a subtree. Each returned item includes name, depth, and synopsis when non-empty.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        root: { type: 'string' },
      },
      required: ['layer'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_empty_node',
    description: 'Return visible nodes in DFS order for the requested layer, but only include nodes whose detail is empty. layer is required. Optionally provide root to limit the search to that visible node and its descendants as a subtree. Each returned item includes name, depth, and synopsis when non-empty.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        root: { type: 'string' },
      },
      required: ['layer'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_node_detail',
    description: 'Given node name (and optional layer), return node detail and connected edges. Each edge includes its id for precise follow-up update/delete calls, and uses fromNode/toNode to indicate the other endpoint direction relative to the queried node, plus node synopsis + lrtb (left/right/top/bottom). If layer is omitted, search all layers (L0-L3).',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'grep_node',
    description: 'Regex search over visible nodes in one layer. layer is required. Optionally pass root (a compound node name) to restrict the search to that node and its descendants; omit root to search the whole layer. Matches name/synopsis/detail/status using smart-case (case-insensitive unless the pattern has an uppercase letter; -i overrides). Returns capped matches, each with the node name, depth, and per-field snippets, plus total/returned/truncated. Prefer this over list_node when looking for nodes by content.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        layer: { type: 'string' },
        root: { type: 'string' },
        '-i': { type: 'boolean' },
        headLimit: { type: 'number' },
      },
      required: ['pattern', 'layer'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_node',
    description: 'Create a node.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        layer: { type: 'string' },
        synopsis: { type: 'string' },
        detail: { type: 'string' },
        status: { type: 'string' },
        colorIndex: { type: 'number' },
        lrtb: {
          type: 'object',
          properties: {
            left: { type: 'number' },
            right: { type: 'number' },
            top: { type: 'number' },
            bottom: { type: 'number' },
          },
          required: ['left', 'right', 'top', 'bottom'],
          additionalProperties: false,
        },
        resourceBindings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['path'],
            additionalProperties: false,
          },
        },
      },
      required: ['name', 'lrtb'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_edge',
    description: 'Create an edge.',
    parameters: {
      type: 'object',
      properties: {
        fromName: { type: 'string' },
        toName: { type: 'string' },
        layer: { type: 'string' },
        edgeId: { type: 'string' },
        description: { type: 'string' },
        pathStyle: { type: 'string' },
        strokeStyle: { type: 'string' },
        arrowFrom: { type: 'boolean' },
        arrowTo: { type: 'boolean' },
        fromAnchor: {
          type: 'object',
          properties: {
            side: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
            t: { type: 'number' },
          },
          required: ['side', 't'],
          additionalProperties: false,
        },
        toAnchor: {
          type: 'object',
          properties: {
            side: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
            t: { type: 'number' },
          },
          required: ['side', 't'],
          additionalProperties: false,
        },
      },
      required: ['fromName', 'toName'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_mirror',
    description: 'Create a mirror node from an existing source node. source and lr.left/lr.top are required. Other mirror fields are optional.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        layer: { type: 'string' },
        lr: {
          type: 'object',
          properties: {
            left: { type: 'number' },
            top: { type: 'number' },
          },
          required: ['left', 'top'],
          additionalProperties: false,
        },
        name: { type: 'string' },
        synopsis: { type: 'string' },
        detail: { type: 'string' },
        status: { type: 'string' },
        colorIndex: { type: 'number' },
        color: { type: 'number' },
        resourceBindings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['path'],
            additionalProperties: false,
          },
        },
      },
      required: ['source', 'lr'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'delete_node',
    description: 'Delete a node by name, using the same deletion path as the user UI.',
    parameters: {
      type: 'object',
      properties: {
        targetName: { type: 'string' },
      },
      required: ['targetName'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'delete_edge',
    description: 'Delete an edge using edgeId, or by a unique fromName/toName pair, using the same deletion path as the user UI.',
    parameters: {
      type: 'object',
      properties: {
        edgeId: { type: 'string' },
        fromName: { type: 'string' },
        toName: { type: 'string' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_edge',
    description: 'Update an edge using the same core path as the inspector edge editor. edgeId is recommended.',
    parameters: {
      type: 'object',
      properties: {
        edgeId: { type: 'string' },
        pathStyle: { type: 'string' },
        strokeStyle: { type: 'string' },
        arrowFrom: { type: 'boolean' },
        arrowTo: { type: 'boolean' },
        description: { type: 'string' },
      },
      required: ['edgeId'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'arrange',
    description: 'Arrange nodes into an m-by-n grid within a target region.',
    parameters: {
      type: 'object',
      properties: {
        lrtb: {
          type: 'object',
          properties: {
            left: { type: 'number' },
            right: { type: 'number' },
            top: { type: 'number' },
            bottom: { type: 'number' },
          },
          required: ['left', 'right', 'top', 'bottom'],
          additionalProperties: false,
        },
        m: { type: 'number' },
        n: { type: 'number' },
        axis: { type: 'string', enum: ['x', 'y'] },
        nodeNames: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['m', 'n', 'nodeNames'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'auto_layout',
    description: 'Run ELK layered auto layout on a subgraph and place the result into a target region. direction is optional; when omitted it is inferred automatically.',
    parameters: {
      type: 'object',
      properties: {
        nodeNames: {
          type: 'array',
          items: { type: 'string' },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fromName: { type: 'string' },
              toName: { type: 'string' },
            },
            required: ['fromName', 'toName'],
            additionalProperties: false,
          },
        },
        direction: { type: 'string', enum: ['RIGHT', 'LEFT', 'DOWN', 'UP'] },
        targetLrtb: {
          type: 'object',
          properties: {
            left: { type: 'number' },
            right: { type: 'number' },
            top: { type: 'number' },
            bottom: { type: 'number' },
          },
          required: ['left', 'right', 'top', 'bottom'],
          additionalProperties: false,
        },
      },
      required: ['nodeNames', 'edges', 'targetLrtb'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read',
    description: 'Read a UTF-8 text file from the currently opened project root by relative path. Do not use for binary files (png/jpg/gif/webp/audio/etc).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        offset: { type: 'number' },
        limit: { type: 'number' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read_image',
    description: 'Attach an image from project path into model context (vision input) without extra interpretation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read_docx',
    description: 'Read a .docx file and extract plain text. Desktop (Electron) mode only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        maxChars: { type: 'number' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'write',
    description: 'Write/overwrite a text file under the currently opened project root by relative path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'edit',
    description: 'Edit a text file with exact string replacement under the currently opened project root.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
      },
      required: ['path', 'oldText', 'newText'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'grep_file',
    description: 'Regex content search over project files, relative to the project root. pattern is required (smart-case: case-insensitive unless it has an uppercase letter; -i overrides). Optionally scope with path (a subdirectory) and/or glob (e.g. "**/*.js"). output_mode: "files_with_matches" (default) returns matching file paths with per-file counts; "content" returns matching lines with line numbers; "count" returns per-file counts. Skips node_modules/.git/build dirs, binary files, and files over 2MB. Results are capped (head_limit, default 50) with a truncated flag; narrow path/glob/pattern when truncated.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
        glob: { type: 'string' },
        output_mode: { type: 'string', enum: ['files_with_matches', 'content', 'count'] },
        '-i': { type: 'boolean' },
        head_limit: { type: 'number' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'run_command',
    description: 'Execute a Windows shell command inside the currently opened project root (cmd.exe /d /s /c). Use for file moves, deletions, or other short tasks. Returns stdout/stderr/exit code.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeoutSeconds: { type: 'number' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'web_fetch',
    description: 'Fetch a web page by URL and return text content.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        maxChars: { type: 'number' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'compile_project',
    description: 'Compile the currently opened project using the same desktop Execute chain as the topbar Compile action. Desktop (Electron) mode only.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'run_project',
    description: 'Run the currently opened project using the same desktop Execute chain as the topbar Run actions. Set debug=true to run with --debug. Set testName to run a named test. If timeoutMs is omitted, agent-triggered runs default to 30000ms so the tool can return accumulated output without waiting forever. Desktop (Electron) mode only.',
    parameters: {
      type: 'object',
      properties: {
        debug: { type: 'boolean' },
        testName: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read_skill',
    description: 'Read a skill prompt file by name from code/prompts/skills.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_skills',
    description: 'List all skills under code/prompts/skills.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'update_node',
    description: 'Update a node by targetName. This is a PARTIAL update: only the fields you pass are changed, and any field you omit keeps its existing value. Send just the fields you want to change — do not resend the whole node every time. (Note: omitting a field preserves it; passing a text field as an empty string clears it.)',
    parameters: {
      type: 'object',
      properties: {
        targetName: { type: 'string' },
        layer: { type: 'string' },
        name: { type: 'string' },
        synopsis: { type: 'string' },
        detail: { type: 'string' },
        status: { type: 'string' },
        colorIndex: { type: 'number' },
        lrtb: {
          type: 'object',
          properties: {
            left: { type: 'number' },
            right: { type: 'number' },
            top: { type: 'number' },
            bottom: { type: 'number' },
          },
          required: ['left', 'right', 'top', 'bottom'],
          additionalProperties: false,
        },
        resourceBindings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['path'],
            additionalProperties: false,
          },
        },
      },
      required: ['targetName'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'screenshot_canvas',
    description: 'Capture the current mind-map canvas as a PNG image (scaled to 50% of physical resolution) and attach it to the conversation for visual inspection.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_viewport',
    description: 'Return the current viewport state: zoom level and the canvas-coordinate bounding box (left/top/right/bottom) of the visible area.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'set_viewport',
    description: 'Pan and zoom the canvas to a specific position. Provide zoom and/or left/top in canvas coordinates. Returns the resulting viewport bounding box (left/top/right/bottom).',
    parameters: {
      type: 'object',
      properties: {
        zoom: { type: 'number' },
        left: { type: 'number' },
        top: { type: 'number' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'todo_write',
    description: 'Replace the current task-tracking todo list with the given items. Use this to plan multi-step work and keep progress visible. Each call replaces the entire list, so always pass the full set of items, not just changed ones. Use status "blocked" when an item cannot proceed without external input or resolution.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'] },
            },
            required: ['content', 'status'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
];

