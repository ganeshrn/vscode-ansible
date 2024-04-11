import { ExecException } from "child_process";
import * as path from "path";
import { URI } from "vscode-uri";
import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
  integer,
  Position,
  Range,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileExists } from "../utils/misc";
import { WorkspaceFolderContext } from "./workspaceManager";
import { CommandRunner } from "../utils/commandRunner";

export class AnsiblePolicyEngine {
  private connection: Connection;
  private context: WorkspaceFolderContext;
  private useProgressTracker = false;
  private _ansiblePolicyEngineConfigFilePath: string;

  constructor(connection, context) {
    this.connection = connection;
    this.context = context;
    this.useProgressTracker =
      !!context.clientCapabilities.window?.workDoneProgress;
  }

  /**
   * Perform Ansible policy validation for the given document.
   */
  public async doValidate(
    textDocument: TextDocument,
  ): Promise<Map<string, Diagnostic[]>> {
    let diagnostics: Map<string, Diagnostic[]> = new Map();

    const workingDirectory = URI.parse(this.context.workspaceFolder.uri).path;
    const mountPaths = new Set([workingDirectory]);
    const settings = await this.context.documentSettings.get(textDocument.uri);

    let policyEngineArguments = settings.validation.policyEngine.arguments ?? "";

    // Determine Ansible policy rngine config file
    let ansiblePolicyEngineConfigPath = policyEngineArguments.match(
      /(?:^|\s)-c\s*(?<sep>[\s'"])(?<conf>.+?)(?:\k<sep>|$)/,
    )?.groups?.conf;
    this.connection.console.log(
      `ansiblePolicyEngineConfigPath: ${ansiblePolicyEngineConfigPath}`,
    );
    if (!ansiblePolicyEngineConfigPath) {
      // Config file not provided in arguments -> search for one mimicking the
      // way Ansible policy engine looks for it, going up the directory structure
      const ansiblePolicyEngineConfigFile =
        await this.findansiblePolicyEngineConfigFile(textDocument.uri);
      if (ansiblePolicyEngineConfigFile) {
        ansiblePolicyEngineConfigPath = URI.parse(
          ansiblePolicyEngineConfigFile,
        ).path;
        policyEngineArguments = `${policyEngineArguments} -c "${ansiblePolicyEngineConfigPath}"`;
        mountPaths.add(path.dirname(policyEngineArguments));
      }
    }

    this._ansiblePolicyEngineConfigFilePath = ansiblePolicyEngineConfigPath;
    policyEngineArguments = `${policyEngineArguments}`;

    const docPath = URI.parse(textDocument.uri).path;
    mountPaths.add(path.dirname(docPath));

    const progressTracker = this.useProgressTracker
      ? await this.connection.window.createWorkDoneProgress()
      : {
          begin: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
          done: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
        };

    progressTracker.begin(
      "Ansible policy check",
      undefined,
      "Processing files...",
    );

    const commandRunner = new CommandRunner(
      this.connection,
      this.context,
      settings,
    );
    this.connection.console.log(
      `[Ansible policy engine] Running Ansible policy engine with arguments "${policyEngineArguments} -p ${docPath}"`,
    );
    try {
      // get Ansible policy engine result on the doc
      const result = await commandRunner.runCommand(
        "ansible-gatekeeper",
        `${policyEngineArguments} -p "${docPath}"`,
        workingDirectory,
        mountPaths,
      );
      this.connection.console.log(
        `[Ansible policy engine] Result:\n${result.stdout}`,
      );
      diagnostics = this.processReport(result.stdout, docPath);

      if (result.stderr) {
        this.connection.console.log(`[Ansible policy engine] ${result.stderr}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as ExecException & {
          // according to the docs, these are always available
          stdout: string;
          stderr: string;
        };

        if (execError.stdout) {
          diagnostics = this.processReport(execError.stdout, workingDirectory);
        } else {
          if (execError.stderr) {
            this.connection.console.error(
              `[Ansible policy engine] ${execError.stderr}`,
            );
          }

          progressTracker.done();
          this.connection.window.showErrorMessage(execError.message);
          return;
        }
      } else {
        const exceptionString = `Exception in ansiblePolicyEngine service: ${JSON.stringify(
          error,
        )}`;

        progressTracker.done();
        this.connection.console.error(exceptionString);
        this.connection.window.showErrorMessage(exceptionString);
        return;
      }
    }

    progressTracker.done();
    return diagnostics;
  }

  private processReport(
    result: string,
    docPath: string,
  ): Map<string, Diagnostic[]> {
    const diagnostics: Map<string, Diagnostic[]> = new Map();
    const locationUri = URI.file(docPath).toString();
    if (!result) {
      this.connection.console.warn(
        "Standard output from Ansible policy engine is suspiciously empty.",
      );
      return diagnostics;
    }
    try {
      const report = JSON.parse(result);
      if (
        typeof report === "object" &&
        report.hasOwnProperty("files") &&
        Array.isArray(report.files)
      ) {
        for (const fileReport of report.files) {
          if (typeof fileReport !== "object") {
            this.connection.console.log(
              `[Ansible policy engine] Unexpected file report: ${fileReport}`,
            );
            continue;
          }
          if (
            fileReport.hasOwnProperty("path") &&
            fileReport.path !== docPath
          ) {
            // Skip files that are not the one we're interested in
            continue;
          }

          if (
            fileReport.hasOwnProperty("policies") &&
            Array.isArray(fileReport.policies)
          ) {
            for (const policy of fileReport.policies) {
              if (
                !policy.hasOwnProperty("violation") ||
                policy.violation === false
              ) {
                continue;
              }
              if (
                !policy.hasOwnProperty("targets") ||
                !Array.isArray(policy.targets)
              ) {
                continue;
              }
              for (const target of policy.targets) {
                if (target.validated === true) {
                  continue;
                }
                const message: string = target.message;
                const helpUri: string = policy.policy_name
                  ? policy.policy_name
                  : undefined;
                const helpUrlName: string = policy.target_type
                  ? policy.target_type
                  : undefined;
                let fileDiagnostics = diagnostics.get(locationUri);
                if (!fileDiagnostics) {
                  fileDiagnostics = [];
                  diagnostics.set(locationUri, fileDiagnostics);
                }

                const begin_line = target.lines.begin || 1;
                const begin_column = 1;
                const start: Position = {
                  line: begin_line - 1,
                  character: begin_column - 1,
                };
                const end: Position = {
                  line: begin_line - 1,
                  character: integer.MAX_VALUE,
                };
                const range: Range = {
                  start: start,
                  end: end,
                };

                const severity: DiagnosticSeverity = DiagnosticSeverity.Error;

                fileDiagnostics.push({
                  message: message,
                  range: range || Range.create(0, 0, 0, 0),
                  severity: severity,
                  source: "Ansible policy engine",
                  code: helpUrlName,
                  codeDescription: { href: helpUri },
                });
                diagnostics.set(fileReport.path, fileDiagnostics);
              }
            }
          }
        }
      } else {
        this.connection.console.log(
          `[Ansible policy engine] Run result for file ${docPath}: ${result}`,
        );
      }
    } catch (error) {
      this.connection.window.showErrorMessage(
        "Could not parse Ansible policy engine output. Please check your ansible-lint installation & configuration." +
          " More info in `Ansible Server` output.",
      );
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else {
        message = JSON.stringify(error);
      }
      this.connection.console.error(
        `Exception while parsing Ansible policy engine output: ${message}` +
          `\nTried to parse the following:\n${result}`,
      );
    }
    return diagnostics;
  }

  private async findansiblePolicyEngineConfigFile(
    uri: string,
  ): Promise<string | undefined> {
    // find configuration path
    let configPath;
    const pathArray = uri.split("/");

    // Find first configuration file going up until workspace root
    for (let index = pathArray.length - 1; index >= 0; index--) {
      let candidatePath = pathArray
        .slice(0, index)
        .concat(".ansible-gatekeeper")
        .join("/");

      const workspacePath = URI.parse(this.context.workspaceFolder.uri).path;
      candidatePath = URI.parse(candidatePath).path;

      if (!candidatePath.startsWith(workspacePath)) {
        // we've gone out of the workspace folder
        break;
      }
      if (await fileExists(candidatePath)) {
        configPath = URI.parse(candidatePath).path;
        break;
      }
    }
    return configPath;
  }

  get ansibleLintConfigFilePath(): string {
    return this._ansiblePolicyEngineConfigFilePath;
  }
}
