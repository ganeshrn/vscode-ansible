import * as vscode from "vscode";

import { ExtensionSettings } from "./interfaces/extensionSettings";

export class SettingsManager {
  public settings: ExtensionSettings = {
    wisdom: {
      enable: true,
      type: "openai",
      apiKey: "",
      basePath: "code-davinci-002",
      model: "code-davinci-002",
      temperature: 0,
      maxTokens: 256,
      topP: 1,
      stop: undefined
    }
  }

  public initialize(): void {
    this.settings.wisdom.enable = vscode.workspace
      .getConfiguration("ansible.wisdom")
      .get("enable", true);
    this.settings.wisdom.type = vscode.workspace
      .getConfiguration("ansible.wisdom")
      .get("type", "openai");
    this.settings.wisdom.apiKey = vscode.workspace
      .getConfiguration("ansible.wisdom")
      .get("apiKey", "");
    this.settings.wisdom.basePath = vscode.workspace
      .getConfiguration("ansible.wisdom")
      .get("basePath", "https://api.openai.com/v1");
    this.settings.wisdom.model = vscode.workspace
      .getConfiguration("ansible.wisdom")
      .get("model", "code-davinci-002");
    (this.settings.wisdom.temperature = parseFloat(
      vscode.workspace
        .getConfiguration("ansible.wisdom")
        .get("temperature", "0")
    )),
      (this.settings.wisdom.maxTokens = parseInt(
        vscode.workspace
          .getConfiguration("ansible.wisdom")
          .get("maxTokens", "128")
      ));
    this.settings.wisdom.topP = parseInt(
      vscode.workspace.getConfiguration("ansible.wisdom").get("topP", "1")
    );
    this.settings.wisdom.stop = vscode.workspace
      .getConfiguration("ansible.wisdom")
      .get("stop");
  }
}
