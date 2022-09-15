/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
/// <reference path="./typings.d.ts" />

debugger;

import * as _path from 'path';
const path = _path.posix;
import { parentPort  } from 'worker_threads';

import { URI } from 'vscode-uri';

import { ClientConnection } from '@vscode/sync-api-common/node';
import { ApiClient, APIRequests } from '@vscode/sync-api-client';
import { WASI, Options } from '@vscode/wasm-wasi/node';

if (parentPort === null) {
	process.exit();
}

const connection = new ClientConnection<APIRequests>(parentPort);
connection.serviceReady().then(async (_params) => {
	const name = 'Python Terminal';
	const apiClient = new ApiClient(connection);
	const workspaceFolders = apiClient.vscode.workspace.workspaceFolders;
	const activeTextDocument = apiClient.vscode.window.activeTextDocument;
	const mapDir: Options['mapDir'] = [];
	let toRun: string | undefined;
	if (workspaceFolders.length === 1) {
		const folderUri = workspaceFolders[0].uri;
		mapDir.push({ name: path.join(path.sep, 'workspace'), uri: folderUri });
		if (activeTextDocument !== undefined) {
			const file =  activeTextDocument.uri;
			if (file.toString().startsWith(folderUri.toString())) {
				toRun = path.join(path.sep, 'workspace', file.toString().substring(folderUri.toString().length));
			}
		}
	} else {
		for (const folder of workspaceFolders) {
			mapDir.push({ name: path.join(path.sep, 'workspaces', folder.name), uri: folder.uri });
		}
	}
	// const pythonRoot = URI.file(`/home/dirkb/Projects/dbaeumer/python-3.11.0rc`);
	const pythonRoot = URI.parse('vscode-vfs://github/dbaeumer/python-3.11.0rc');
	mapDir.push({ name: path.sep, uri: pythonRoot });
	const exitHandler = (rval: number): void => {
		apiClient.process.procExit(rval);
	};
	const wasi = WASI.create(name, apiClient, exitHandler, {
		mapDir,
		argv: toRun !== undefined ? ['python', '-X', 'utf8', toRun] : ['python', '-X', 'utf8'],
		env: {
			PYTHONPATH: '/workspace'
		}
	});
	const binary = apiClient.vscode.workspace.fileSystem.readFile(pythonRoot.with({ path: path.join(pythonRoot.path, 'python.wasm') }));
	const { instance } = await WebAssembly.instantiate(binary, {
		wasi_snapshot_preview1: wasi
	});
	wasi.initialize(instance);
	(instance.exports._start as Function)();
	apiClient.process.procExit(0);
}).catch(console.error);