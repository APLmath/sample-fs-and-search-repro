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
  TextSearchComplete,
  TextSearchProvider,
  Range,
  workspace,
  OutputChannel,
  window,
  TextSearchMatch,
} from 'vscode';
import { TextEncoder } from 'util';
import { format } from 'url';

/**
 * Extremely basic filesystem of text-only files and directories.
 *
 * For searching, this filesystem searches on whole words, where a file matches
 * if it contains at least an instance of each word in the query. This is an
 * extremely basic approximation of how web search engines or code search
 * engines behave. Here, the expectation is that each word that was matched
 * should be highlighted.
 *
 * For example, say we have two files with their respective content:
 * - file1: I say Hello world!
 * - file2: To the world, hello to you!
 *
 * Here are some sample search queries, and what the results should be. The
 * highlighted portions are in brackets:
 * - "hello"
 *     file1:
 *        I say [Hello] world!
 *     file2:
 *        To the world, [hello] to you!
 * - "hello world"
 *     file1:
 *        I say [Hello] world!
 *        I say Hello [world]!
 *     file2:
 *        To the [world], hello to you!
 *        To the world, [hello] to you!
 *   "hello wor"
 *     no matches, because neither file has "wor" by itself
 *   "hello to"
 *     file2:
 *        [To] the world, hello to you!
 *        To the [world], hello to you!
 *        To the world, hello [to] you!
 *     file1 doesn't match because it doesn't have "to"
 */
export interface SampleDirectory {
  [filename: string]: SampleFile; 
}
type SampleFile = SampleDirectory | string;

interface WholeWordSearchMatchRegion {
  start: number;
  end: number
}

interface WholeWordSearchMatch {
  [fileUriStr: string]: WholeWordSearchMatchRegion[];
}

interface WholeWordSearchIndex {
  [word: string]: WholeWordSearchMatch;
}

export class SuperSimpleStringSystemProvider implements FileSystemProvider, TextSearchProvider {

  private _index: WholeWordSearchIndex = {};
  private _outputChannel: OutputChannel;

  constructor(private _disk: SampleDirectory) {
    // Index the disk contents.
    let regex = RegExp('\\w+', 'g');
    function helper(file: SampleFile, uriStr: string, index: WholeWordSearchIndex) {
      if (typeof file === 'string') {
        for(const match of file.matchAll(regex)) {
          const word = match[0].toLowerCase();
          const start = match.index!;
          const end = start + word.length;
          if (!index.hasOwnProperty(word)) {
            index[word] = {};
          }
          if (!index[word].hasOwnProperty(uriStr)) {
            index[word][uriStr] = [];
          }
          index[word][uriStr].push({
            start: start,
            end: end
          });
        }
      } else {
        Object.keys(file).forEach((filename) => {
          helper(file[filename], uriStr + '/' + filename, index);
        });
      }
    }
    helper(this._disk, 'samplefs://', this._index);

    // Set up output channel.
    this._outputChannel = window.createOutputChannel('SuperSimpleStringSystemProvider');
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
    this._outputChannel.appendLine(`Getting results for "${query.pattern}"...`);
    let words = query.pattern.trim().split(/\s+/);

    let results: WholeWordSearchMatch = {};
    let firstWord = true;
    for (let word of words) {
      word = word.toLowerCase();
      let wordResults = this._index[word] || {};
      if (firstWord) {
        results = wordResults;
      } else {
        let newResults: WholeWordSearchMatch = {};
        Object.keys(results).forEach((uriStr) => {
          if (wordResults.hasOwnProperty(uriStr)) {
            newResults[uriStr] = results[uriStr].concat(wordResults[uriStr]);
          }
        });
        results = newResults;
      }
      firstWord = false;
    }

    let promises = Object.keys(results).map(async (uriStr) => {
      const uri = Uri.parse(uriStr);

      const textDoc = await workspace.openTextDocument(uri);
      for (const matchRegion of results[uriStr]) {
        let start = textDoc.positionAt(matchRegion.start);
        let end = textDoc.positionAt(matchRegion.end);
        let result = {
          uri: uri,
          ranges: new Range(start, end),
          preview: {
            text: textDoc.lineAt(start.line).text,
            matches: new Range(0, start.character, 0, end.character)
          }
        };
        this._outputChannel.appendLine(this._formatResult(result));
        progress.report(result);
      }
    });
    await Promise.all(promises);
    return {
      limitHit: false
    };
  }

  private _formatResult(result: TextSearchMatch): string {
    let range = <Range>result.ranges;
    return `- uri   = ${result.uri.toString()}\n  range = (${range.start.line}, ${range.start.character}) - (${range.end.line}, ${range.end.character})`;
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
