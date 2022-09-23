import * as vscode from "vscode";

import {
  ExtensionContext,
  window,
  StatusBarAlignment,
  StatusBarItem,
  ThemeColor,
} from "vscode";
import { Configuration, OpenAIApi } from "openai";

import { ExtensionSettings } from "../interfaces/extensionSettings";
import { SettingsManager } from "./../settings";

export class WisdomManager {
  private context;
  private settings: ExtensionSettings;
  private wisdomStatusBar: StatusBarItem;
  private openai: OpenAIApi;

  constructor(context: ExtensionContext, settings: ExtensionSettings) {
    this.context = context;
    this.settings = settings;
    this.openai = this.initializeOpenAI();

    // create a new ansible wisdom status bar item that we can manage
    this.wisdomStatusBar = window.createStatusBarItem(
      StatusBarAlignment.Right,
      100
    );

    this.handleStatusBar();
    this.initializeOpenAI();
  }

  private initializeOpenAI(): OpenAIApi {
    const configuration = new Configuration({
      apiKey: this.settings.wisdom.apiKey,
      basePath: this.settings.wisdom.basePath,
    });

    return new OpenAIApi(configuration);
  }

  private handleStatusBar() {
    //wisdomStatusBar.command = await window.showInputBox("Enable Wisdom")
    this.wisdomStatusBar.text = "Wisdom";
    //wisdomStatusBar.color = "#FF0000";
    this.wisdomStatusBar.backgroundColor = new ThemeColor(
      "statusBarItem.prominentForeground"
    );
    this.context.subscriptions.push(this.wisdomStatusBar);
    this.wisdomStatusBar.show();
  }

  public getProvider(): vscode.InlineCompletionItemProvider {
    const provider: vscode.InlineCompletionItemProvider = {
      provideInlineCompletionItems: async (
        document,
        position,
        context,
        token
      ) => {

        const commentRegexEp =
          /(?<blank>\s*)(?<comment>#\s*)(?<description>.*)(?<end>$)/;
        const taskRegexEp =
          /(?<blank>\s*)(?<list>-\s*name\s*:\s*)(?<description>.*)(?<end>$)/;
        if (position.line <= 0) {
          return;
        }
        const lineBefore = document.lineAt(position.line - 1).text;
        const matchedPattern =
          lineBefore.match(commentRegexEp) || lineBefore.match(taskRegexEp);
        if (matchedPattern?.groups?.description) {
          console.log(`current wisdom settings:\n${this.settings.wisdom}\n`)
          console.log("provideInlineCompletionItems triggered");

          this.wisdomStatusBar.tooltip = "processing...";
          const response = await this.openai.createCompletion({
            model: this.settings.wisdom.model,
            prompt: document.getText(
              new vscode.Range(new vscode.Position(0, 0), position)
            ),
            temperature: this.settings.wisdom.temperature,
            max_tokens: this.settings.wisdom.maxTokens,
            top_p: this.settings.wisdom.topP,
            frequency_penalty: 0,
            presence_penalty: 0,
            stop: this.settings.wisdom.stop,
          });

          console.log(response.data.choices);

          this.wisdomStatusBar.tooltip = "Done";
          if (response.data.choices != undefined) {
            const insertText = response.data.choices[0].text || "";
            return [
              {
                insertText,
              },
            ];
          } else {
            return [];
          }
        }
      },
    };
    return provider;
  }
}
