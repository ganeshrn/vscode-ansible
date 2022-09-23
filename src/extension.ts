/* eslint-disable  @typescript-eslint/no-explicit-any */
/* "stdlib" */
import * as vscode from "vscode";
import * as path from "path";
import {
  commands,
  ExtensionContext,
  extensions,
  StatusBarItem,
  window,
  StatusBarAlignment,
  ThemeColor,
  MarkdownString,
  workspace,
} from "vscode";
import { toggleEncrypt } from "./features/vault";

/* third-party */
import {
  LanguageClient,
  LanguageClientOptions,
  NotificationType,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

/* local */
import { AnsiblePlaybookRunProvider } from "./features/runner";
import {
  getConflictingExtensions,
  showUninstallConflictsNotification,
} from "./extensionConflicts";
import { formatAnsibleMetaData } from "./features/utils/formatAnsibleMetaData";
import { languageAssociation } from "./features/fileAssociation";
import { SettingsManager } from "./settings";
import { WisdomManager } from "./features/wisdom"

let client: LanguageClient;
let isActiveClient = false;
let cachedAnsibleVersion: string;

// ansible metadata bar item
let metadataStatusBar: StatusBarItem;

export function activate(context: ExtensionContext): void {
  new AnsiblePlaybookRunProvider(context);

  // dynamically associate "ansible" language to the yaml file
  languageAssociation(context);

  context.subscriptions.push(
    commands.registerCommand("extension.ansible.vault", toggleEncrypt)
  );

  context.subscriptions.push(
    commands.registerCommand(
      "extension.resync-ansible-inventory",
      resyncAnsibleInventory
    )
  );

  const extSettings = new SettingsManager();
  extSettings.initialize();

  // create a new ansible metadata status bar item that we can manage
  metadataStatusBar = window.createStatusBarItem(StatusBarAlignment.Right, 100);
  context.subscriptions.push(metadataStatusBar);

  metadataStatusBar.text = cachedAnsibleVersion;
  metadataStatusBar.show();

  const serverModule = context.asAbsolutePath(
    path.join("out", "server", "src", "server.js")
  );

  // server is run at port 6009 for debugging
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6010"] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  const clientOptions: LanguageClientOptions = {
    // register the server for Ansible documents
    documentSelector: [{ scheme: "file", language: "ansible" }],
  };

  client = new LanguageClient(
    "ansibleServer",
    "Ansible Server",
    serverOptions,
    clientOptions
  );

  // start the client and the server
  startClient();

  notifyAboutConflicts();

  // Update ansible meta data in the statusbar tooltip (client-server)
  window.onDidChangeActiveTextEditor(updateAnsibleInfo);
  workspace.onDidOpenTextDocument(updateAnsibleInfo);
  workspace.onDidChangeConfiguration(() => extSettings.initialize());

  const disposable = vscode.commands.registerCommand(
    "extension.inline-completion-settings",
    () => {
      vscode.window.showInformationMessage("Show settings");
    }
  );

  context.subscriptions.push(disposable);
  
  let wisdomMgr = new WisdomManager(context, extSettings.settings)

  vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    wisdomMgr.getProvider()
  );
}

const startClient = async () => {
  try {
    await client.start();
    isActiveClient = true;

    // If the extensions change, fire this notification again to pick up on any association changes
    extensions.onDidChange(() => {
      notifyAboutConflicts();
    });

    // Update ansible meta data in the statusbar tooltip (client-server)
    updateAnsibleInfo();
  } catch (error) {
    console.error("Language Client initialization failed");
  }
};

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  isActiveClient = false;
  return client.stop();
}

/**
 * Finds extensions that conflict with our extension.
 * If one or more conflicts are found then show an uninstall notification
 * If no conflicts are found then do nothing
 */
function notifyAboutConflicts(): void {
  const conflictingExtensions = getConflictingExtensions();
  if (conflictingExtensions.length > 0) {
    showUninstallConflictsNotification(conflictingExtensions);
  }
}

/**
 * Sends notification to the server to invalidate ansible inventory service cache
 * And resync the ansible inventory
 */
function resyncAnsibleInventory(): void {
  if (isActiveClient) {
    client.onNotification(
      new NotificationType(`resync/ansible-inventory`),
      (event) => {
        console.log("resync ansible inventory event ->", event);
      }
    );
    client.sendNotification(new NotificationType(`resync/ansible-inventory`));
  }
}

/**
 * Sends notification with active file uri as param to the server
 * and receives notification from the server with ansible meta data associated with the opened file as param
 */
function updateAnsibleInfo(): void {
  if (window.activeTextEditor?.document.languageId !== "ansible") {
    metadataStatusBar.hide();
    return;
  }

  if (isActiveClient) {
    metadataStatusBar.tooltip = new MarkdownString(
      ` $(sync~spin) Fetching... `,
      true
    );
    metadataStatusBar.show();
    client.onNotification(
      new NotificationType(`update/ansible-metadata`),
      (ansibleMetaDataList: any) => {
        const ansibleMetaData = formatAnsibleMetaData(ansibleMetaDataList[0]);
        if (ansibleMetaData.ansiblePresent) {
          console.log("ansible found");
          cachedAnsibleVersion =
            ansibleMetaData.metaData["ansible information"]["ansible version"];
          const tooltip = ansibleMetaData.markdown;
          metadataStatusBar.text = ansibleMetaData.eeEnabled
            ? `$(bracket-dot) [EE] ${cachedAnsibleVersion}`
            : `$(bracket-dot) ${cachedAnsibleVersion}`;
          metadataStatusBar.backgroundColor = "";
          metadataStatusBar.tooltip = tooltip;

          if (!ansibleMetaData.ansibleLintPresent) {
            metadataStatusBar.text = `$(warning) ${cachedAnsibleVersion}`;
            metadataStatusBar.backgroundColor = new ThemeColor(
              "statusBarItem.warningBackground"
            );
          }

          metadataStatusBar.show();
        } else {
          console.log("ansible not found");
          metadataStatusBar.text = "$(error) Ansible Info";
          metadataStatusBar.tooltip = ansibleMetaData.markdown;
          metadataStatusBar.backgroundColor = new ThemeColor(
            "statusBarItem.errorBackground"
          );
          metadataStatusBar.show();
        }
      }
    );
    const activeFileUri = window.activeTextEditor?.document.uri.toString();
    client.sendNotification(new NotificationType(`update/ansible-metadata`), [
      activeFileUri,
    ]);
  }
}
