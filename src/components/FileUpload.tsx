'use client';

import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';

interface FileUploadProps {
  onFileLoaded: (data: any[][], fileName: string) => void;
  accept?: string;
  label?: string;
}

export default function FileUpload({
  onFileLoaded,
  accept = '.xlsx,.xls,.csv',
  label = 'Sube tu Excel de budget mensual',
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });

        // Tomar la primera hoja
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        setFileName(file.name);
        onFileLoaded(data, file.name);
      } catch (err) {
        setError('Error leyendo el archivo. Asegúrate de que es un Excel válido.');
        console.error(err);
      }
    },
    [onFileLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${dragActive
            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
            : 'border-[var(--border)] hover:border-[var(--accent)]/50'
          }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
        {fileName ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-[var(--success)]" />
            <div className="text-left">
              <p className="text-sm font-medium">{fileName}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Archivo cargado correctamente
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFileName(null);
              }}
              className="ml-2 p-1 rounded hover:bg-[var(--bg-secondary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-10 h-10 mx-auto text-[var(--text-secondary)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Arrastra tu archivo aquí o{' '}
              <span className="text-[var(--accent)] underline">selecciona</span>
            </p>
            <p className="text-xs text-[var(--text-secondary)]/60">
              .xlsx, .xls o .csv
            </p>
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)]">{error}</p>
      )}
    </div>
  );
}
