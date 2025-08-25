import * as vscode from 'vscode';
import { 
    MAXINST_URL_KEY, 
    MANAGE_URL_KEY, 
    MAS_API_KEY,
    generateIntegrityCheckerReport,
    getAllToolsLogs,
    uploadLogsToS3,
    runIntegrityCheckerRepair,
    stopManagePods,
    startManagePods,
    installExternalCertificate,
    streamManageLogs
} from './api';

export function activate(context: vscode.ExtensionContext) {
    let setupCommand = vscode.commands.registerCommand('mas-tools-api.setup', async () => {
        try {
            const maxinstUrl = await vscode.window.showInputBox({
                prompt: 'Enter Maxinst URL',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    try {
                        new URL(value);
                        return null;
                    } catch {
                        return 'Please enter a valid URL';
                    }
                }
            });

            if (!maxinstUrl) return;

            const manageUrl = await vscode.window.showInputBox({
                prompt: 'Enter Manage URL',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    try {
                        new URL(value);
                        return null;
                    } catch {
                        return 'Please enter a valid URL';
                    }
                }
            });

            if (!manageUrl) return;

            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter API Key',
                password: true,
                ignoreFocusOut: true
            });

            if (!apiKey) return;

            await context.secrets.store(MAXINST_URL_KEY, maxinstUrl);
            await context.secrets.store(MANAGE_URL_KEY, manageUrl);
            await context.secrets.store(MAS_API_KEY, apiKey);

            vscode.window.showInformationMessage('MAS Tools API configuration saved');
        } catch (error) {
            vscode.window.showErrorMessage(`Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });

    let commands = [
        vscode.commands.registerCommand('mas-tools-api.generateIntegrityCheckerReport', () => generateIntegrityCheckerReport(context)),
        vscode.commands.registerCommand('mas-tools-api.getToolsLogs', () => getAllToolsLogs(context)),
        vscode.commands.registerCommand('mas-tools-api.submitUploadLogRequest', () => uploadLogsToS3(context)),
        vscode.commands.registerCommand('mas-tools-api.runIntegrityCheckerRepair', () => runIntegrityCheckerRepair(context)),
        vscode.commands.registerCommand('mas-tools-api.stopManagePods', () => stopManagePods(context)),
        vscode.commands.registerCommand('mas-tools-api.startManagePods', () => startManagePods(context)),
        vscode.commands.registerCommand('mas-tools-api.installExternalCertificate', () => installExternalCertificate(context)),
        vscode.commands.registerCommand('mas-tools-api.streamManageLogs', () => streamManageLogs(context))
    ];

    context.subscriptions.push(setupCommand, ...commands);
}

export function deactivate() {}
