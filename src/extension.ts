// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SampleFileSystemProvider, SampleDirectory, validateFile } from './sampleFileSystem';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sample-fs-and-search-repro" is now active!');

	// Default sample disk.
	let disk:SampleDirectory = {
		"readme.md": "Hello!",
		"src": {
			"hello.py": "print 'Hello world'"
		}
	};
	// Load disk from configuration.
	let configDisk = vscode.workspace.getConfiguration("samplefs").get<object>('disk');
	// Validate disk.
	if (configDisk && validateFile(configDisk))
	{
		disk = <SampleDirectory>configDisk;
	}

	let disposable = vscode.workspace.registerFileSystemProvider('samplefs', new SampleFileSystemProvider(disk), {
		isCaseSensitive: true,
		isReadonly: true
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
