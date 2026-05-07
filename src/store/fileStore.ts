import { db, JsonDb } from './db';

type FileRecord = Record<string, any>;
interface FileState { version: 1; files: Record<string, FileRecord[]> }

export class FileStore {
  constructor(private readonly store: JsonDb = db) {}
  private load(): FileState { return this.store.readJson<FileState>('files.json', { version: 1, files: {} }); }
  private save(state: FileState){ this.store.writeJsonAtomic('files.json', state); }
  saveFileRecord(taskId: string, fileRecord: FileRecord){ const s=this.load(); s.files[taskId]=s.files[taskId]??[]; s.files[taskId].push(fileRecord); this.save(s); return fileRecord; }
  listFilesForTask(taskId: string){ return this.load().files[taskId] ?? []; }
}

export const fileStore = new FileStore();
