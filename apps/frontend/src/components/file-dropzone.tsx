'use client';

import { FileText, UploadCloud, X } from 'lucide-react';
import { useCallback, useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FileDropzoneProps {
  accept: readonly string[];
  onFileSelected: (file: File) => void;
  onCleared?: () => void;
  /** Filename of the accepted file, owned by the parent. */
  fileName?: string | undefined;
  /** Live summary rendered under the zone, e.g. "42 valid addresses". */
  summary?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Drag-and-drop plus click-to-browse for a single file.
 *
 * Kept free of parsing: it only decides whether the extension is acceptable
 * and hands the File up. That is what lets it be reused for any upload later
 * without dragging recipient-parsing logic along.
 */
export function FileDropzone({
  accept,
  onFileSelected,
  onCleared,
  fileName,
  summary,
  disabled = false,
  className,
}: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  // dragenter/dragleave fire for every child element, so a plain boolean
  // flickers as the pointer crosses inner nodes. Counting entries against
  // leaves keeps the highlight stable.
  const dragDepth = useRef(0);

  const isAccepted = useCallback(
    (file: File) => accept.some((ext) => file.name.toLowerCase().endsWith(ext)),
    [accept],
  );

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (file === undefined) return;
      if (!isAccepted(file)) {
        setRejected(`${file.name} is not a ${accept.join(' or ')} file`);
        return;
      }
      setRejected(null);
      onFileSelected(file);
    },
    [accept, isAccepted, onFileSelected],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (disabled) return;
    handleFile(event.dataTransfer.files[0]);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setIsDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className={cn(
          'rounded-xl border-2 border-dashed bg-muted/30 p-7 text-center transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-input hover:border-muted-foreground/40',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {fileName === undefined ? (
          <div className="flex flex-col items-center gap-2">
            <UploadCloud aria-hidden className="size-7 text-muted-foreground" />
            <div className="text-sm">
              <span className="font-medium">Drag and drop</span>
              <span className="text-muted-foreground"> your lead list here</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              Browse files
            </Button>
            <p className="text-xs text-muted-foreground">
              Accepts {accept.join(' and ')}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-left">
            <div className="flex min-w-0 items-center gap-2">
              <FileText aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">{fileName}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                if (inputRef.current !== null) inputRef.current.value = '';
                setRejected(null);
                onCleared?.();
              }}
            >
              <X aria-hidden />
              <span className="sr-only">Remove file</span>
            </Button>
          </div>
        )}

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            // Reset so re-picking the same file still fires a change event.
            event.target.value = '';
          }}
        />
      </div>

      {rejected !== null && (
        <p role="alert" className="text-xs text-destructive">
          {rejected}
        </p>
      )}
      {summary}
    </div>
  );
}
