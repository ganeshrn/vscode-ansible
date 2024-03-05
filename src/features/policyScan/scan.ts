import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { NotificationType } from "vscode-languageclient";

import { SettingsManager } from "../../settings";
import { TelemetryManager } from "../../utils/telemetryUtils";
import { registerCommandWithTelemetry } from "../../utils/registerCommands";
import { AnsibleCommands } from "../../definitions/constants";
import { extractTargetFsPath } from "../utils/fileUtils";

export class PolicyCheckProvider {
  private context;
  private client;
  public settingsManager: SettingsManager;
  private telemetry: TelemetryManager;

  constructor(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    settingsManager: SettingsManager,
    telemetry: TelemetryManager
  ) {
    this.context = context;
    this.settingsManager = settingsManager;
    this.telemetry = telemetry;
    this.client = client;
    this.initialize();
  }

  public initialize() {
    registerCommandWithTelemetry(
      this.context,
      this.telemetry,
      AnsibleCommands.ANSIBLE_POLICY_CHECK_PRERUN,
      (fileObj) => this.runPolicyCheckPreRun(fileObj),
      false
    );
    console.log('Added a "Run Ansible Policy Check Prerun" command...');
  }

  public async runPolicyCheckPreRun(
    ...ansibleFileObj: vscode.Uri[] | undefined[]
  ): Promise<void> {
    const { filePath, fileUri } = extractTargetFsPath(...ansibleFileObj);
    if (filePath === undefined) {
      vscode.window.showErrorMessage(
        "Could not determine the target file for the Ansible Policy check"
      );
      return;
    }
    console.log(`Running Ansible Policy check: ${filePath}`);
    // TODO: Check if file exist.
    this.client.sendNotification(new NotificationType(`run/policyCheck`), [
      fileUri,
      "prerun",
    ]);
    console.log(
      `Prerun policy check notification sent to language server for file ${fileUri}`
    );

    //       // Create a diagnostics collection
    //       const diagnosticsCollection =
    //         vscode.languages.createDiagnosticCollection("ansible");

    //       // Clear previous diagnostics for the file
    //       // TODO: Handle it better
    //       diagnosticsCollection.set(vscode.Uri.file(filePath), []);

    //       // Filter out diagnostics where fixed is false
    //       const filteredDiagnostics = diagnostics.filter((diagnostic) => {
    //         if (diagnostic.fixed === false) {
    //           console.log(
    //             `Diagnostic not fixed: ${diagnostic.message}, report in problem tab`
    //           );
    //           return true;
    //         }
    //         // If the diagnostic is fixed, report it in the output channel
    //         console.log(
    //           `Diagnostic fixed: ${diagnostic.message}, report in output channel`
    //         );
    //         lightSpeedManager._channel.appendLine(
    //           `[Ansible Lightspeed scan] Fixed "${diagnostic.message}" at ${diagnostic.position} in file ${filePath}`
    //         );
    //       });
    //       // Convert the diagnostics to VS Code Diagnostic objects
    //       const vscodeDiagnostics = filteredDiagnostics.map((diagnostic) => {
    //         const line = parseInt(diagnostic.position, 10);
    //         const range = new vscode.Range(
    //           new vscode.Position(line, 0),
    //           new vscode.Position(line, integer.MAX_VALUE)
    //         );

    //         let severity: vscode.DiagnosticSeverity =
    //           vscode.DiagnosticSeverity.Error;
    //         if (diagnostic.rule.severity) {
    //           if (diagnostic.rule.severity === "major") {
    //             severity = vscode.DiagnosticSeverity.Error;
    //           } else if (diagnostic.rule.severity === "minor") {
    //             severity = vscode.DiagnosticSeverity.Warning;
    //           }
    //         }
    //         const helpUri: string | undefined = diagnostic.rule.url
    //           ? diagnostic.rule.url
    //           : undefined;
    //         const helpUrlName: string =
    //           helpUri || diagnostic.tag || diagnostic.rule.id;

    //         const fileDiagnostic = new vscode.Diagnostic(
    //           range,
    //           diagnostic.message,
    //           severity
    //         );
    //         fileDiagnostic.source = "Ansilbe Lightspeed";
    //         fileDiagnostic.code = {
    //           value: diagnostic.rule.id,
    //           target: vscode.Uri.parse(helpUrlName),
    //         };
    //         return fileDiagnostic;
    //       });

    //       // Set the diagnostics for the file
    //       diagnosticsCollection.set(fileUri, vscodeDiagnostics);
    //     } else {
    //       console.log(`file ${filePath} scan returned no diagnostics`);
    //     }
    //     if (
    //       outputData.fileContent !== undefined &&
    //       outputData.fileContent !== "" &&
    //       outputData.fileContent !== fileContent &&
    //       this.settingsManager.settings.lightSpeedService.scan.autoFix
    //     ) {
    //       console.log(`Auto-fixing file ${filePath}`);
    //       const edit = new vscode.WorkspaceEdit();
    //       edit.replace(
    //         fileUri,
    //         new vscode.Range(
    //           new vscode.Position(0, 0),
    //           new vscode.Position(Number.MAX_VALUE, Number.MAX_VALUE)
    //         ),
    //         outputData.fileContent
    //       );
    //       await vscode.workspace.applyEdit(edit);
    //       return;
    //     }
    //   } catch (err) {
    //     console.log(`File: ${filePath}. scan failed with ${err}`);
    //   }
    // }
  }
}
