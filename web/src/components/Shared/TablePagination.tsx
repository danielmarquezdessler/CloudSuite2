import Inline from './Inline';
import SelectControl from './SelectControl';

export default function TablePagination({ total, visible, label, page, pageSize, onPageChange, onPageSizeChange }: { total: number; visible: number; label: string; page: number; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <footer className="cd-table-footer"><span>Mostrando {visible} de {total} {label}</span><Inline gap="sm" wrap><span>Filas por página</span><SelectControl ariaLabel={`Filas por página de ${label}`} label={String(pageSize)} value={String(pageSize)} options={[10, 25, 50].map((value) => ({ value: String(value), label: String(value) }))} onChange={(value) => { onPageSizeChange(Number(value)); onPageChange(0); }} /><button type="button" className="btn btn-sm btn-outline-primary" aria-label={`Página anterior de ${label}`} disabled={page === 0} onClick={() => onPageChange(page - 1)}>‹</button><span>Página {page + 1} de {pages}</span><button type="button" className="btn btn-sm btn-outline-primary" aria-label={`Página siguiente de ${label}`} disabled={page >= pages - 1} onClick={() => onPageChange(page + 1)}>›</button></Inline></footer>;
}
