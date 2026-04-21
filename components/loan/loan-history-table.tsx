import Link from 'next/link'

export type HistoryLoan = {
  id: string
  bookId: string
  bookTitle: string
  borrowerName: string
  lentDate: string
  returnedDate: string | null
}

export function LoanHistoryTable({
  loans,
  showBook = false,
  showBorrower = false,
}: {
  loans: HistoryLoan[]
  showBook?: boolean
  showBorrower?: boolean
}) {
  if (loans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No loans recorded yet.</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            {showBook ? (
              <th className="pb-2 pr-4 font-medium text-muted-foreground">Book</th>
            ) : null}
            {showBorrower ? (
              <th className="pb-2 pr-4 font-medium text-muted-foreground">Borrower</th>
            ) : null}
            <th className="pb-2 pr-4 font-medium text-muted-foreground">Lent</th>
            <th className="pb-2 font-medium text-muted-foreground">Returned</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.id} className="border-b last:border-0">
              {showBook ? (
                <td className="py-2 pr-4">
                  <Link href={`/books/${loan.bookId}`} className="hover:underline">
                    {loan.bookTitle}
                  </Link>
                </td>
              ) : null}
              {showBorrower ? (
                <td className="py-2 pr-4">{loan.borrowerName}</td>
              ) : null}
              <td className="py-2 pr-4">{loan.lentDate}</td>
              <td className="py-2">
                {loan.returnedDate ? (
                  loan.returnedDate
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Active
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
