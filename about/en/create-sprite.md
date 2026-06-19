# Create Sprite

> This page explains how to create Sprite resources from image frames.

## What Create Sprite is for

`Create Sprite` is used to organize one or more images into sprite resources that can be used inside the project.

It is well suited to situations like these:

- You already have a static image and want to use it as a sprite
- You have multiple sequential frame images and want to combine them into an animation
- You want to explicitly set the pivot and write it into the resource metadata

## Basic workflow

### 1. Open Create Sprite

From the top menu, go to:

- **Resource → Create Sprite**

After opening it, you will see the UI for importing images, setting the output path, naming the resource, adjusting the pivot, and previewing frames.

### 2. Choose input images

Import one or more images in the file selection area.

- If you select only one image, you can think of it as a single-frame sprite
- If you select multiple images, they will be generated as multiple frames in the current import order

If you want to make a simple frame animation, this is usually where you import all of the sequential frames at once.

### 3. Set the output path and name

Next, fill in:

- **Path**: output directory
- **Name**: resource name

The default path will usually land under:

- `src/assets/sprites`

That is also the most natural location for sprite resources.

## 4. Adjust the pivot

Create Sprite supports:

- `Pivot X`
- `Pivot Y`

The pivot is written into the generated resource metadata and describes the reference point for the sprite.

A practical way to think about it is:

- The point under a character's feet
- The center point of an object
- A position near a weapon grip
- The alignment anchor of a UI tile

You can:

- Enter values directly
- Fine-tune them while looking at the preview

## 5. Preview frames

In the preview area, you can:

- View the current frame
- Switch to the previous or next frame
- Check whether the pivot position looks correct

If you imported multiple images, this step becomes especially important because it helps you confirm:

- Whether the frame order is correct
- Whether the frame content looks right
- Whether the current pivot works for the entire frame set

## 6. Click Create to generate the resource

Once everything looks correct, click:

- **Create**

The system will generate the corresponding sprite resource files based on the current input images, name, path, and pivot.

## What the output actually is

There is one important point here:

**The generated sprite is not a single file. It is a pair of files.**

You can usually think of it like this:

1. **An image file**
   - Used to store the actual sprite image content, such as the atlas or combined image

2. **A metadata file**
   - Used to store descriptive information about the sprite
   - For example:
     - Image size
     - Frame count
     - Per-frame information
     - Pivot position

In the current implementation, that metadata is written out as a **separate companion file**.

## One very important warning

If you later move, copy, or reorganize this sprite resource:

- **The image file and the metadata file must be moved together**
- Do not move only one of them

Otherwise, common outcomes include:

- The image still exists, but the project no longer knows the frame or pivot information
- The metadata still exists, but the actual image cannot be found
- Resource references break or loading fails

So the safest way to think about it is:

**These two files together make up one complete sprite resource.**

## When it is most useful

Create Sprite is well suited to:

- Quickly importing character frame animations
- Generating simple object sprites
- Adding immediately usable image resources to the project
- Creating sprite resources without hand-writing metadata yourself

## A practical suggestion

If this is your first time using Create Sprite, the recommended order is usually:

1. Start by testing with one image, or just a few images
2. Confirm that the path, name, and pivot match your expectations
3. After generation, confirm that both output files are present
4. Only after that move on to more serious or larger-scale resource creation

This helps you get the workflow running first, and avoids difficult debugging later when importing a lot of frames at once.

- Back to directory: (Back to Home)[home.md]
