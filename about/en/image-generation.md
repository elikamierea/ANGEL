# Image generation

> This page is about asking the agent to generate images for your project, and — just as importantly — what to realistically expect from it.

## Where image generation fits in the workflow

Image generation is usually **not** the first thing you do. A more practical order is:

1. Build the design (Graph) and ask the agent to implement the gameplay and logic **using placeholders** for visuals — plain shapes, solid colors, simple rectangles and circles.
2. Get that placeholder-driven build to **compile and run**, so the mechanics are roughly correct.
3. **Only then** start replacing placeholders with generated images.

The reason is simple: visuals are the last thing worth investing in. If the mechanics are still changing, regenerating art over and over is wasted effort.

## The generate → integrate → test loop

Once the placeholder build roughly works, image generation becomes an iterative loop, not a one-shot step:

1. **Generate** an image for a specific element (a player, a coin, an enemy, a background…).
2. **Put it in** — save it into the project and wire it into the code in place of the placeholder.
3. **Run and debug** — actually run the project and look at the result in the real scene, at the real size, against the real background.
4. **Regenerate** — based on what you saw, adjust the request and generate again.

You will usually go around this loop several times per asset. Seeing an image in isolation tells you very little; seeing it **inside the running scene** is what tells you whether it works.

How it is wired in ANGEL:

- Pick a template with image generation when creating the project — **Default (+image generation)** or **Extended (+image generation)** — so the project includes the resource-provider agent. See (Creating and opening projects)[project-io.md].
- Generated images are saved under `assets/generated/images/`, and their path is reported back to the agent, so it can reference them and feed them into tools like Create Sprite. See (Create Sprite)[create-sprite.md].
- Image generation is currently an OpenAI (API key) capability. You can pick a specific image model under **Settings → Agent Model**, or leave it on auto.

## A very important expectation: quality is not guaranteed

This deserves to be stated plainly:

**Current image models — from every vendor — are not good enough to make a generated image perfectly fit a stylized, specific scene. The final result is not guaranteed.**

In practice this means:

- A generated image may look fine on its own but feel off once placed in your scene — wrong style, wrong proportions, wrong silhouette, wrong color against the background.
- Matching a consistent art style across many assets is especially hard.
- Tight constraints (exact pose, exact perspective, pixel-accurate edges, clean transparent cutouts, "the same character but turning left") are often not met reliably.
- More iterations help, but there is a ceiling: some looks simply cannot be reached with current models.

So the healthy way to use it is:

- Treat generated art as a **fast way to get from placeholders to "good enough"**, not as a way to get final, shippable, perfectly on-style art.
- Keep prompts concrete about what matters (subject, silhouette, palette, whether the background should be transparent or solid), but accept that some requests will not land.
- Be ready to **do the last mile yourself** — manual touch-up, or replacing the most important assets with hand-made art.
- Decide which assets actually need to be on-style, and spend your iterations there; let less important assets stay rough.

## A practical conclusion

- Do the mechanics first on placeholders; bring in image generation after it runs.
- Expect a generate → integrate → run → regenerate loop, judged inside the real scene.
- Do not expect perfect, fully style-matched results — current models cannot guarantee that, so plan for iteration and a manual last mile.

- Back to directory: (Back to Home)[home.md]
