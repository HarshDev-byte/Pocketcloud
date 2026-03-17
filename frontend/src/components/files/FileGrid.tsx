import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { FileItem, FolderItem } from '../../api/files.api';
import { FileCard } from './FileCard';

interface FileGridProps {
  folders: FolderItem[];
  files: FileItem[];
  onContextMenu: (e: React.MouseEvent, item: FileItem | FolderItem, isFolder: boolean) => void;
  onRename?: (item: FileItem | FolderItem, isFolder: boolean) => void;
  onFileOpen?: (file: FileItem) => void;
}

export function FileGrid({ folders, files, onContextMenu, onRename, onFileOpen }: FileGridProps) {
  const allItems = [...folders, ...files];

  // Use virtualization for large lists (>100 items)
  const shouldVirtualize = allItems.length > 100;

  if (shouldVirtualize) {
    return (
      <VirtualizedGrid
        folders={folders}
        files={files}
        onContextMenu={onContextMenu}
        onRename={onRename}
      />
    );
  }

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      }}
    >
      {folders.map((folder) => (
        <FileCard
          key={folder.id}
          item={folder}
          isFolder={true}
          onContextMenu={onContextMenu}
          onRename={onRename}
          onFileOpen={onFileOpen}
        />
      ))}
      {files.map((file) => (
        <FileCard
          key={file.id}
          item={file}
          isFolder={false}
          onContextMenu={onContextMenu}
          onRename={onRename}
          onFileOpen={onFileOpen}
        />
      ))}
    </div>
  );
}

function VirtualizedGrid({
  folders,
  files,
  onContextMenu,
  onRename,
  onFileOpen,
}: FileGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const allItems = [...folders, ...files];

  // Calculate columns based on container width
  const CARD_WIDTH = 160;
  const GAP = 16;
  const containerWidth = parentRef.current?.offsetWidth || 1000;
  const columns = Math.max(2, Math.floor((containerWidth + GAP) / (CARD_WIDTH + GAP)));

  // Calculate rows
  const rows = Math.ceil(allItems.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 240, // Estimated row height
    overscan: 2,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowItems = allItems.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(${columns}, 1fr)`,
                }}
              >
                {rowItems.map((item) => {
                  const isFolder = 'parent_id' in item;
                  return (
                    <FileCard
                      key={item.id}
                      item={item}
                      isFolder={isFolder}
                      onContextMenu={onContextMenu}
                      onRename={onRename}
                      onFileOpen={onFileOpen}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
