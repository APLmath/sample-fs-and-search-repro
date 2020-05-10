'use strict';

import {
  Disposable,
  Event,
  EventEmitter,
  FileChangeEvent,
  FileStat,
  FileSystemError,
  FileSystemProvider,
  FileType,
  Uri,
} from 'vscode';
import { TextEncoder } from 'util';

/**
 * Extremely basic filesystem of text-only files and directories.
 */
interface SampleDirectory {
  [filename: string]: SampleFile; 
}
type SampleFile = SampleDirectory | string;

export class SampleFileSystemProvider implements FileSystemProvider {

  private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
  get onDidChangeFile(): Event<FileChangeEvent[]> {
    return this._onDidChangeFile.event;
  }

  constructor(private _directory: SampleDirectory) {
  }

  private _getFile(uri: Uri): SampleFile {
    let path = uri.path;
    if (path.charAt(path.length - 1) === '/')
    {
      path = path.substr(0, path.length - 1);
    }
    const [root, ...pathComponents] = path.split('/');
    let file:SampleFile = this._directory;
    pathComponents.forEach((component) => {
      if (typeof file === 'string') {
        throw FileSystemError.FileNotADirectory; 
      }
      if (!file.hasOwnProperty(component))
      {
        throw FileSystemError.FileNotFound; 
      }
      file = file[component];
    });
    return file;
  }

  watch(uri: Uri, options: { recursive: boolean; excludes: string[]; }): Disposable {
    return {
      dispose: () => {
          /* noop */
      }
    };
  }

  async stat(uri: Uri): Promise<FileStat> {
    let file = this._getFile(uri);
    if (typeof file === 'string') {
      return {
        ctime: 0,
        mtime: 0,
        size: file.length,
        type: FileType.File
      };
    } else {
      return {
        ctime: 0,
        mtime: 0,
        size: Object.keys(file).length,
        type: FileType.Directory
      };
    }
  }

  async readDirectory(uri: Uri): Promise<[string, FileType][]> {
    let file = this._getFile(uri);
    if (typeof file === 'string') {
      throw FileSystemError.FileNotADirectory; 
    }
    let dir = file;
    return Object.keys(dir).map((filename) => {
      return [filename, typeof dir[filename] === 'string' ? FileType.File :FileType.Directory];
    });
  }

  createDirectory(uri: Uri): void | Thenable<void> {
    throw FileSystemError.NoPermissions;
  }

  async readFile(uri: Uri): Promise<Uint8Array> {
    let file = this._getFile(uri);
    if (typeof file !== 'string') {
      throw FileSystemError.FileIsADirectory; 
    }
    let enc = new TextEncoder();
    return Promise.resolve(enc.encode(file));
  }

  writeFile(uri: Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
    throw FileSystemError.NoPermissions;
  }

  delete(uri: Uri, options: { recursive: boolean; }): void | Thenable<void> {
    throw FileSystemError.NoPermissions;
  }

  rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean; }): void | Thenable<void> {
    throw FileSystemError.NoPermissions;
  }

  copy?(source: Uri, destination: Uri, options: { overwrite: boolean; }): void | Thenable<void> {
    throw FileSystemError.NoPermissions;
  }
}
