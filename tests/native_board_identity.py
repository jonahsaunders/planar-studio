"""Resolve KiCad's public DocumentSpecifier without weakening disposable-board checks."""
from pathlib import Path


def native_board_path(board):
    name = Path(board.name)
    if name.is_absolute():
        return name.resolve()
    # KiCad 9 sends wxFileName.GetFullName() separately from project.path.
    # Never resolve a missing/relative project path against the test's cwd.
    project = getattr(getattr(board, 'document', None), 'project', None)
    directory = getattr(project, 'path', '')
    if not directory or not Path(directory).is_absolute() or name.name != str(name):
        raise ValueError('Cannot verify the absolute path of the native board document.')
    return (Path(directory) / name).resolve()
