import { ledgerOf, yen, type Book, type Entry } from '../lib/model'

export default function EntryRow({ book, entry, onClick, showLedger }: { book: Book; entry: Entry; onClick: () => void; showLedger?: boolean }) {
  const c = book.categories[entry.categoryId]
  return (
    <li>
      <button type="button" className="entry" onClick={onClick}>
        {showLedger && <span className="entry-ledger">{book.ledgers[ledgerOf(entry)]?.name}</span>}
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
