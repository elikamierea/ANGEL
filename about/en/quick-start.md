# Quick Start: What to do after first launch

> If this is your first time using ANGEL GUI, it is recommended to go through the following minimal verification flow in order.

## 1. Configure your Provider / API Key first

Open the model-related settings and fill in the Provider and access credentials you want to use.

It is recommended to complete at least the following:

- Choose a Provider
- Confirm the request method / Method
- Enter the model name
- If the current Provider requires credentials, enter the API Key or OAuth information

If you have not configured this before, you can start here:

- (Provider setup)[provider-setup.md]

## 2. Use a simple chat message to verify the key works

After configuration, open Agent Chat and send the simplest possible test message, for example:

- `hello`
- `test`
- `Hi, please reply with one short confirmation so I know the connection works.`

If the Agent replies normally, that usually means:

- The Provider configuration is basically correct
- The key / token is valid
- The current model request chain is working

If chat is already failing at this step, it is recommended not to continue with the project flow yet. Go back and check the Provider configuration first.

## 3. Create a Default project

Next, use **File → New Project** to create a new project, and choose:

- `Default`

This lets you verify the local project flow using the smallest template first.

After creation, confirm that the project opens correctly and that you can see the default content and basic UI.

If you are not familiar with project creation yet, you can continue here:

- (Creating and opening projects)[project-io.md]

## 4. Compile the project once to verify the environment

After the project is created, use the **Execute** menu to run one compile.

It is recommended to start with the most basic step:

- Compile

If compilation succeeds, that usually means:

- The local project template is usable
- The compile pipeline is working
- The current project environment is basically healthy

If needed, you can also continue with:

- Run
- Test

For related details, see:

- (Execute and run)[execute.md]

## 5. If everything above works, you can start using the app normally

Once the following items all pass, your environment is usually ready enough for normal use:

- Provider / API Key configuration is complete
- Agent Chat can hold a normal conversation
- You can successfully create a `Default` project
- The project can compile successfully

If all of these are working, you can move on to graph editing, Agents, resource tools, and the rest of the features.

- Back to directory: (Back to Home)[home.md]
