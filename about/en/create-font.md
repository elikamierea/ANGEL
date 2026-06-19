# Create Font

> This page explains how to create bitmap font resources from font files.

## What Create Font is for

`Create Font` is used to convert a font file into bitmap font resources that can be used inside the project.

It is well suited to situations like these:

- You want to package a font into the project resources
- You need explicit control over size, charset, hinting, and antialias settings
- You want to preview the result before generating the final font resource

## Basic workflow

### 1. Open Create Font

From the top menu, go to:

- **Resource → Create Font**

After opening it, you will see settings related to font file selection, output path, name, size, charset, preview, and export.

## 2. Choose a font file

First choose a font file as the input.

The currently supported input types include:

- `.ttf`
- `.otf`
- `.woff`
- `.woff2`

### A current note about system fonts on Windows

If you want to use a **system font** on Windows, do not assume that an installed system font is already directly usable by the GUI.

**We do not currently have full direct support for calling system-installed fonts automatically.**

The current practical workaround is:

1. Open: `C:\Windows\Fonts`
2. Find the font you want to use
3. Copy the font file to some other location that is easy for you to access
4. Then select that copied font file in `Create Font`

So the safer current understanding is:

- You can use Windows system fonts
- **But you should first copy the font file out of `C:\Windows\Fonts` before selecting it**

That is the current temporary workflow.

## 3. Set the output path and name

Next, fill in:

- **Path**: output directory
- **Name**: resource name

The default path will usually land under:

- `src/assets/fonts`

That is also the most natural location for font resources.

## 4. Set size, hinting, and antialias

Create Font supports:

- **Size**: font size
- **Hinting**: hinting strength
- **Antialias**: whether antialiasing is enabled

### Size

The font size directly affects the glyph size in the final generated font atlas.

### Hinting

The current options are:

- `none`
- `slight`
- `normal`
- `full`

A simple practical way to think about this is:

- Stronger hinting tends to apply more geometric correction for small-size display
- But the actual result still depends on the font itself and the visual style you want

### Antialias

The current options are:

- `on`
- `off`

A simple practical reading is usually:

- `on`: smoother, good for general UI and normal font rendering
- `off`: sharper, better for some pixel-style cases or situations where you specifically do not want softened edges

## 5. Set the charset

This step is important.

`Charset` determines **which characters are actually included in the exported font resource**.

That means if a character is not part of the charset, it usually will not exist in the generated resource.

You can:

- Type characters directly into the text box
- Or import a `.txt` file and let the system scan and append the characters found inside it

This is especially important for Chinese text, symbol sets, or project-specific UI copy.

A practical approach is:

- Prepare a `.txt` file containing your common text
- Import it so the system can scan the characters automatically
- Then manually add a few special symbols if needed

## 6. Preview the font result

Create Font provides a preview text input and a preview zoom setting.

You can:

- Enter a piece of test text
- Adjust the preview zoom
- Observe the rough display result under the current size, hinting, and antialias settings

This step is good for checking:

- Whether the font size feels correct
- Whether the edge style matches your expectations
- Whether mixed Chinese, English, digits, and symbols are acceptable together

## 7. Click Create to generate the font resource

Once the settings look correct, click:

- **Create**

The system will generate font resources based on the current font file, size, charset, and rendering parameters.

## What the output actually is

The generated font resource is currently not a single file. It is a set of companion files.

At a minimum, you can think of it like this:

- One or more font page image files
  - For example: `_fontpageN.png`
- One font metadata file
  - For example: `.font.txt`

In other words, the image pages and the metadata description file belong together.

## Usage warnings

Like sprite resources, font resources should not be moved one file at a time.

The safer approach is to:

- Keep all files from the same font resource together
- Move them together
- Copy them together

Otherwise, you may end up with:

- Image pages without metadata
- Metadata without image pages
- Incomplete resource references that cause font loading failures

## A practical suggestion

If this is your first time using Create Font, the recommended order is usually:

1. Start with one clearly accessible font file
2. Test with a smaller charset first
3. Adjust size, hinting, and antialias while checking the preview
4. Generate a minimal usable version first
5. Only after the flow is confirmed should you expand to a more complete charset

This is usually much easier to troubleshoot than exporting a huge charset from the very beginning.

- Back to directory: (Back to Home)[home.md]
