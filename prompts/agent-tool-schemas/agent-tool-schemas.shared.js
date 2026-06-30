export const SHARED_AGENT_TOOL_SCHEMAS = [
  {
    type: 'function',
    name: 'list_node',
    description: 'Return visible nodes in DFS order for the requested layer. layer is required. Optionally provide root to list only that visible node and its descendants as a subtree. Each returned item includes name, depth, fa (the parent node name; omitted for top-level roots at depth 0), and synopsis when non-empty.',
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
    description: 'Return visible nodes in DFS order for the requested layer, but only include nodes whose detail is empty. layer is required. Optionally provide root to limit the search to that visible node and its descendants as a subtree. Each returned item includes name, depth, fa (the parent node name; omitted for top-level roots at depth 0), and synopsis when non-empty.',
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
    description: 'Given node name (and optional layer), return node detail and connected edges. Each edge includes its id for precise follow-up update/delete calls, and uses fromNode/toNode to indicate the other endpoint direction relative to the queried node, plus node synopsis + lrtb (left/right/top/bottom). resourceBindings reflect the queried layer only (bindings are per-layer). If layer is omitted, search all layers (L0-L3).',
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
        head_limit: { type: 'number', description: 'Max matches to return (default 50, capped at 500). Same name as grep_file.' },
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
          description: 'Resource bindings for this node, scoped to the given layer. Each layer keeps its own independent bindings (e.g. design-layer images/sprites vs code-layer source files); bindings added on one layer are not visible on others.',
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
          description: 'Resource bindings for this node, scoped to the given layer. Each layer keeps its own independent bindings (e.g. design-layer images/sprites vs code-layer source files); bindings added on one layer are not visible on others.',
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
    description: 'Attach an image from project path into model context (vision input) without extra interpretation. By default the image is downscaled to 1/3 on each axis (~1/9 the pixels) to keep vision-token cost low; set scale to adjust (e.g. scale=1 for full resolution when you need fine detail).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        scale: { type: 'number', description: 'Downscale factor on each axis, in (0, 1]. Defaults to 0.333 (1/3 width and height). Use a larger value (up to 1 = full resolution) when you need finer detail; values are clamped to this range. Never upscales.' },
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
    description: 'Regex content search over project files, relative to the project root. pattern is required (smart-case: case-insensitive unless it has an uppercase letter; -i overrides). Optionally scope with path (a subdirectory) and/or glob (e.g. "**/*.js"). output_mode: "auto" (DEFAULT) aims to keep the reply near 500 characters — it returns the matching lines when the complete set fits that budget, otherwise a budget-trimmed list of matching files (the result carries a "representation" field saying which you got); "files_with_matches" returns matching file paths with per-file counts; "content" returns matching lines with line numbers; "count" returns per-file counts. Prefer the default auto for a first look, then re-run with content/files_with_matches when you need the full results. Skips node_modules/.git/build dirs, binary files, and files over 2MB. Results are capped (head_limit, default 50) with a truncated flag; narrow path/glob/pattern when truncated.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
        glob: { type: 'string' },
        output_mode: { type: 'string', enum: ['auto', 'files_with_matches', 'content', 'count'], description: 'Defaults to "auto" (best-effort ≤500-char reply: matching lines if they fit, else a trimmed file overview). Use "content"/"files_with_matches"/"count" to force a specific form.' },
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
    description: 'Compile the currently opened project using the same desktop Execute chain as the topbar Compile action. Desktop (Electron) mode only. By default returns a compact result: on success just {ok:true}, on failure only the error lines (not the full multi-KB build log). Set fullOutput=true to get the complete compiler stdout/stderr.',
    parameters: {
      type: 'object',
      properties: {
        fullOutput: { type: 'boolean', description: 'When true, return the complete compiler output (stdout+stderr). Default false: return only pass/fail and, on failure, the error lines.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'run_project',
    description: 'Run the currently opened project using the same desktop Execute chain as the topbar Run actions. Set debug=true to run with --debug. Set testName to run a named test. Set turbo=true to run with --turbo (synthetic timing for automation — strongly recommended for agent-driven runs so they do not block on real-time gameplay). Set scenario to a path to replay a recorded/authored scenario file via --scenario (the path may be project-root-relative or absolute; it can be a user-recorded record.txt or a scenario you wrote yourself). If timeoutMs is omitted, agent-triggered runs default to 30000ms so the tool can return accumulated output without waiting forever. RUNTIME WORKING DIRECTORY: the game runs with its working directory set to <project>/runtime/ (NOT the build/exe directory). The engine resolves cwd-relative paths there, so any output it writes — record.txt, DEBUG_LOG.txt, saves — lands under runtime/ and is readable afterward with the read tool at the project-root-relative path "runtime/<file>" (e.g. read "runtime/record.txt" to inspect a recorded run, or "runtime/DEBUG_LOG.txt" for debug logs). Assets are made available inside runtime/ automatically. Desktop (Electron) mode only.',
    parameters: {
      type: 'object',
      properties: {
        debug: { type: 'boolean' },
        turbo: { type: 'boolean', description: 'Run with --turbo: keeps the normal window/context path but uses synthetic timing for automation runs.' },
        scenario: { type: 'string', description: 'Path to a scenario file to load via --scenario. A relative path is resolved against the PROJECT ROOT (the same base as read/write/edit/grep_file). Note this is the project root, which is the SAME base used to read runtime output but is NOT itself the program runtime working directory (that is <project>/runtime/); an absolute path is used as-is. So a scenario you authored with the write tool can be replayed by passing the same relative path you wrote it to. Accepts a user-recorded record.txt or an agent-authored scenario. A run started with --record writes its capture to runtime/record.txt, so you can record once and replay it by passing scenario: "runtime/record.txt".' },
        testName: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
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
          description: 'Resource bindings for this node, scoped to the given layer. Each layer keeps its own independent bindings (e.g. design-layer images/sprites vs code-layer source files); bindings added on one layer are not visible on others.',
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
    description: 'Replace the current task-tracking todo list with the given items. Use this to plan multi-step work and keep progress visible. Each call replaces the entire list, so always pass the full set of items, not just changed ones. Use status "blocked" when an item cannot proceed without external input or resolution. When a task hits an obstacle, mark that task — and any tasks that depend on it — as "blocked", then continue working on the other, unaffected tasks instead of stopping.',
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

