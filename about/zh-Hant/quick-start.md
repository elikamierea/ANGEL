# Quick Start：第一次開啟後該做什麼

> 如果你是第一次使用 ANGEL GUI，建議按下面這個順序完成一次最小驗證流程。

## 1. 先設定 Provider / API Key

先打開模型相關設定，填入你要使用的 Provider 與存取憑證。

建議至少完成以下內容：

- 選擇 Provider
- 確認呼叫方式 / Method
- 填寫模型名稱
- 如果目前的 Provider 需要憑證，填寫 API Key 或 OAuth 資訊

如果你還沒設定過，可以先看：

- (Provider 設定)[provider-setup.md]

## 2. 用一次對話驗證 Key 可用

設定完成後，打開 Agent Chat，傳送一條最簡單的測試訊息，例如：

- `hello`
- `test`
- `你好，請回覆一句確認連線正常`

如果 Agent 能正常回覆，通常表示：

- Provider 設定已大致正確
- Key / Token 可用
- 目前的模型請求通道已打通

如果在這一步就無法對話，建議先不要繼續後面的專案流程，而是先回頭檢查 Provider 設定。

## 3. 新增一個 Default 專案

接下來，用 **File → New Project** 建立一個新專案，並選擇：

- `Default`

這樣可以先用最小範本驗證本機專案流程是否正常。

建立後，確認專案可以正常開啟，並看到預設內容與基本介面。

如果你還不熟悉專案建立流程，可以繼續看：

- (專案建立與開啟（New/Open/Save）)[project-io.md]

## 4. 編譯一次專案，驗證環境

專案建立完成後，用 **Execute** 選單進行一次編譯。

建議先執行最基礎的一步：

- Compile

如果編譯通過，通常表示：

- 本機工程範本可用
- 編譯通道可用
- 目前的專案環境大致正常

後續如果需要，也可以繼續嘗試：

- Run
- Test

相關說明可參考：

- (執行與運行（Compile/Run/Test）)[execute.md]

## 5. 如果以上都沒問題，就可以開始正常使用

當下面這幾項都通過時，通常就表示你的環境已經大致準備好了：

- Provider / API Key 設定完成
- Agent Chat 可以正常對話
- 可以成功建立 `Default` 專案
- 專案可以成功編譯

如果這些都正常，就可以開始繼續使用圖形編輯、Agent、資源工具與其他功能了。

- 返回目錄： (Back to Home)[home.md]
