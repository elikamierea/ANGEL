# Provider setup

> This page explains how to configure the model Provider, model names, and related access credentials.

## What can currently be configured

In the model settings, the main configurable items currently include:

- Provider type
- Request method / Method
- Text model name
- Image model name
- API Key / OAuth, depending on the provider

## Providers currently connected

The current GUI has already connected, or is prepared to connect, to the following Providers:

- OpenAI
- Anthropic
- Google
- xAI (Grok)
- DeepSeek

Among them:

- **OpenAI** currently supports both `API Key` and `OAuth`
- **Anthropic / Google / xAI / DeepSeek** are currently configured mainly through `API Key`

If you only want to quickly verify that the environment is working, the simplest approach is usually:

1. Choose a Provider
2. Enter the model name and credentials
3. Save the settings
4. Open Agent Chat and send the simplest possible message to see whether it replies normally

That is the most direct way to verify whether the key is usable.

## About switching Providers in the middle of a session

Support for switching Providers in the middle of the same session is still fairly limited right now, so it is not recommended as a stable workflow.

The reason is simple: different Providers do not use exactly the same request format, context organization, response structure, or tool-calling details. Even if the UI makes it look like you are simply continuing one conversation, the underlying context may not transfer cleanly.

So the safer recommendation right now is:

- **If you want to switch Providers, try to start a new session**
- Do not assume that the same session history will continue perfectly smoothly across different Providers

If you are only testing different models casually, the risk is usually small. But if the current session already contains a lot of context, tool calls, or image inputs, switching Providers in the middle is more likely to create behavioral differences.

## Humanize: still an experimental half-finished feature

There is also a `Humanize`-related switch in the model settings.

Its goal is to make responses feel more natural and more like something a person would say, rather than overly mechanical or templated.

However, this part is still better treated as an **experimental, half-finished feature** for now:

- Sometimes it makes phrasing feel more natural
- Sometimes it may also introduce unstable style changes
- It is not yet something that should be treated as a fully mature production feature

If you care a lot about output style, you can try comparing it on and off. But if your current priority is stability, predictability, and easier troubleshooting, it is usually better to leave it off for now.

## A practical suggestion

If this is your first time configuring a Provider, the recommended order is usually:

1. Choose one Provider first
2. Enter the model name and credentials
3. Use Agent Chat to send a short message and verify that it works
4. Once the basics are stable, then consider enabling extra options such as humanize

This makes it easier to separate basic connectivity problems from style-related feature issues.

- Back to directory: (Back to Home)[home.md]
