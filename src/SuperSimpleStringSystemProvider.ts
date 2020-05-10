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
  TextSearchQuery,
  TextSearchOptions,
  Progress,
  TextSearchResult,
  CancellationToken,
  ProviderResult,
  TextSearchComplete,
  TextSearchProvider,
  Range,
  workspace,
} from 'vscode';
import { TextEncoder } from 'util';

/**
 * Extremely basic filesystem of text-only files and directories.
 */
export interface SampleDirectory {
  [filename: string]: SampleFile; 
}
type SampleFile = SampleDirectory | string;

export class SuperSimpleStringSystemProvider implements FileSystemProvider, TextSearchProvider {

  private _fileUris: Uri[] = [];

  constructor(private _disk: SampleDirectory) {
    function helper(file: SampleFile, uriStr: string, fileUris: Uri[]) {
      if (typeof file === 'string') {
        fileUris.push(Uri.parse(uriStr));
      } else {
        Object.keys(file).forEach((filename) => {
          helper(file[filename], uriStr + '/' + filename, fileUris);
        });
      }
    }
    helper(this._disk, 'samplefs://', this._fileUris);
  }

  /**
   * FileSystemProvider implementation
   */

  private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
  get onDidChangeFile(): Event<FileChangeEvent[]> {
    return this._onDidChangeFile.event;
  }

  private _getFile(uri: Uri): SampleFile {
    let path = uri.path;
    if (path.charAt(path.length - 1) === '/')
    {
      path = path.substr(0, path.length - 1);
    }
    const [root, ...pathComponents] = path.split('/');
    let file:SampleFile = this._disk;
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

  /**
   * TextSearchProvider implementation
   */

  async provideTextSearchResults(query: TextSearchQuery, options: TextSearchOptions, progress: Progress<TextSearchResult>, token: CancellationToken): Promise<TextSearchComplete> {
    let keywords = query.pattern.split(/\s+/);
    let regexes = keywords.map((keyword) => RegExp('\\b' + keyword + '\\b', 'g'));
    let promises = this._fileUris.map(async (uri) => {
      let textDoc = await workspace.openTextDocument(uri);
      let content = textDoc.getText();
      console.log(uri);
      regexes.forEach((regex) => {
        console.log(regex.source);
        let match:RegExpExecArray | null = null;
        while((match = regex.exec(content)) != null) {
          console.log(match);
          console.log(match.index);
          console.log(match[0].length);
          let start = textDoc.positionAt(match.index);
          let end = textDoc.positionAt(match.index + match[0].length);
          let range = new Range(start, end);
          console.log(textDoc.getText(range));
          let line = textDoc.lineAt(start.line);
          let pmatch = new Range(0, start.character, 0, end.character);
          progress.report({
            uri: uri,
            ranges: range,
            preview: {
              text: line.text,
              matches: pmatch
            }
          });
        }
      });
    });
    await Promise.all(promises);
    return {
      limitHit: false
    };
  }
}

export function validateFile(maybeFile: any):boolean {
  if (typeof maybeFile === 'string') {
    return true;
  }
  if (typeof maybeFile === 'object') {
    return Object.keys(maybeFile).every((filename) => {
      if (typeof filename !== 'string') {
        return false;
      }
      return validateFile(maybeFile[filename]);
    });
  }
  return false;
}
