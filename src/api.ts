import * as vscode from 'vscode';
import axios from 'axios';

export const MAXINST_URL_KEY = 'maxinst_url';
export const MANAGE_URL_KEY = 'manage_url';
export const MAS_API_KEY = 'mas_api_key';

interface MasCredentials {
    maxinstUrl: string;
    manageUrl: string;
    apiKey: string;
}

async function getMasCredentials(context: vscode.ExtensionContext): Promise<MasCredentials | undefined> {
    const maxinstUrl = await context.secrets.get(MAXINST_URL_KEY);
    const manageUrl = await context.secrets.get(MANAGE_URL_KEY);
    const apiKey = await context.secrets.get(MAS_API_KEY);

    if (!maxinstUrl || !manageUrl || !apiKey) {
        vscode.window.showErrorMessage('MAS Tools API is not configured. Please run the "MAS Tools API: Setup" command.');
        return undefined;
    }

    return { maxinstUrl, manageUrl, apiKey };
}

export async function makeApiRequest(
    context: vscode.ExtensionContext,
    endpoint: string,
    method: 'GET' | 'POST',
    data?: any,
    params?: Record<string, any>
) {
    const credentials = await getMasCredentials(context);
    if (!credentials) return;

    let baseUrl: string;
    if (endpoint.startsWith('/toolsapi/')) {
        baseUrl = credentials.maxinstUrl;
    } else if (endpoint.startsWith('/maximo/')) {
        baseUrl = credentials.manageUrl;
    } else {
        vscode.window.showErrorMessage(`Invalid endpoint: ${endpoint}. Must start with /toolsapi/ or /maximo/`);
        return;
    }

    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const finalUrl = `${cleanBaseUrl}${endpoint}`;

    try {
        const requestConfig: axios.AxiosRequestConfig = {
            method,
            url: finalUrl,
            headers: {
                'apikey': credentials.apiKey,
                'Accept': 'application/json',
            },
            params,
            validateStatus: null
        };

        if (method === 'POST') {
            requestConfig.headers!['Content-Type'] = 'application/json';
            requestConfig.data = data;
        }

        console.log('Request details:', {
            method,
            url: finalUrl,
            params,
            headers: { apikey: '***' },
            data: data || 'no data'
        });

        const response = await axios(requestConfig);

        if (response.status >= 400) {
            const errorMessage = `API request failed (${response.status}): ${response.statusText}\nResponse: ${JSON.stringify(response.data)}`;
            console.error(errorMessage);
            vscode.window.showErrorMessage(errorMessage);
            return undefined;
        }

        return response.data;
    } catch (error: any) {
        const errorMessage = error.response
            ? `API request failed: ${error.message}\nResponse: ${JSON.stringify(error.response.data)}`
            : `API request failed: ${error.message}`;
        console.error(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        return undefined;
    }
}

async function checkEnvironmentSetup(context: vscode.ExtensionContext): Promise<boolean> {
    const maxinstUrl = await context.secrets.get(MAXINST_URL_KEY);
    const manageUrl = await context.secrets.get(MANAGE_URL_KEY);
    const apiKey = await context.secrets.get(MAS_API_KEY);

    if (!maxinstUrl || !manageUrl || !apiKey) {
        const missingItems = [];
        if (!maxinstUrl) missingItems.push('Maxinst URL');
        if (!manageUrl) missingItems.push('Manage URL');
        if (!apiKey) missingItems.push('API Key');
        
        vscode.window.showErrorMessage(
            `MAS Tools API configuration incomplete. Missing: ${missingItems.join(', ')}. Please run the "MAS Tools API: Setup" command.`
        );
        return false;
    }

    const message = `Current Environment Setup:
Maxinst URL: ${maxinstUrl}
Manage URL: ${manageUrl}

Do you want to continue with this environment?`;
    const continueButton = 'Continue';
    const changeButton = 'Change Environment';

    const choice = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        continueButton,
        changeButton
    );

    if (choice === changeButton) {
        vscode.commands.executeCommand('mas-tools-api.setup');
        return false;
    }

    return choice === continueButton;
}

// -------------------- API Functions --------------------

export async function getAllToolsLogs(context: vscode.ExtensionContext) {
    if (!(await checkEnvironmentSetup(context))) return;

    try {
        const response = await makeApiRequest(context, '/toolsapi/toolservice/toolslog', 'GET');

        if (response && Array.isArray(response) && response.length > 0) {
            const panel = vscode.window.createWebviewPanel(
                'toolLogs',
                'Available Tool Logs',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            // Build HTML with nicer formatting
            let html = `<h2>📜 Available Tool Logs</h2>`;
            response.forEach((log: any) => {
                const fileName = log.name || 'Unknown';
                const sizeKB = log.size ? (log.size / 1024).toFixed(2) + ' KB' : 'N/A';
                const timestamp = log.timestamp || 'N/A';

                html += `
                  <div style="margin-bottom: 20px; font-family: monospace;">
                    <a href="#" onclick="vscode.postMessage({ command: 'open', file: '${fileName}' })"
                       style="font-weight: bold; text-decoration: none; color: #007acc;">
                      ${fileName}
                    </a>
                    <div>Size: ${sizeKB}</div>
                    <div>Time: ${timestamp}</div>
                  </div>
                `;
            });

            panel.webview.html = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: sans-serif; padding: 10px; }
                  h2 { color: #333; }
                  a:hover { text-decoration: underline; }
                </style>
              </head>
              <body>
                ${html}
                <script>
                  const vscode = acquireVsCodeApi();
                  window.addEventListener('message', event => {});
                </script>
              </body>
              </html>
            `;

            // Listen for clicks from the webview
            panel.webview.onDidReceiveMessage(async (msg) => {
                if (msg.command === 'open') {
                    await openToolLog(context, msg.file);
                }
            });
        } else {
            vscode.window.showInformationMessage('No tool logs found.');
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to fetch tool logs: ${error.message || error}`);
    }
}

// 🔹 Command: Open specific log (used by clickable links)
export async function openToolLog(context: vscode.ExtensionContext, fileName?: string) {
    //if (!(await checkEnvironmentSetup(context))) return;

    // If invoked from command palette, ask user
    if (!fileName) {
        fileName = await vscode.window.showInputBox({
            prompt: 'Enter the log file name',
            placeHolder: 'Example: ValidateCryptoKey20250824231306.log'
        });
    }

    if (!fileName) return;

    try {
        const response = await makeApiRequest(
            context,
            `/toolsapi/toolservice/toolslog?logfile=${encodeURIComponent(fileName)}`,
            'GET'
        );

        if (response) {
            const logDoc = await vscode.workspace.openTextDocument({
                content: typeof response === 'string'
                    ? response
                    : JSON.stringify(response, null, 2),
                language: 'log'
            });
            await vscode.window.showTextDocument(logDoc);
        } else {
            vscode.window.showErrorMessage(`No content returned for log: ${fileName}`);
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to fetch log ${fileName}: ${error.message || error}`);
    }
}

export async function uploadLogsToS3(context: vscode.ExtensionContext) {
    if (!(await checkEnvironmentSetup(context))) return;

    try {
        // Pass action as a query param, not JSON body
        const response = await makeApiRequest(
            context,
            '/maximo/api/service/logging',
            'POST',
            undefined, // no body
            { action: 'wsmethod:submitUploadLogRequest' }
        );

        let logFileCode: string | undefined;

        // Common success shape: { "return": "<code>" }
        if (response && typeof response === 'object' && 'return' in response) {
            logFileCode = (response as any).return;
        } else if (typeof response === 'string') {
            try {
                const parsed = JSON.parse(response);
                if (parsed && parsed.return) logFileCode = parsed.return;
            } catch {
                // not JSON, just ignore
            }
        }

        if (logFileCode) {
            vscode.window.showInformationMessage(`Upload complete. Log file code: ${logFileCode}`);
            return logFileCode;
        }

        // Unexpected response: show it in editor
        const fallbackName = `upload_${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
        const content = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
        const doc = await vscode.workspace.openTextDocument({ content, language: 'json' });
        await vscode.window.showTextDocument(doc);

        vscode.window.showWarningMessage(
            `Upload completed but response was unexpected. Saved fallback name: ${fallbackName}`
        );
        return fallbackName;

    } catch (error: any) {
        vscode.window.showErrorMessage(`Upload failed: ${error.message || error}`);
        throw error;
    }
}

export async function stopManagePods(context: vscode.ExtensionContext) {
    if (!(await checkEnvironmentSetup(context))) return;

    try {
        const response = await makeApiRequest(
            context,
            '/toolsapi/toolservice/managestop',
            'POST'
        );

        // If response is undefined, makeApiRequest already showed an error
        if (response !== undefined) {
            vscode.window.showInformationMessage("✅ MAS Manage stop request submitted successfully.");
            return true;
        }
        return false;
    } catch (error: any) {
        vscode.window.showErrorMessage(`❌ Failed to stop MAS Manage: ${error.message}`);
        return false;
    }
}

export async function startManagePods(context: vscode.ExtensionContext) {
    if (!(await checkEnvironmentSetup(context))) return;

    try {
        const response = await makeApiRequest(
            context,
            '/toolsapi/toolservice/managestart',
            'POST'
        );

        if (response !== undefined) {
            vscode.window.showInformationMessage("✅ MAS Manage start request submitted successfully.");
            return true;
        }
        return false;
    } catch (error: any) {
        vscode.window.showErrorMessage(`❌ Failed to start MAS Manage: ${error.message}`);
        return false;
    }
}


export async function streamManageLogs(context: vscode.ExtensionContext) {
    if (!(await checkEnvironmentSetup(context))) return;

    try {
        const response = await makeApiRequest(
            context,
            '/maximo/api/service/logging',
            'GET',
            undefined,
            { action: 'wsmethod:streamLog' }
        );

        if (response) {
            // Create and show document with logs
            const logDoc = await vscode.workspace.openTextDocument({
                content: typeof response === 'string' ? response : JSON.stringify(response, null, 2),
                language: 'log'
            });
            await vscode.window.showTextDocument(logDoc, {
                preview: false,
                viewColumn: vscode.ViewColumn.Two
            });
            
            vscode.window.showInformationMessage('MAS Manage logs retrieved successfully.');
            return true;
        }
        return false;
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to stream MAS Manage logs: ${error.message}`);
        return false;
    }
}

export async function generateIntegrityCheckerReport(context: vscode.ExtensionContext) {
    if (!(await checkEnvironmentSetup(context))) return;

    try {
        const response = await makeApiRequest(
            context,
            '/toolsapi/toolservice/icheckerreport',
            'POST'
        );

        if (!response || typeof response !== 'object') {
            vscode.window.showErrorMessage('Failed to generate Integrity Checker Report.');
            return;
        }

        const { lisfile, logfile } = response;

        const panel = vscode.window.createWebviewPanel(
            'integrityCheckerReport',
            'Integrity Checker Report',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        // Build HTML: make both files clickable
        let html = `<h2>🛡 Integrity Checker Report</h2>`;

        if (lisfile) {
            html += `
              <div style="margin-bottom: 20px; font-family: monospace;">
                <a href="#" onclick="vscode.postMessage({ command: 'open', file: '${lisfile}' })"
                   style="font-weight: bold; text-decoration: none; color: #007acc;">
                  ${lisfile}
                </a>
              </div>
            `;
        }

        if (logfile) {
            html += `
              <div style="margin-bottom: 20px; font-family: monospace;">
                <a href="#" onclick="vscode.postMessage({ command: 'open', file: '${logfile}' })"
                   style="font-weight: bold; text-decoration: none; color: #007acc;">
                  ${logfile}
                </a>
              </div>
            `;
        }

        panel.webview.html = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: sans-serif; padding: 10px; }
              h2 { color: #333; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            ${html}
            <script>
              const vscode = acquireVsCodeApi();
              window.addEventListener('message', event => {});
            </script>
          </body>
          </html>
        `;

        // Listen for clicks from the webview
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'open') {
                await openToolLog(context, msg.file);
            }
        });

    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to generate Integrity Checker Report: ${error.message || error}`);
    }
}


