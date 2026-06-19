# Quick Start：第一次打开后做什么

> 如果你是第一次使用 ANGEL GUI，建议按下面这个顺序完成一次最小验证流程。

## 1. 先配置 Provider / API Key

先打开模型相关设置，填入你要使用的 Provider 与访问凭据。

建议至少完成以下内容：

- 选择 Provider
- 确认调用方式 / Method
- 填写模型名称
- 如果当前 Provider 需要凭据，填写 API Key 或 OAuth 信息

如果你还没配过，可以先看：

- (Provider 配置)[provider-setup.md]

## 2. 用一次对话验证 Key 可用

配置完成后，打开 Agent Chat，发送一条最简单的测试消息，例如：

- `hello`
- `test`
- `你好，请回复一句确认连接正常`

如果 Agent 能正常回复，通常说明：

- Provider 配置已基本正确
- Key / Token 可用
- 当前模型请求链路已打通

如果这里就无法对话，建议先不要继续后面的项目流程，而是先回头检查 Provider 配置。

## 3. 新建一个 Default 项目

接下来，用 **File → New Project** 创建一个新项目，并选择：

- `Default`

这样可以先用最小模板验证本地项目流程是否正常。

创建后，确认项目可以正常打开，并看到默认内容与基本界面。

如果你还不熟悉项目创建流程，可以继续看：

- (项目创建与打开（New/Open/Save）)[project-io.md]

## 4. 编译一次项目，验证环境

项目创建完成后，用 **Execute** 菜单进行一次编译。

建议先执行最基础的一步：

- Compile

如果编译通过，通常说明：

- 本地工程模板可用
- 编译链路可用
- 当前项目环境基本正常

后续如果需要，也可以继续尝试：

- Run
- Test

相关说明可参考：

- (执行与运行（Compile/Run/Test）)[execute.md]

## 5. 如果以上都没问题，就可以开始正常使用

当下面这几项都通过时，通常就说明你的环境已经基本准备好了：

- Provider / API Key 配置完成
- Agent Chat 可以正常对话
- 可以成功创建 `Default` 项目
- 项目可以成功编译

如果这些都正常，就可以开始继续使用图编辑、Agent、资源工具和其他功能了。

- 返回目录： (Back to Home)[home.md]
