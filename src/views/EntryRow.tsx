import { ledgerOf, type Book, type Entry } from '../lib/model'
import Money from './Money'

export default function EntryRow({ book, entry, onClick, showLedger }: { book: Book; entry: Entry; onClick: () => void; showLedger?: boolean }) {
  const c = book.categories[entry.categoryId]
  return (
    <li>
      <button type="button" className="entry" onClick={onClick}>
        {showLedger && <span className="entry-ledger">{book.ledgers[ledgerOf(entry)]?.name}</span>}
        <span className="cat-dot" style={{ background: c?.color ?? '#999' }} />
        <span className="entry-cat">{c?.name ?? '(不明)'}</span>
        <span className="entry-memo">{entry.memo}</span>
        <Money className="entry-amt" value={entry.amount} kind={entry.kind} />
      </button>
    </li>
  )
}
