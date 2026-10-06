/**
 * The player's code files and folders. Every file is shown in its own code window and can be
 * imported by name from other files. Pure functions: each returns a new Workspace.
 */

export const MAIN_FILE_ID = 'main';
export const MAIN_FILE_NAME = 'main';
const NEW_FILE_BASE_NAME = 'new_file';
const NEW_FOLDER_BASE_NAME = 'New folder';
export const MAX_FOLDER_NAME_LENGTH = 40;

export interface CodeFile {
  /** Stable id (window layout, editor model); the name can change. */
  id: string;
  /** Module name used by `import`; a Python identifier. */
  name: string;
  code: string;
  /** Folder the file is grouped in, or null for the top level. */
  folder: string | null;
  /** Whether its code window is shown. */
  open: boolean;
  minimized: boolean;
  breakpoints: number[];
}

export interface Workspace {
  files: CodeFile[];
  folders: string[];
}

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

export function createWorkspace(mainCode: string): Workspace {
  return {
    files: [{ id: MAIN_FILE_ID, name: MAIN_FILE_NAME, code: mainCode, folder: null, open: true, minimized: false, breakpoints: [] }],
    folders: [],
  };
}

export function findFile(workspace: Workspace, id: string): CodeFile | undefined {
  return workspace.files.find((file) => file.id === id);
}

export function findFileByName(workspace: Workspace, name: string): CodeFile | undefined {
  return workspace.files.find((file) => file.name === name);
}

/** Why a file name cannot be used, or null when it is fine. */
export function fileNameProblem(workspace: Workspace, name: string, exceptId?: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'Use letters, digits and _ only, not starting with a digit.';
  if (PYTHON_KEYWORDS.has(name)) return `"${name}" is a Python keyword.`;
  if (workspace.files.some((file) => file.name === name && file.id !== exceptId)) return `A file named "${name}" already exists.`;
  return null;
}

/** Why a folder name cannot be used, or null when it is fine. */
export function folderNameProblem(workspace: Workspace, name: string, except?: string): string | null {
  if (name.trim() === '') return 'The name cannot be empty.';
  if (name !== name.trim()) return 'The name cannot start or end with spaces.';
  if (name.length > MAX_FOLDER_NAME_LENGTH) return `Use at most ${MAX_FOLDER_NAME_LENGTH} characters.`;
  if (workspace.folders.some((folder) => folder === name && folder !== except)) return `A folder named "${name}" already exists.`;
  return null;
}

function uniqueName(base: string, taken: (name: string) => boolean, separator: string): string {
  if (!taken(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}${separator}${i}`;
    if (!taken(candidate)) return candidate;
  }
}

function updateFile(workspace: Workspace, id: string, update: (file: CodeFile) => CodeFile): Workspace {
  return { ...workspace, files: workspace.files.map((file) => (file.id === id ? update(file) : file)) };
}

/** Adds an empty file with a free `new_file…` name, open in its own window. */
export function addFile(workspace: Workspace, id: string, folder: string | null = null): Workspace {
  const name = uniqueName(NEW_FILE_BASE_NAME, (n) => findFileByName(workspace, n) !== undefined, '_');
  const file: CodeFile = { id, name, code: '', folder, open: true, minimized: false, breakpoints: [] };
  return { ...workspace, files: [...workspace.files, file] };
}

/** Renames a file; returns the workspace unchanged when the name is not allowed or it is the main file. */
export function renameFile(workspace: Workspace, id: string, name: string): Workspace {
  if (id === MAIN_FILE_ID || fileNameProblem(workspace, name, id) !== null) return workspace;
  return updateFile(workspace, id, (file) => ({ ...file, name }));
}

/** Deletes a file; the main file cannot be deleted. */
export function deleteFile(workspace: Workspace, id: string): Workspace {
  if (id === MAIN_FILE_ID) return workspace;
  return { ...workspace, files: workspace.files.filter((file) => file.id !== id) };
}

export function setFileCode(workspace: Workspace, id: string, code: string): Workspace {
  return updateFile(workspace, id, (file) => (file.code === code ? file : { ...file, code }));
}

export function setFileBreakpoints(workspace: Workspace, id: string, breakpoints: number[]): Workspace {
  return updateFile(workspace, id, (file) => ({ ...file, breakpoints }));
}

export function setFileWindow(workspace: Workspace, id: string, window: Partial<Pick<CodeFile, 'open' | 'minimized'>>): Workspace {
  return updateFile(workspace, id, (file) => ({ ...file, ...window }));
}

export function moveFileToFolder(workspace: Workspace, id: string, folder: string | null): Workspace {
  if (folder !== null && !workspace.folders.includes(folder)) return workspace;
  return updateFile(workspace, id, (file) => ({ ...file, folder }));
}

/** Adds a folder with a free `New folder…` name; returns the workspace and the folder's name. */
export function addFolder(workspace: Workspace): [Workspace, string] {
  const name = uniqueName(NEW_FOLDER_BASE_NAME, (n) => workspace.folders.includes(n), ' ');
  return [{ ...workspace, folders: [...workspace.folders, name] }, name];
}

export function renameFolder(workspace: Workspace, from: string, to: string): Workspace {
  if (!workspace.folders.includes(from) || folderNameProblem(workspace, to, from) !== null) return workspace;
  return {
    folders: workspace.folders.map((folder) => (folder === from ? to : folder)),
    files: workspace.files.map((file) => (file.folder === from ? { ...file, folder: to } : file)),
  };
}

/** Removes a folder; its files move to the top level. */
export function deleteFolder(workspace: Workspace, name: string): Workspace {
  return {
    folders: workspace.folders.filter((folder) => folder !== name),
    files: workspace.files.map((file) => (file.folder === name ? { ...file, folder: null } : file)),
  };
}

/** Opens, closes or minimises every window of a folder at once. */
export function setFolderWindows(workspace: Workspace, folder: string | null, window: Partial<Pick<CodeFile, 'open' | 'minimized'>>): Workspace {
  return { ...workspace, files: workspace.files.map((file) => (file.folder === folder ? { ...file, ...window } : file)) };
}

/** Sources of every file by name, as the interpreter imports them. */
export function workspaceSources(workspace: Workspace): Record<string, string> {
  return Object.fromEntries(workspace.files.map((file) => [file.name, file.code]));
}
