import { describe, expect, it } from 'vitest';
import {
  addFile,
  addFolder,
  createWorkspace,
  deleteFile,
  deleteFolder,
  fileNameProblem,
  findFile,
  folderNameProblem,
  MAIN_FILE_ID,
  moveFileToFolder,
  renameFile,
  renameFolder,
  setFolderWindows,
  workspaceSources,
} from './codeFiles.ts';

describe('code files', () => {
  it('adds files with free names, open in their own window', () => {
    let workspace = addFile(createWorkspace('harvest()'), 'a');
    workspace = addFile(workspace, 'b');
    expect(workspace.files.map((file) => file.name)).toEqual(['main', 'new_file', 'new_file_2']);
    expect(findFile(workspace, 'a')).toMatchObject({ open: true, folder: null, code: '' });
  });

  it('validates and applies renames', () => {
    const workspace = addFile(addFile(createWorkspace(''), 'a'), 'b');
    expect(fileNameProblem(workspace, 'farm_utils')).toBeNull();
    expect(fileNameProblem(workspace, 'two words')).not.toBeNull();
    expect(fileNameProblem(workspace, '1abc')).not.toBeNull();
    expect(fileNameProblem(workspace, 'import')).toMatch(/keyword/);
    expect(fileNameProblem(workspace, 'main')).toMatch(/already exists/);
    expect(fileNameProblem(workspace, 'new_file', 'a')).toBeNull();

    expect(findFile(renameFile(workspace, 'a', 'utils'), 'a')?.name).toBe('utils');
    expect(renameFile(workspace, 'a', 'main')).toBe(workspace);
    expect(renameFile(workspace, MAIN_FILE_ID, 'other')).toBe(workspace);
  });

  it('never deletes the main file', () => {
    const workspace = addFile(createWorkspace(''), 'a');
    expect(deleteFile(workspace, MAIN_FILE_ID)).toBe(workspace);
    expect(deleteFile(workspace, 'a').files.map((file) => file.id)).toEqual([MAIN_FILE_ID]);
  });

  it('groups files into folders', () => {
    const [withFolder, folder] = addFolder(addFile(createWorkspace(''), 'a'));
    let workspace = withFolder;
    expect(folder).toBe('New folder');
    expect(addFolder(workspace)[1]).toBe('New folder 2');
    workspace = moveFileToFolder(workspace, 'a', folder);
    expect(findFile(workspace, 'a')?.folder).toBe('New folder');
    expect(moveFileToFolder(workspace, 'a', 'missing')).toBe(workspace);

    workspace = renameFolder(workspace, 'New folder', 'Farming');
    expect(findFile(workspace, 'a')?.folder).toBe('Farming');
    expect(folderNameProblem(workspace, 'Farming')).toMatch(/already exists/);
    expect(folderNameProblem(workspace, '  ')).not.toBeNull();

    workspace = setFolderWindows(workspace, 'Farming', { open: false });
    expect(findFile(workspace, 'a')?.open).toBe(false);
    expect(findFile(workspace, MAIN_FILE_ID)?.open).toBe(true);

    workspace = deleteFolder(workspace, 'Farming');
    expect(workspace.folders).toEqual([]);
    expect(findFile(workspace, 'a')?.folder).toBeNull();
  });

  it('exposes every file source by name', () => {
    const workspace = renameFile(addFile(createWorkspace('main code'), 'a'), 'a', 'tools');
    expect(workspaceSources(workspace)).toEqual({ main: 'main code', tools: '' });
  });
});
