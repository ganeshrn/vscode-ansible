import { integer } from "vscode-languageclient";

export interface ExtensionSettings {
  wisdom: AnsibleWisdomSettings;
}

export interface AnsibleWisdomSettings {
  enable: boolean;
  type: string;
  apiKey: string;
  basePath: string;
  model: string;
  temperature: number;
  maxTokens: integer;
  topP: integer;
  stop: Array<string> | undefined;
}
