import { yen, type Book, type Entry } from '../lib/model'

export default function EntryRow({ book, entry, onClick, showDate }: { book: Book; entry: Entry; onClick: () => void; showDate?: boolean }) {
  const c = book.categories[entry.categoryId]
  return (
    <li>
      <button type="button" className="entry" onClick={onClick}>
        {showDate && <span className="entry-date">{entry.date.slice(5).replace('-', '/')}</span>}
        <span className="cat-dot" style={{ background: c?.color ?? '#999' }} />
        <span className="entry-cat">{c?.name ?? '(不明)'}</span>
        <span className="entry-memo">{entry.memo}</span>
        <span className={`entry-amt ${entry.kind}`}>
          {entry.kind === 'income' ? '+' : ''}
          {yen(entry.amount)}
        </span>
      </button>
    </li>
  )
}
